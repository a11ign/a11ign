/**
 * The CLI's flow interpreter — ADR 0038, "The rule layer logs in for itself".
 *
 * The rule layer (axe-core) loads the page in the CLI's OWN Playwright browser, so a login performed only inside the
 * worker's Edge would leave axe examining the login wall and reporting on it as the product. **This runs the same flow
 * in that browser, from the same environment, on the same machine, and never receives a session from the worker:**
 * exporting the worker's session would be clause 1's channel in the other direction, and there is deliberately no
 * parameter here through which a cookie could arrive FROM THE WORKER. **The one thing that carries cookies in is a saved
 * storage state the PERSON made (`signIn`'s `state`, ADR 0038 amendment 7): read from their own file by this process, loaded
 * over the same protocol calls the worker makes, and never sent anywhere.**
 *
 * It is a PORT of the interpreter in `a11ign/screenreader-worker`'s `src/auth-flow.mjs`, function for function and in the same
 * order, and the two are held equal by `interpreter.test.ts`, which drives one table of scenarios through both
 * over one fake browser. They are two copies because they cannot be one: the worker is plain `.mjs` with no build step
 * (ADR 0031) and is not a dependency of this package, and this package must not import it (`isolation-smoke.ts`).
 * The ADR calls the seam the DRIVER — two implementations of a small interface — and says the interpreter is written
 * once over it; the dependency graph makes "once per package" the honest reading, so the parity test is the lock.
 *
 * NEVER RECORDS A VALUE: an error or a mark names a step, a verb and an accessible name, and never what was typed.
 */
import { AuthError, type LoginFailureReason } from "./auth-faults.js";
import { assertLiteralIsNotSecret, STEP_MODIFIERS, type FlowStep, type PageCondition } from "./flows.js";
import { parseTotpSecret } from "./otpauth.js";
import type { StateCookie, StateEntries } from "./scrub.js";
import {
  runLoop, type Action, type Branch, type LoopOptions, type LoopResult, type ScreenControl, type ScreenObservation, type FieldSource,
} from "./screen-loop.js";
import { codeForUse } from "./totp.js";

/** How long a control may take to appear before it is `unbindable-field`. A bound, never a sleep. */
export const BIND_TIMEOUT_MS = 10_000;
const POLL_MS = 150;
const MS_PER_SECOND = 1000;

export interface AxNode {
  id: string;
  role: string;
  name: string;
  parentId?: string;
  backendId?: number;
  ignored: boolean;
}

/**
 * What the interpreter needs from a browser. Handles are opaque to it. The worker's implementation speaks the browser
 * protocol on its own DevTools port; this package's speaks it through a Playwright CDP session.
 */
export interface AuthDriver {
  navigate(url: string): Promise<{ ok: boolean; error?: string }>;
  origin(): Promise<string>;
  /**
   * The page's full address. **Optional**: a driver without it cannot say whether the page is already the requested one, so the
   * requested page is always loaded (`loadRequestedPage`). A flow that declares an identity provider needs it to keep the session.
   */
  url?(): Promise<string>;
  axNodes(): Promise<AxNode[]>;
  /** The `src` of every iframe the page RENDERS in its main document (`FRAME_SOURCES_EXPRESSION`); a frame that is hidden is not one. */
  frameSources(): Promise<string[]>;
  inputType(handle: number): Promise<string>;
  fill(handle: number, text: string): Promise<void>;
  choose(handle: number, option: string): Promise<boolean>;
  isChecked(handle: number): Promise<boolean>;
  click(handle: number): Promise<void>;
  /** `Network.setCookies`, for a saved state's cookies. Before any navigation, so the first request carries them. */
  setCookies(cookies: readonly StateCookie[]): Promise<void>;
  /** The current document's `localStorage`, set by `SET_LOCAL_STORAGE_FUNCTION` handed the entries as DATA. */
  setLocalStorage(entries: readonly { name: string; value: string }[]): Promise<void>;
  close(): Promise<void>;
}

/**
 * The login, then the flow replayed to a capture point. **`state` marks a run that loads a saved storage state instead of
 * logging in** (`--auth-state`): its `path` is the whole of what crosses the wire, and the login's steps are then skipped
 * except its final `expect:`.
 */
export interface AuthPlan {
  readonly login: readonly FlowStep[];
  /** What an `auto: true` step needs to type for itself: the NAMES of environment variables, never a value. Absent: an `auto:` step cannot run. */
  readonly auto?: AutoSettings;
  readonly flow?: readonly FlowStep[];
  readonly upTo?: number;
  readonly state?: { readonly path: string };
  /** The flows file's `idp-origins:` (exact origins, never the app's own): the pages a LOGIN may be on besides the app's. Absent means none. */
  readonly idpOrigins?: readonly string[];
}

