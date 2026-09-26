/**
 * Argument resolution for an authenticated run — ADR 0038, PR 7: everything decided BEFORE a worker is leased or a
 * page is captured, so a refused run spends nothing.
 *
 * `--flows <file> --login-flow <name>` (and the Action's `flows:` and `login-flow:`) become an `AuthRequest`: the login
 * flow's steps, whose secrets are environment-variable NAMES. Resolution is where, in this order:
 *
 * 1. **A repository that is not private is refused whole** (amendment 3), when the run is inside GitHub Actions and the
 *    event says so. Read from `GITHUB_EVENT_PATH`; "could not read it" is "not private", because "I could not tell" is
 *    not permission to publish text from behind a login.
 * 2. **The flows file is parsed and held to the login rules**, and every URL must be on its pinned origin.
 * 3. **Every variable the login reads must be set, and no value may be below the floor** (amendment 2) — before anything
 *    is captured, so the run is refused rather than half-done. **No URL and no task may carry one of the values**: they are
 *    the run's own arguments, echoed by every output, and are not what `keepCredentialsOut` scrubs.
 * 4. **A non-local judge backend refuses** unless the run named `--send-authenticated-transcript-to-judge-vendor`, an
 *    argument and never an environment variable; given, the vendor is named on stderr before the judge runs.
 * 5. **Automatic pressing and link-following are turned OFF** (Constraint 7): an authenticated run presses only what its
 *    own files name. The Action's `probe-forms` and `probe-navigation` default to `"true"` and an input's default cannot be
 *    told from an explicit `"true"`, so the narrowing applies to EVERY authenticated run.
 *
 * PURE apart from the two injected reads (`readText`, and `env`), so each decision has a test that needs no filesystem.
 */
import { FlowsError, parseFlowsFile, refuseIfWrongOrigin, resolveLoginFlow } from "./flows.js";
import { assertCredentialsPresent, type AuthPlan } from "./interpreter.js";
import { judgeBackendDecision, refuseAuthOnPublicRepository, type AuthRequest } from "./refusals.js";
import { MAX_CAPTURE_ATTEMPTS, minimumLogins, refuseAboveLoginCap, worstCaseLogins } from "../multi-page.js";
import { buildScrubSet, refuseIfAnArgumentCarriesAValue, type ScrubSet } from "./scrub.js";

export interface AuthArguments {
  flows: string | null;
  loginFlow: string | null;
  sendAuthenticatedTranscriptToJudgeVendor: boolean;
}

export interface ResolveRequest {
  args: AuthArguments;
  urls: readonly string[];
  task: string;
  /** Is the rule layer going to run (each capture then logs in a second time)? */
  axe: boolean;
  /**
   * Captures the run will make (pages times form states), asked only once authentication is known to be wanted: counting
   * them reads the forms config, which a run that logs in to nothing has no need to do early.
   */
  countCaptures: () => Promise<number>;
  env: Readonly<Record<string, string | undefined>>;
  readText: (path: string) => Promise<string>;
  isPdf: (url: string) => boolean;
}

export interface ResolvedAuth {
  auth: AuthRequest;
  scrubSet: ScrubSet;
  /** Lines for stderr (and `::notice::` on the Action), in the order they should be read. */
  notices: string[];
  /** The probes an authenticated run turns off, whatever the caller asked for. */
  overrides: { probeForms: false; probeNavigation: false };
}

export const PRESSING_OFF_NOTICE = "authenticated run: automatic pressing and link-following are off; "
  + "this run will press only what your flows and forms config name.";

/**
 * WHAT THIS RUN PRESSED (ADR 0038, Constraint 7, "how a user is told", place 2): the controls its own files name, by
 * accessible name, in the order they run — a login's `press:`, `check:` and `choose:` steps, then a flow's, then the
 * state a forms config (ADR 0024) names: each `check`/`choose` field, then its `submit` control. **No value**: not what
 * was typed, not what was chosen, and not which variable supplied it. A run that names nothing to press says so,
 * because the absence is the finding: automatic pressing is off, so nothing else was.
 */
export function pressedByThisRun(auth: AuthRequest, formState?: PressedFormState): string[] {
  const steps = [...auth.login, ...(auth.flow ?? []).slice(0, auth.upTo ?? auth.flow?.length ?? 0)].flatMap((step) => {
    if ("press" in step) return [step.press.control];
    if ("check" in step) return [step.check.field];
    if ("choose" in step) return [step.choose.field];
    return [];
  });
  return [...steps, ...pressedByFormState(formState)];
}

/** The part of a forms config's state this list reads: names only, so a `value` cannot reach the report. */
export interface PressedFormState {
  submit: string;
  fields: readonly { field: string; choose?: string; check?: boolean }[];
}

/** A `fill` presses nothing; a `check` or `choose` toggles a control, and the submit control is pressed last. */
function pressedByFormState(formState: PressedFormState | undefined): string[] {
  if (!formState) return [];
  const toggled = formState.fields.filter((entry) => entry.check !== undefined || entry.choose !== undefined);
  return [...toggled.map((entry) => entry.field), formState.submit];
}

