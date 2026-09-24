/**
 * The CLI's flow interpreter — ADR 0038, "The rule layer logs in for itself".
 *
 * The rule layer (axe-core) loads the page in the CLI's OWN Playwright browser, so a login performed only inside the
 * worker's Edge would leave axe examining the login wall and reporting on it as the product. **This runs the same flow
 * in that browser, from the same environment, on the same machine, and never receives a session from the worker:**
 * exporting the worker's session would be clause 1's channel in the other direction, and there is deliberately no
 * parameter here through which a cookie could arrive.
 *
 * It is a PORT of `packages/nvda-worker/src/auth-flow.mjs`'s interpreter, function for function and in the same
 * order, and the two are held equal by `interpreter-parity.test.ts`, which drives one table of scenarios through both
 * over one fake browser. They are two copies because they cannot be one: the worker is plain `.mjs` with no build step
 * (ADR 0031) and is not a dependency of this package, and this package must not import it (`isolation-smoke.mjs`).
 * The ADR calls the seam the DRIVER — two implementations of a small interface — and says the interpreter is written
 * once over it; the dependency graph makes "once per package" the honest reading, so the parity test is the lock.
 *
 * NEVER RECORDS A VALUE: an error or a mark names a step, a verb and an accessible name, and never what was typed.
 */
import { AuthError, type LoginFailureReason } from "./auth-faults.js";
import { assertLiteralIsNotSecret, type FlowStep } from "./flows.js";

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
  axNodes(): Promise<AxNode[]>;
  inputType(handle: number): Promise<string>;
  fill(handle: number, text: string): Promise<void>;
  choose(handle: number, option: string): Promise<boolean>;
  isChecked(handle: number): Promise<boolean>;
  click(handle: number): Promise<void>;
  close(): Promise<void>;
}

/** The login, then the flow replayed to a capture point. */
export interface AuthPlan {
  readonly login: readonly FlowStep[];
  readonly flow?: readonly FlowStep[];
  readonly upTo?: number;
}

export type Environment = Readonly<Record<string, string | undefined>>;
export type Mark = (event: string, detail: Record<string, unknown>) => void;

/** `auth-login-failed`, carrying its reason: the step, the verb, and never a value. */
export class LoginFailedError extends AuthError {
  readonly reason: LoginFailureReason;
  constructor(reason: LoginFailureReason, where: string, detail: string) {
    super("auth-login-failed", `the login did not complete (${reason}) at ${where}: ${detail}`);
    this.name = "LoginFailedError";
    this.reason = reason;
  }
}

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
  const names = [...plan.login, ...flow].flatMap((step) => ("fill" in step && step.fill.fromEnv !== undefined ? [step.fill.fromEnv] : []));
  return [...new Set(names)];
}