/**
 * What the screen loop may type, as NAMES. `username` and `password` are required once a plan has an `auto:` step; `totp` is
 * optional because without a seed a code screen ends the login as `mfa-required-no-seed`, which is the outcome a person needs.
 */
export interface AutoSettings {
  readonly username: string;
  readonly password: string;
  readonly totp?: string;
  /** The name an organization picker is answered with: a name from the flow, not a secret. */
  readonly organization?: string;
}

/** How the loop is paced. Injected so a test need not wait out `POLL_MILLIS`, and so a one-time code is made from the same clock. */
export type LoopPacing = Pick<LoopOptions, "pause" | "now" | "budgetMillis">;

/** One `auto:` step may spend this long across every screen it meets: a bound, as `expect`'s timeout is, and never a sleep. */
export const AUTO_BUDGET_MS = 60_000;

export type Environment = Readonly<Record<string, string | undefined>>;
export type Mark = (event: string, detail: Record<string, unknown>) => void;

/** `auth-login-failed`, carrying its reason: the step, the verb, and never a value. */
export class LoginFailedError extends AuthError {
  readonly reason: LoginFailureReason;
  readonly where: string;
  /** The fact, without the advice: a saved-state run states the same fact and gives different advice. */
  readonly detail: string;
  constructor(reason: LoginFailureReason, where: string, detail: string, advice?: string) {
    super("auth-login-failed", `the login did not complete (${reason}) at ${where}: ${detail}${advice ? `. ${advice}` : ""}`);
    this.name = "LoginFailedError";
    this.reason = reason;
    this.where = where;
    this.detail = detail;
  }
}

/**
 * The ONE page-side read a challenge check needs, as a fixed string handed to `Runtime.evaluate` / `page.evaluate` and never
 * built from anything a flow says. It lists the `src` of the iframes the main document RENDERS: `display: none` (no client
 * rects) and `visibility: hidden` are dropped, because a frame nobody can see is not a challenge in front of the user, and
 * reCAPTCHA parks its hidden challenge frame on every page that carries a widget. The accessibility tree cannot answer this
 * (measured 2026-09-26: an `Iframe` node carries only the iframe's `title`, which no vendor documents, and no `src`).
 */
export const FRAME_SOURCES_EXPRESSION = "Array.from(document.querySelectorAll('iframe'))"
  + ".filter((f) => f.getClientRects().length > 0 && getComputedStyle(f).visibility !== 'hidden').map((f) => f.src)";

const FILL_ROLES = ["textbox", "searchbox", "combobox", "spinbutton"];
const CHECK_ROLES = ["checkbox", "radio", "switch", "menuitemcheckbox", "menuitemradio"];
const CHOOSE_ROLES = ["combobox", "listbox"];
const PRESS_ROLES = ["button", "link", "menuitem", "menuitemcheckbox", "menuitemradio", "tab", "treeitem", "switch",
  "checkbox", "radio", "option"];

export const normalise = (text: unknown): string => String(text ?? "").replace(/\s+/g, " ").trim();

export function controlsNamed(nodes: readonly AxNode[], { roles, name, within }: { roles: string[]; name: string; within?: string }): AxNode[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const wanted = normalise(name);
  const inside = (node: AxNode): boolean => {
    if (within === undefined) return true;
    for (let up = node.parentId ? byId.get(node.parentId) : undefined; up; up = up.parentId ? byId.get(up.parentId) : undefined) {
      if (normalise(up.name) === normalise(within)) return true;
    }
    return false;
  };
  return nodes.filter((node) => !node.ignored && roles.includes(node.role) && normalise(node.name) === wanted && inside(node));
}

export function expectationMet(nodes: readonly AxNode[], { kind, name }: { kind: "heading" | "control" | "text"; name: string }): boolean {
  const wanted = normalise(name);
  const live = nodes.filter((node) => !node.ignored);
  if (kind === "heading") return live.some((node) => node.role === "heading" && normalise(node.name) === wanted);
  if (kind === "control") {
    const roles = [...FILL_ROLES, ...CHECK_ROLES, ...PRESS_ROLES];
    return live.some((node) => roles.includes(node.role) && normalise(node.name) === wanted);
  }
  return live.some((node) => normalise(node.name).includes(wanted));
}

/**
 * The CAPTCHA vendor whose widget one of these iframe sources is, or undefined. **The hosts are the vendors' own, from the
 * Content-Security-Policy pages they publish for the `frame-src` a widget needs, read 2026-09-26 (none of the three pages
 * shows a date):**
 *  - reCAPTCHA, https://developers.google.com/recaptcha/docs/faq: `frame-src https://www.google.com/recaptcha/
 *    https://recaptcha.google.com/recaptcha/`.
 *  - hCaptcha, https://docs.hcaptcha.com/: `frame-src https://hcaptcha.com https://*.hcaptcha.com` (it warns that the asset
 *    subdomains vary, so the match is the domain and every subdomain).
 *  - Cloudflare Turnstile, https://developers.cloudflare.com/turnstile/reference/content-security-policy/: `frame-src
 *    https://challenges.cloudflare.com`.
 * Not matched, and so not named: `recaptcha.net`, Arkose, GeeTest, Friendly Captcha, and any challenge a site serves from
 * its own origin. **What is documented is where the frame comes from; what the frame is TITLED is not documented by any of
 * the three, which is why the title is not read.** Whether the widget is a challenge or a v3 badge is not knowable from here.
 */