/**
 * What a run states BEFORE it starts, and it is a FLOOR, said as one: a login per capture for the screen reader and,
 * with the rule layer on, one per capture for that layer, which signs in for itself. A capture repeated because it did
 * not read the page (`MAX_CAPTURE_ATTEMPTS`) logs in again, so the run can reach `worstCaseLogins`; the run reports
 * the number it PERFORMED afterwards (`multi-page.ts`). "Pages x 2" is the floor of a run with no form states and no
 * repeats, not a count of anything, and this notice used to state it as one.
 */
export function loginNotice({ captures, axe }: { captures: number; axe: boolean }): string {
  const floor = minimumLogins({ captures, axe });
  const worst = worstCaseLogins({ captures, axe });
  return `authenticated run: this run will perform at least ${floor} login${floor === 1 ? "" : "s"} (a minimum: one per capture`
    + `${axe ? ", and one per capture for the rule layer" : ""}). A capture that has to be repeated logs in again, `
    + `up to ${MAX_CAPTURE_ATTEMPTS} attempts each, so it can reach ${worst}; the run reports how many it performed. `
    + "Use a dedicated test account: a login is a real request to a real account.";
}

/** `event.repository.private` from the workflow's own event payload, or `undefined` when there is none to read. */
export async function repositoryPrivacy(
  env: Readonly<Record<string, string | undefined>>, readText: (path: string) => Promise<string>,
): Promise<{ onGithubActions: boolean; isPrivate: unknown }> {
  if (env.GITHUB_ACTIONS !== "true") return { onGithubActions: false, isPrivate: undefined };
  try {
    const event = JSON.parse(await readText(env.GITHUB_EVENT_PATH ?? "")) as { repository?: { private?: unknown } };
    return { onGithubActions: true, isPrivate: event.repository?.private };
  } catch (error) {
    void error; // unreadable is "not private": the refusal below is the handling
    return { onGithubActions: true, isPrivate: undefined };
  }
}

/** The flows file's text, or a refusal that says which file: a path that does not exist is a usage error (exit 2), not a crash. */
async function readFlows(readText: ResolveRequest["readText"], path: string): Promise<string> {
  try {
    return await readText(path);
  } catch (error) {
    throw new FlowsError("file-shape", `the flows file ${path} could not be read (${error instanceof Error ? error.message : String(error)})`);
  }
}

/** Was any authentication asked for at all? Both flags, or neither — one alone is a mistake named as such. */
function asked({ flows, loginFlow, sendAuthenticatedTranscriptToJudgeVendor }: AuthArguments): boolean {
  if (flows === null && loginFlow === null) {
    if (sendAuthenticatedTranscriptToJudgeVendor) {
      throw new FlowsError("login-flow-missing", "--send-authenticated-transcript-to-judge-vendor only means something on an authenticated run; name --flows and --login-flow, or drop it");
    }
    return false;
  }
  if (flows === null || loginFlow === null) {
    throw new FlowsError("login-flow-missing", `${flows === null ? "--login-flow" : "--flows"} needs ${flows === null ? "--flows" : "--login-flow"} beside it: a login flow is a named flow in a flows file`);
  }
  return true;
}

/** The plan the interpreters and the wire share, from the resolved login flow. */
function planFrom(steps: AuthPlan["login"]): AuthRequest {
  return { login: steps };
}

/**
 * Resolve authentication, or `null` when the run asked for none. Throws a `FlowsError` or an `AuthError` naming what
 * refused; never a stack trace a person must read.
 */
export async function resolveAuthentication(request: ResolveRequest): Promise<ResolvedAuth | null> {
  const { args, urls, env, readText } = request;
  if (!asked(args)) return null;
  const flowsPath = args.flows as string;
  const loginFlow = args.loginFlow as string;
  const privacy = await repositoryPrivacy(env, readText);
  const auth = planFrom([]);
  if (privacy.onGithubActions) refuseAuthOnPublicRepository({ auth, repositoryPrivate: privacy.isPrivate, requestedExits: [] });
  const file = parseFlowsFile(await readFlows(readText, flowsPath), flowsPath);
  const login = resolveLoginFlow(file, loginFlow);
  for (const url of urls) {
    if (request.isPdf(url)) throw new FlowsError("origin-pinned", `${url} is a PDF, which has no login to perform; an authenticated run is for pages`);
    refuseIfWrongOrigin(file, url);
  }
  const plan = planFrom(login.steps);
  const captures = await request.countCaptures();
  // Before anything is leased or captured, beside the other refusals: a run that asks a real account for more logins than
  // the bound is refused whole (PageListError, exit 2), and a single URL with many form states is caught here too.
  refuseAboveLoginCap({ captures, axe: request.axe });
  assertCredentialsPresent(plan, env);
  const names = [...new Set(login.steps.flatMap((step) => ("fill" in step && step.fill.fromEnv !== undefined ? [step.fill.fromEnv] : [])))];
  const scrubSet = buildScrubSet(names.map((name) => ({ name, value: env[name] as string })));
  refuseIfAnArgumentCarriesAValue({ urls, task: request.task }, scrubSet);
  const judgeNotice = judgeBackendDecision({ auth: plan, sendTranscriptToJudgeVendor: args.sendAuthenticatedTranscriptToJudgeVendor });
  return {
    auth: plan,
    scrubSet,
    notices: [PRESSING_OFF_NOTICE, loginNotice({ captures, axe: request.axe }), ...(judgeNotice ? [judgeNotice] : [])],
    overrides: { probeForms: false, probeNavigation: false },
  };
}