export function assertCredentialsPresent(plan: AuthPlan, env: Environment): void {
  for (const name of requiredEnvNames(plan)) readCredential(name, env);
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

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
  const why = seen.length === 0
    ? `no control is named "${query.name}"`
    : `${seen.length} controls are named "${query.name}"; say which with within or nth`;
  throw new LoginFailedError("unbindable-field", where, `${why}. A control the script cannot address by accessible name is one a `
    + "screen-reader user cannot address either; that is a 4.1.2 finding about the page.");
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

async function assertStillOnOrigin(driver: AuthDriver, origin: string, where: string): Promise<void> {
  const now = await currentOrigin(driver);
  if (now !== origin) {
    throw new LoginFailedError("left-origin", where, `the page is on ${now}, not ${origin}. A redirect to an identity provider is SSO, `
      + "which v1 does not do: use a dedicated test account without MFA or SSO.");
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
}

const verbOf = (step: FlowStep): string => Object.keys(step)[0];

async function runFill(step: Extract<FlowStep, { fill: unknown }>, run: RunContext, where: string): Promise<void> {
  const { field, within, nth } = step.fill;
  const handle = await bindControl(run.driver, { roles: FILL_ROLES, name: field, within, nth }, where, run.bindTimeoutMs);
  const text = step.fill.fromEnv === undefined ? String(step.fill.value) : readCredential(step.fill.fromEnv, run.env);
  assertLiteralIsNotSecret(step, { inputType: await run.driver.inputType(handle) });
  await run.driver.fill(handle, text);
}

async function runStep(step: FlowStep, run: RunContext, where: string): Promise<void> {
  const { driver, origin, bindTimeoutMs } = run;
  if ("goto" in step) {
    const result = await driver.navigate(new URL(step.goto, origin).href);
    if (!result.ok) throw new LoginFailedError("expect-not-met", where, `${step.goto} could not be loaded (${result.error ?? "no reason given"})`);
  } else if ("fill" in step) {
    await runFill(step, run, where);
  } else if ("choose" in step) {
    const { field, within, nth, option } = step.choose;
    const handle = await bindControl(driver, { roles: CHOOSE_ROLES, name: field, within, nth }, where, bindTimeoutMs);
    if (!await driver.choose(handle, option)) throw new LoginFailedError("unbindable-field", where, `"${field}" has no option "${option}"`);
  } else if ("check" in step) {
    const { field, within, nth, checked } = step.check;
    const handle = await bindControl(driver, { roles: CHECK_ROLES, name: field, within, nth }, where, bindTimeoutMs);
    if (await driver.isChecked(handle) !== checked) await driver.click(handle);
  } else if ("press" in step) {
    const { control, within, nth } = step.press;
    await driver.click(await bindControl(driver, { roles: PRESS_ROLES, name: control, within, nth }, where, bindTimeoutMs));
  } else if ("expect" in step) {
    await expectMet(step.expect, run, where);
  }
}

async function expectMet(expected: { kind: "heading" | "control" | "text"; name: string; timeoutSeconds: number }, run: RunContext, where: string): Promise<void> {
  const met = await until(async () => (expectationMet(await run.driver.axNodes(), expected) ? true : undefined),
    expected.timeoutSeconds * MS_PER_SECOND);
  if (!met) throw new LoginFailedError("expect-not-met", where, `no ${expected.kind} "${expected.name}" appeared within ${expected.timeoutSeconds} s`);
  // A heading on another site is not this site's dashboard: the condition is met only on the pinned origin.
  await assertStillOnOrigin(run.driver, run.origin, where);
}

/** The step's accessible NAME for a mark, never a value. */
function nameForMark(step: FlowStep): string | undefined {
  const body = Object.values(step)[0] as string | { field?: string; control?: string; name?: string };
  return typeof body === "string" ? undefined : body.field ?? body.control ?? body.name;
}

/** Run steps in order, marking each by verb and accessible name only, and re-checking the origin after every step that can move the page. */
export async function runSteps(run: RunContext): Promise<void> {
  for (const [index, step] of run.steps.entries()) {
    const verb = verbOf(step);
    const where = `${run.phase} step ${index + 1} (${verb})`;
    if (verb === "capture") continue; // a capture point is where the caller stops; it acts on nothing
    run.mark("authStep", { phase: run.phase, index: index + 1, verb, name: nameForMark(step) });
    await runStep(step, run, where);
    if (verb !== "expect") await assertStillOnOrigin(run.driver, run.origin, where);
  }
}

/**
 * The whole sign-in: the login, then the flow to its capture point, then the requested page. Returns only once the
 * requested page has loaded on the pinned origin; anything less throws, so "signed in" is never claimed early.
 */
export async function signIn(
  { plan, url, driver, env, mark, bindTimeoutMs = BIND_TIMEOUT_MS }:
  { plan: AuthPlan; url: string; driver: AuthDriver; env: Environment; mark: Mark; bindTimeoutMs?: number },
): Promise<void> {
  const origin = new URL(url).origin;
  const flow = (plan.flow ?? []).slice(0, plan.upTo ?? plan.flow?.length ?? 0);
  await runSteps({ steps: plan.login, origin, driver, env, mark, phase: "login", bindTimeoutMs });
  await runSteps({ steps: flow, origin, driver, env, mark, phase: "flow", bindTimeoutMs });
  const landed = await driver.navigate(url);
  if (!landed.ok) throw new LoginFailedError("expect-not-met", "the requested page", `${url} could not be loaded after the login (${landed.error ?? "no reason given"})`);
  await assertStillOnOrigin(driver, origin, "the requested page");
  mark("authApplied", { steps: plan.login.length + flow.length });
}