export function challengeVendor(sources: readonly string[]): string | undefined {
  for (const source of sources) {
    let url: URL;
    try { url = new URL(source); } catch { continue; } // an iframe with no src is "" and has nothing to match
    if (url.protocol !== "https:") continue;
    const host = url.hostname.toLowerCase();
    if ((host === "www.google.com" || host === "recaptcha.google.com") && url.pathname.startsWith("/recaptcha/")) return "reCAPTCHA";
    if (host === "hcaptcha.com" || host.endsWith(".hcaptcha.com")) return "hCaptcha";
    if (host === "challenges.cloudflare.com") return "Cloudflare Turnstile";
  }
  return undefined;
}

/** The value of a variable, or `auth-credential-missing` naming the variable and never a value. */
export function readCredential(name: string, env: Environment): string {
  const value = env[name];
  if (typeof value === "string" && value !== "") return value;
  throw new AuthError("auth-credential-missing",
    `${name} is not set, or is empty, in the environment of the machine that drives the browser`);
}

/** Every environment-variable NAME a plan reads, so a missing one is found before any browser opens. */
export function requiredEnvNames(plan: AuthPlan): string[] {
  const flow = (plan.flow ?? []).slice(0, plan.upTo ?? plan.flow?.length ?? 0);
  // A state run never executes the login's steps (only its final `expect:`), so it reads none of the login's variables.
  const steps = plan.state === undefined ? [...plan.login, ...flow] : flow;
  const names = steps.flatMap((step) => ("fill" in step && step.fill.fromEnv !== undefined ? [step.fill.fromEnv] : []));
  // The loop types the username and the password itself; the seed is read only when a code screen appears, so it is not required here.
  const loopNames = steps.some((step) => "auto" in step) && plan.auto !== undefined ? [plan.auto.username, plan.auto.password] : [];
  return [...new Set([...names, ...loopNames])];
}

export function assertCredentialsPresent(plan: AuthPlan, env: Environment): void {
  for (const name of requiredEnvNames(plan)) readCredential(name, env);
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const REAL_PACING: LoopPacing = { pause: sleep, now: Date.now, budgetMillis: AUTO_BUDGET_MS };

/** Poll until `attempt` returns something other than undefined, or the bound passes: a wait for a CONDITION, never a sleep. */
async function until<T>(attempt: () => Promise<T | undefined>, boundMs: number): Promise<T | undefined> {
  const deadline = Date.now() + boundMs;
  for (;;) {
    const found = await attempt();
    if (found !== undefined || Date.now() >= deadline) return found;
    await sleep(POLL_MS);
  }
}

/**
 * Bind ONE control by accessible name: exactly one match, or `nth` picks among several, or it is unbindable — which on
 * a login is the end of the run, because nothing after it can be examined, and a real 4.1.2 failure of the page.
 */
async function bindControl(
  driver: AuthDriver, query: { roles: string[]; name: string; within?: string; nth?: number }, where: string, boundMs: number,
): Promise<number> {
  let seen: AxNode[] = [];
  const found = await until(async () => {
    seen = controlsNamed(await driver.axNodes(), query);
    const pick = query.nth === undefined ? (seen.length === 1 ? seen[0] : undefined) : seen[query.nth - 1];
    return pick?.backendId;
  }, boundMs);
  if (found !== undefined) return found;
  if (seen.length === 0) {
    throw await explainFailure(driver, "unbindable-field", where, `no control is named "${query.name}". A control the script cannot `
      + "address by accessible name is one a screen-reader user cannot address either; that is a 4.1.2 finding about the page.");
  }
  throw new LoginFailedError("unbindable-field", where, `${seen.length} controls are named "${query.name}"; say which with within or nth. `
    + "A control the script cannot address by accessible name is one a screen-reader user cannot address either; that is a 4.1.2 finding about the page.");
}

/**
 * A step that FAILED, explained (#2564): a CAPTCHA widget rendered on the page that failed it is `auth-challenge-detected`,
 * and anything else is the login failure it was going to be. **This runs only where a step has already failed, never on a
 * success**, so a dashboard that carries a reCAPTCHA v3 badge still passes its `expect:`; the price is that a step which
 * failed for an unrelated reason on a page that also carries a widget is reported as the challenge, said in the sentence.
 * It NAMES the challenge and does nothing to it: nothing here clicks, waits out or works around one. A read that fails
 * (the page navigating under it) leaves the original failure standing, with the reason it could not look in its detail.
 */
async function explainFailure(driver: AuthDriver, reason: LoginFailureReason, where: string, detail: string): Promise<AuthError> {
  let vendor: string | undefined;
  try {
    vendor = challengeVendor(await driver.frameSources());
  } catch (error) {
    return new LoginFailedError(reason, where, `${detail} (the page's frames could not be read to check for a CAPTCHA: ${error instanceof Error ? error.message : String(error)})`);
  }
  if (vendor === undefined) return new LoginFailedError(reason, where, detail);
  return new AuthError("auth-challenge-detected", `the login stopped at ${where}, and a widget from ${vendor} is on the page. This run names a CAPTCHA `
    + "and never answers one: it is there to stop automated sign-ins, and nothing here will click it, wait it out or work around it. "
    + `The step failed as ${reason}: ${detail}`);
}

/** How long the page may take to settle enough to be asked where it is. A bound on a wait for a condition. */
const ORIGIN_SETTLE_MS = 5_000;

/**
 * Where the page is NOW. A click that starts a navigation destroys the document under the question, and the browser
 * answers that with an error rather than a value; that is "not yet", so it is asked again until it answers or the bound
 * passes. The last error is then the reason, not a guess.
 */
async function currentOrigin(driver: AuthDriver): Promise<string> {
  let last: unknown;
  const found = await until(async () => {
    try { return await driver.origin(); } catch (error) { last = error; return undefined; }
  }, ORIGIN_SETTLE_MS);
  if (found === undefined) throw new Error("the page would not say where it is", { cause: last });
  return found;
}

/**
 * Is the page the login wall? ALL of the controls the login FILLS are on it, found by accessible name. The flow's final
 * `expect:` is the wrong signal: it holds on the dashboard and on no other page, so re-checking it on `/settings` would
 * end healthy runs. A page with ONE control named like ONE login field (a "Password" box on a change-password page) is
 * not the wall, and a login that fills nothing has no form to recognise, so it never is (`[].every` would say yes).
 */
export function landedOnLoginForm(nodes: readonly AxNode[], login: readonly FlowStep[]): boolean {
  const fields = login.flatMap((step) => ("fill" in step ? [step.fill] : []));
  return fields.length > 0 && fields.every(({ field, within }) => controlsNamed(nodes, { roles: FILL_ROLES, name: field, within }).length > 0);
}

/**
 * A successful login followed by the login form on the page the run asked for: the session did not hold, or the page
 * bounced or rendered the wall in place. Nothing else names it — a same-origin redirect ends as `wrong-page`, and a wall
 * rendered in place is captured as the page. Reads the main frame's accessibility tree only, so a form in an iframe is
 * not seen (ADR 0038's fault list).
 */
async function assertNotShownLoginWall(driver: AuthDriver, login: readonly FlowStep[]): Promise<void> {
  if (!landedOnLoginForm(await driver.axNodes(), login)) return;
  const names = login.flatMap((step) => ("fill" in step ? [`"${step.fill.field}"`] : []));
  throw new AuthError("auth-session-lost", "the login succeeded, and then the requested page showed the login form: every field the "
    + `login fills (${[...new Set(names)].join(", ")}) is on the page the run landed on. The session did not hold, so this page was `
    + "not examined as the product.");
}

/**
 * The page must be on the pinned origin, or on one of `allowed`: the identity-provider origins the flow declared, passed ONLY while
 * the login is between its steps (`allowedOrigins`). An origin not named there ends `left-origin` with the sentence it always had,
 * so a flow that declares no IdP is held exactly as before.
 */
async function assertStillOnOrigin(driver: AuthDriver, origin: string, where: string, allowed: readonly string[] = []): Promise<void> {
  const now = await currentOrigin(driver);
  if (now !== origin && !allowed.includes(now)) {
    throw new LoginFailedError("left-origin", where, `the page is on ${now}, not ${origin}`,
      "A redirect to an identity provider this flow does not declare ends the run: declare its origin under idp-origins: in the flows file "
      + "if it signs in with a form. SSO beyond that is not supported: use a dedicated test account without MFA or SSO.");
  }
}

interface RunContext {
  steps: readonly FlowStep[];
  origin: string;
  driver: AuthDriver;
  env: Environment;
  mark: Mark;
  phase: "login" | "flow";
  bindTimeoutMs: number;
  idpOrigins: readonly string[];
  auto?: AutoSettings;
  pacing: LoopPacing;
}

/**
 * The origins besides the app's that the page may be on AFTER this step. Only a login's steps before its last: that last is
 * the `expect:` the flows rules guarantee, and a login that ends parked on the identity provider has not signed anyone in to the
 * app. The flow that follows the login gets none, so the allowance ends with the login.
 */
function allowedOrigins(run: RunContext, index: number): readonly string[] {
  return run.phase === "login" && index < run.steps.length ? run.idpOrigins : [];
}

/** The step's verb: the one key that is not a modifier, so `when:` written first does not become the verb. */
const verbOf = (step: FlowStep): string => Object.keys(step).find((key) => !(STEP_MODIFIERS as readonly string[]).includes(key)) as string;

interface BindingQuery { roles: string[]; name: string; within?: string; nth?: number }

/** The control a step acts on, for the verbs that bind one. `goto`, `expect`, `capture` and `auto` have none. */
function bindingQuery(step: FlowStep): BindingQuery | undefined {
  if ("fill" in step) return { roles: FILL_ROLES, name: step.fill.field, within: step.fill.within, nth: step.fill.nth };
  if ("choose" in step) return { roles: CHOOSE_ROLES, name: step.choose.field, within: step.choose.within, nth: step.choose.nth };
  if ("check" in step) return { roles: CHECK_ROLES, name: step.check.field, within: step.check.within, nth: step.check.nth };
  const target = "press" in step ? step.press : "dismiss-if-shown" in step ? step["dismiss-if-shown"] : undefined;
  return target && { roles: PRESS_ROLES, name: target.control, within: target.within, nth: target.nth };
}

/** Is the control on the page now? An unqualified name that two controls share is present: binding it then says "ambiguous", not "absent". */
const controlPresent = (nodes: readonly AxNode[], query: BindingQuery): boolean => {
  const found = controlsNamed(nodes, query).length;
  return query.nth === undefined ? found > 0 : found >= query.nth;
};

/**
 * Why a step does not run, or undefined when it does. **`when:` and `dismiss-if-shown:` read the page ONCE** and never wait:
 * a skipped step costs one read. `optional:` waits as long as a bind would, because a control that is about to render is not
 * absent yet, and it skips ONLY when no control of that name ever appeared; two of them is still the ambiguity error, and an
 * `expect:` has no `optional:` effect at all, since "its target never appeared" is exactly the timeout that must fail.
 */
async function skipReason(step: FlowStep, run: RunContext): Promise<"when" | "optional" | "not-shown" | undefined> {
  const query = bindingQuery(step);
  if (step.when !== undefined && !expectationMet(await run.driver.axNodes(), step.when)) return "when";
  if ("dismiss-if-shown" in step) return controlPresent(await run.driver.axNodes(), query as BindingQuery) ? undefined : "not-shown";
  if (step.optional !== true || query === undefined) return undefined;
  const appeared = await until(async () => (controlPresent(await run.driver.axNodes(), query) ? true : undefined), run.bindTimeoutMs);
  return appeared ? undefined : "optional";
}

async function runFill(step: Extract<FlowStep, { fill: unknown }>, run: RunContext, { where, index }: { where: string; index: number }): Promise<void> {
  // Only a flow that declares an identity provider can have a fill meet a page that is not the app's, and then it is asked BEFORE
  // typing: the last check was after the previous step, and a page can move on its own since. Nothing is typed into an undeclared origin.
  if (run.idpOrigins.length > 0) await assertStillOnOrigin(run.driver, run.origin, where, allowedOrigins(run, index));
  const { field, within, nth } = step.fill;
  const handle = await bindControl(run.driver, { roles: FILL_ROLES, name: field, within, nth }, where, run.bindTimeoutMs);
  const text = step.fill.fromEnv === undefined ? String(step.fill.value) : readCredential(step.fill.fromEnv, run.env);
  assertLiteralIsNotSecret(step, { inputType: await run.driver.inputType(handle) });
  await run.driver.fill(handle, text);
}

async function runStep(step: FlowStep, run: RunContext, { where, index }: { where: string; index: number }): Promise<void> {
  const { driver, origin, bindTimeoutMs } = run;
  if ("goto" in step) {
    const result = await driver.navigate(new URL(step.goto, origin).href);
    if (!result.ok) throw new LoginFailedError("expect-not-met", where, `${step.goto} could not be loaded (${result.error ?? "no reason given"})`);
  } else if ("fill" in step) {
    await runFill(step, run, { where, index });
  } else if ("choose" in step) {
    const handle = await bindControl(driver, bindingQuery(step) as BindingQuery, where, bindTimeoutMs);
    if (!await driver.choose(handle, step.choose.option)) {
      throw new LoginFailedError("unbindable-field", where, `"${step.choose.field}" has no option "${step.choose.option}"`);
    }
  } else if ("check" in step) {
    const handle = await bindControl(driver, bindingQuery(step) as BindingQuery, where, bindTimeoutMs);
    if (await driver.isChecked(handle) !== step.check.checked) await driver.click(handle);
  } else if ("press" in step || "dismiss-if-shown" in step) {
    await driver.click(await bindControl(driver, bindingQuery(step) as BindingQuery, where, bindTimeoutMs));
  } else if ("expect" in step) {
    await expectMet(step.expect, run, { where, index });
  } else if ("auto" in step) {
    await runAuto(run, { where, index });
  }
}

async function expectMet(
  expected: { kind: "heading" | "control" | "text"; name: string; timeoutSeconds: number }, run: RunContext, { where, index }: { where: string; index: number },
): Promise<void> {
  const met = await until(async () => (expectationMet(await run.driver.axNodes(), expected) ? true : undefined),
    expected.timeoutSeconds * MS_PER_SECOND);
  if (!met) throw await explainFailure(run.driver, "expect-not-met", where, `no ${expected.kind} "${expected.name}" appeared within ${expected.timeoutSeconds} s`);
  // A heading on another site is not this site's dashboard: the condition is met only on the pinned origin. A declared identity
  // provider counts for an `expect:` in the middle of a login (its page is where the next step happens), and never for the last.
  await assertStillOnOrigin(run.driver, run.origin, where, allowedOrigins(run, index));
}

/** The step's accessible NAME for a mark, never a value. */
function nameForMark(step: FlowStep): string | undefined {
  const body = (step as Record<string, unknown>)[verbOf(step)] as string | boolean | { field?: string; control?: string; name?: string };
  return typeof body === "string" || typeof body === "boolean" ? undefined : body.field ?? body.control ?? body.name;
}

/** What the loop sees of a page: interactive controls and alerts by accessible name, headings apart, and whether the next `expect:` holds. */
const SCREEN_ROLES = new Set([...FILL_ROLES, ...CHECK_ROLES, ...PRESS_ROLES, "password", "alert"]);

/**
 * The text an unnamed alert shows. An alert takes no name from its content, so its words sit on the text nodes beneath it (measured
 * 2026-10-11 on the cross-origin fixture: `alert ""` with a `StaticText "Wrong email or password."` child), and without them a
 * rejected credential reads as an ordinary form. The CLI's `screenOf` reads the page the same way, from this function.
 */
export function textUnder(parent: AxNode, nodes: readonly AxNode[]): string {
  const children = nodes.filter((node) => node.parentId === parent.id && !node.ignored);
  return children.map((child) => (child.role === "StaticText" ? child.name : textUnder(child, nodes))).join(" ");
}

export async function observeScreen(driver: AuthDriver, stop: PageCondition): Promise<ScreenObservation> {
  const nodes = await driver.axNodes();
  const named = nodes.map((node) => (node.role === "alert" && normalise(node.name) === "" ? { ...node, name: textUnder(node, nodes) } : node));
  const live = named.filter((node) => !node.ignored && normalise(node.name) !== "");
  return {
    controls: live.filter((node) => SCREEN_ROLES.has(node.role)).map((node) => ({ role: node.role, name: normalise(node.name) })),
    headings: live.filter((node) => node.role === "heading").map((node) => normalise(node.name)),
    signedIn: expectationMet(nodes, stop),
  };
}

/** The value a field's source names. A code is made now, from the seed, and is never held; a missing seed ends the login before this is reached. */
async function valueFor(source: FieldSource, action: Extract<Action, { kind: "type" }>, run: RunContext): Promise<string> {
  const settings = run.auto as AutoSettings;
  if (source === "identifier") return readCredential(settings.username, run.env);
  if (source === "password") return readCredential(settings.password, run.env);
  if (source === "organization") return String(action.organization);
  const secret = parseTotpSecret(readCredential(settings.totp as string, run.env));
  return codeForUse(secret.seed, run.pacing.now, run.pacing.pause, secret);
}

const clickNamed = async (control: ScreenControl, run: RunContext, where: string): Promise<void> =>
  run.driver.click(await bindControl(run.driver, { roles: PRESS_ROLES, name: control.name }, where, run.bindTimeoutMs));

/** Type into each field the loop named and press its submit. With no submit button there is nothing the driver can press, so it ends rather than guess. */
async function typeScreen(action: Extract<Action, { kind: "type" }>, run: RunContext, where: string): Promise<void> {
  for (const field of action.fields) {
    const handle = await bindControl(run.driver, { roles: FILL_ROLES, name: field.target.name }, where, run.bindTimeoutMs);
    await run.driver.fill(handle, await valueFor(field.source, action, run));
  }
  if (action.submit === undefined) {
    throw new LoginFailedError("unbindable-field", where, "the screen has no button to submit it with, and nothing here presses a key");
  }
  await clickNamed(action.submit, run, where);
}

/** One action of the loop, after the origin is checked: **nothing is typed or pressed on a page that is not the app's or a declared provider's**. */
async function actOnScreen(action: Action, run: RunContext, { where, index }: { where: string; index: number }): Promise<void> {
  if (action.kind === "stop") return;
  await assertStillOnOrigin(run.driver, run.origin, where, allowedOrigins(run, index));
  if (action.kind === "type") await typeScreen(action, run, where);
  else await clickNamed(action.target, run, where);
}

/** An ended loop as the fault the login ends with: the outcome, its remedy, and for an unrecognised screen the step that would handle it. */
function loopEnded(result: LoopResult, where: string): AuthError {
  return new AuthError("auth-login-failed", `the login did not complete (${result.outcome}) at ${where}: ${result.remedy ?? "the loop ended"}`
    + (result.flowsStep === undefined ? "" : ` ${result.flowsStep}`));
}

/**
 * A branch as the loop's mark carries it: what the screen showed, and the re-observations written on the branch the loop acted on
 * (#5690). `lastSeen` is carried only where the loop wrote it, so a branch whose screen was never seen again has none.
 */
const markedBranch = ({ screen, kind, alerts, controls, reobserved, lastSeen }: Branch): Record<string, unknown> => ({
  screen, kind, alerts, controls, reobserved, ...(lastSeen && { lastSeen }),
});

/**
 * `auto: true`: the built-in loop takes the screen until the `expect:` that follows it holds (the flows rules guarantee one
 * does), then the flow resumes at that `expect:`, which still runs, so a loop that stopped early is not believed. The loop
 * has no secret of its own: it names where a value comes from and this file supplies it at the moment of typing.
 */
async function runAuto(run: RunContext, { where, index }: { where: string; index: number }): Promise<void> {
  const next = run.steps[index];
  if (run.auto === undefined || next === undefined || !("expect" in next)) {
    throw new AuthError("auth-login-failed", `the login did not complete at ${where}: auto: needs the loop's credential variables and an expect: after it`);
  }
  const { totp } = run.auto;
  const result = await runLoop({
    observe: () => observeScreen(run.driver, next.expect),
    act: (action) => actOnScreen(action, run, { where, index }),
    ...run.pacing,
    config: { organization: run.auto.organization, totpSeedConfigured: totp !== undefined && (run.env[totp] ?? "") !== "" },
  });
  run.mark("authLoop", { phase: run.phase, index, outcome: result.outcome, branches: result.branches.map(markedBranch) });
  if (result.outcome !== "signed-in") throw loopEnded(result, where);
}

/** One step, numbered as a person counts: marked by verb and accessible name only, with the origin re-checked after any step that can move the page. */
async function runNumbered(step: FlowStep, index: number, run: RunContext): Promise<void> {
  const verb = verbOf(step);
  const where = `${run.phase} step ${index} (${verb})`;
  if (verb === "capture") return; // a capture point is where the caller stops; it acts on nothing
  const skipped = await skipReason(step, run);
  if (skipped !== undefined) return run.mark("authStepSkipped", { phase: run.phase, index, verb, name: nameForMark(step), because: skipped });
  run.mark("authStep", { phase: run.phase, index, verb, name: nameForMark(step) });
  await runStep(step, run, { where, index });
  if (verb !== "expect") await assertStillOnOrigin(run.driver, run.origin, where, allowedOrigins(run, index));
}

/** Run steps in order, marking each by verb and accessible name only, and re-checking the origin after every step that can move the page. */
export async function runSteps(run: RunContext): Promise<void> {
  for (const [index, step] of run.steps.entries()) await runNumbered(step, index + 1, run);
}

/**
 * The fixed function a saved state's `localStorage` is set by (ADR 0038, amendment 7, choice 3), handed the entries as DATA
 * (`Runtime.callFunctionOn`'s `arguments`): nothing in the file is ever spliced into script text. The worker's copy is pinned
 * equal by `interpreter.test.ts`.
 */
export const SET_LOCAL_STORAGE_FUNCTION = `function (entries) {
  for (const entry of entries) localStorage.setItem(entry.name, entry.value);
}`;

/**
 * A state cookie as `Network.setCookies` takes it. `path` defaults to `/` (a cookie needs one and a hand-edited file may omit
 * it); a session cookie's `expires` of `-1` is left off, as Playwright's own loader does. The worker's copy is pinned equal
 * by `interpreter.test.ts`.
 */
export function cookieParam(cookie: StateCookie): Record<string, unknown> {
  return {
    name: cookie.name, value: cookie.value, domain: cookie.domain, path: cookie.path ?? "/",
    ...(typeof cookie.expires === "number" && cookie.expires > 0 ? { expires: cookie.expires } : {}),
    ...(cookie.httpOnly === undefined ? {} : { httpOnly: cookie.httpOnly }),
    ...(cookie.secure === undefined ? {} : { secure: cookie.secure }),
    ...(cookie.sameSite === undefined ? {} : { sameSite: cookie.sameSite }),
  };
}

/** The saved state, in the browser: cookies first (the first request carries them), then the requested page, the origin's `localStorage`, and a reload. */
async function loadState(state: StateEntries, { url, driver, mark }: { url: string; driver: AuthDriver; mark: Mark }): Promise<void> {
  const load = async (): Promise<void> => {
    const loaded = await driver.navigate(url);
    if (!loaded.ok) throw new LoginFailedError("expect-not-met", "loading the saved state", `${url} could not be loaded (${loaded.error ?? "no reason given"})`);
  };
  await driver.setCookies(state.cookies);
  await load(); // `localStorage` needs a document on the origin to be set on
  await driver.setLocalStorage(state.localStorage);
  await load(); // and the page must read it, which it did not at its first load
  mark("authStateLoaded", { cookies: state.cookies.length, localStorage: state.localStorage.length });
}

/**
 * A saved state that did not sign the run in: the login's final `expect:` was not met on the requested page, or the page is
 * not on the pinned origin (an expired single-sign-on session redirects to the identity provider). **The same fact the form
 * login reports as `expect-not-met` or `left-origin`, with different advice**, because there was no login to fail.
 */
function stateExpired(error: LoginFailedError): AuthError {
  return new AuthError("auth-state-expired", `the saved state did not sign the run in (${error.where}): ${error.detail}`);
}

/**
 * The state stands in for the sign-in: it is loaded, and then the login's FINAL step (its `expect:`, which the flows rules
 * guarantee is last) runs on the page the run requested. The login's other steps never run: against a valid state the login
 * page has redirected away, and a `fill` on it would end `unbindable-field`, a failure of the mechanism and not of the page.
 * A CAPTCHA widget on the page still ends `auth-challenge-detected`, since that names a different cause.
 */
async function signInFromState(state: StateEntries, run: RunContext, url: string): Promise<void> {
  await loadState(state, { url, driver: run.driver, mark: run.mark });
  try {
    await runNumbered(run.steps[run.steps.length - 1], run.steps.length, run);
  } catch (error) {
    if (error instanceof LoginFailedError && (error.reason === "expect-not-met" || error.reason === "left-origin")) throw stateExpired(error);
    throw error;
  }
}

/**
 * The requested page, loaded once the login and flow have run. **A flow that declares an identity provider and ends ON the requested
 * page does not load it again**: the token such a login yields can live only in the page's memory, and a load discards it (measured
 * 2026-10-08 in Chromium on the #4086 fixture: the reload reads `Sign in`, the page left alone reads `Account`). Every other run loads
 * it, as before; so does a driver that cannot say where the page is.
 */
async function loadRequestedPage({ driver, url, idpOrigins }: { driver: AuthDriver; url: string; idpOrigins: readonly string[] }): Promise<void> {
  if (idpOrigins.length > 0 && driver.url !== undefined && new URL(await driver.url()).href === new URL(url).href) return;
  const landed = await driver.navigate(url);
  if (!landed.ok) throw new LoginFailedError("expect-not-met", "the requested page", `${url} could not be loaded after the login (${landed.error ?? "no reason given"})`);
}

/**
 * The whole sign-in: the login, then the flow to its capture point, then the requested page. Returns only once the
 * requested page has loaded on the pinned origin; anything less throws, so "signed in" is never claimed early.
 *
 * **With `state` (and `plan.state` naming its file) the saved state signs in instead of the login's steps**: `signInFromState`.
 */
export async function signIn(
  { plan, url, driver, env, mark, bindTimeoutMs = BIND_TIMEOUT_MS, state, pacing = REAL_PACING }:
  { plan: AuthPlan; url: string; driver: AuthDriver; env: Environment; mark: Mark; bindTimeoutMs?: number; state?: StateEntries; pacing?: LoopPacing },
): Promise<void> {
  if ((plan.state === undefined) !== (state === undefined)) throw new Error("a plan that names a saved state needs its entries, and entries need a plan that names one");
  const origin = new URL(url).origin;
  const flow = (plan.flow ?? []).slice(0, plan.upTo ?? plan.flow?.length ?? 0);
  const run = (steps: readonly FlowStep[], phase: RunContext["phase"]): RunContext => ({ steps, origin, driver, env, mark, phase, bindTimeoutMs, idpOrigins: plan.idpOrigins ?? [], auto: plan.auto, pacing });
  if (state === undefined) await runSteps(run(plan.login, "login"));
  else await signInFromState(state, run(plan.login, "login"), url);
  await runSteps(run(flow, "flow"));
  await loadRequestedPage({ driver, url, idpOrigins: state === undefined ? plan.idpOrigins ?? [] : [] }); // a saved state signs in on the page's own load
  await assertStillOnOrigin(driver, origin, "the requested page");
  await assertNotShownLoginWall(driver, plan.login);
  mark("authApplied", { steps: (state === undefined ? plan.login.length : 1) + flow.length });
}
