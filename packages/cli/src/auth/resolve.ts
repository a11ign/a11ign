/**
 * Argument resolution for an authenticated run — ADR 0038, PR 7: everything decided BEFORE a worker is leased or a
 * page is captured, so a refused run spends nothing.
 *
 * `--flows <file> --login-flow <name>` (and the Action's `flows:` and `login-flow:`) become an `AuthRequest`: the login
 * flow's steps, whose secrets are environment-variable NAMES. **`--flows <file>` alone signs in by the file's `login:` block**
 * (v3 login phase 2, #4084), as `a11ign login --check` does: the request then carries the block's three variable NAMES and
 * no steps, and the worker's screen loop signs in. Resolution is where, in this order:
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
import { resolve as resolvePath } from "node:path";

import {
  EXPECT_DEFAULT_SECONDS, FlowsError, flowsErrorFrom, parseFlowsFile, refuseIfWrongOrigin, resolveLoginFlow, type Flow, type FlowsFile,
} from "./flows.js";
import { assertCredentialsPresent, readCredential, type AuthPlan } from "./interpreter.js";
import { LoginBlockError, loginBlockPlan, loginBlockWire, type LoginBlock } from "./login-block.js";
import { judgeBackendDecision, refuseAuthOnPublicRepository, type AuthRequest } from "./refusals.js";
import { MAX_CAPTURE_ATTEMPTS, minimumLogins, refuseAboveLoginCap, worstCaseLogins } from "../multi-page.js";
import type { Credential } from "./leak-detector.js";
import {
  buildScrubSet, credentialsFromState, refuseIfAnArgumentCarriesAValue, stateScrubNotices, type ScrubSet,
} from "./scrub.js";
import { readStorageState } from "./state-file.js";

export interface AuthArguments {
  flows: string | null;
  loginFlow: string | null;
  /** `--auth-state <file>`: a storage state the person saved, loaded instead of performing the login. */
  authState: string | null;
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

/** A block names no control, so the list above is not the whole account: the loop presses the sign-in controls the screens offer. */
export const LOGIN_BLOCK_NOTICE = "authenticated run: signing in by the flows file's login: block. The sign-in loop types the "
  + "username, password and one-time code the block names and presses the sign-in controls each screen offers, "
  + "and presses nothing else.";

/** Both a named flow and a block: the flow is what the run signs in by, and a block left unused is said, not silently ignored. */
export const BLOCK_UNUSED_NOTICE = "authenticated run: --login-flow names a flow, so the file's login: block is not used.";

/**
 * WHAT THIS RUN PRESSED (ADR 0038, Constraint 7, "how a user is told", place 2): the controls its own files name, by
 * accessible name, in the order they run — a login's `press:`, `check:` and `choose:` steps, then a flow's, then the
 * state a forms config (ADR 0024) names: each `check`/`choose` field, then its `submit` control. **Under `state` the login's
 * steps are not run** (ADR 0038, amendment 7, choice 1 and amendment 9: the saved state stands in for the sign-in and only its final `expect:`
 * executes, which presses nothing), so none of them is listed: this list is the account of what the tool did to the
 * session, and naming a press that never ran reads as more caution than was taken (#2787). **No value**: not what
 * was typed, not what was chosen, and not which variable supplied it. A run that names nothing to press says so,
 * because the absence is the finding: automatic pressing is off, so nothing else was.
 */
export function pressedByThisRun(auth: AuthRequest, formState?: PressedFormState): string[] {
  const login = auth.state === undefined ? auth.login : [];
  const steps = [...login, ...(auth.flow ?? []).slice(0, auth.upTo ?? auth.flow?.length ?? 0)].flatMap((step) => {
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

/**
 * Was any authentication asked for at all? `--login-flow` needs the file it names a flow in. `--flows` alone is asked for: the
 * file may carry a `login:` block, which only the file can say, so `signInOf` refuses it once the file is read.
 */
function asked({ flows, loginFlow, authState, sendAuthenticatedTranscriptToJudgeVendor }: AuthArguments): boolean {
  if (flows === null && loginFlow === null) {
    if (authState !== null) {
      throw new FlowsError("login-flow-missing", "--auth-state needs --flows and --login-flow beside it: the login flow's final expect: is what decides that a saved state still signs in");
    }
    if (sendAuthenticatedTranscriptToJudgeVendor) {
      throw new FlowsError("login-flow-missing", "--send-authenticated-transcript-to-judge-vendor only means something on an authenticated run; name --flows and --login-flow, or drop it");
    }
    return false;
  }
  if (flows === null) {
    throw new FlowsError("login-flow-missing", "--login-flow needs --flows beside it: a login flow is a named flow in a flows file");
  }
  // A saved state stands in for a NAMED flow, whose final expect: decides that it still signs in; a block has no such flow.
  if (loginFlow === null && authState !== null) {
    throw new FlowsError("login-flow-missing", "--flows needs --login-flow beside it: a login flow is a named flow in a flows file");
  }
  return true;
}

/** What the run signs in by: the flow `--login-flow` names, or, with none named, the file's `login:` block. */
type SignIn = { flow: Flow; blockUnused: boolean } | { block: LoginBlock };

function signInOf(file: FlowsFile, loginFlow: string | null): SignIn {
  if (loginFlow !== null) return { flow: resolveLoginFlow(file, loginFlow), blockUnused: file.login !== undefined };
  if (file.login === undefined) {
    throw new FlowsError("login-flow-missing", "--flows needs --login-flow beside it: a login flow is a named flow in a flows file, "
      + "and this file has no login: block to sign in by instead");
  }
  return { block: file.login };
}

/** What a sign-in decides for the run: the request, what must be set, what to hide and what to say. Every field is names, never a value. */
interface Planned {
  auth: AuthRequest;
  /** The plan whose variables are checked before anything is leased. */
  reads: AuthPlan;
  /** Variables the loop reads that `reads` does not name, so a run without one is refused here and not after a lease. */
  alsoRequired: string[];
  /** The variables whose VALUES the run hides. */
  names: string[];
  stateCredentials: Credential[];
  countNotice: (run: { captures: number; axe: boolean }) => string;
  notices: string[];
}

/**
 * The saved state a run loads, read HERE so its values are known before anything is captured, and refused here if the file is
 * not a state. **Only the path goes on the wire** (`AuthRequest.state`): the worker reads the file itself, and this read exists
 * to build the scrub set. Absolute, because the worker's working directory is not this process's.
 */
async function resolveState(
  request: ResolveRequest, origin: string,
): Promise<{ state: { path: string }; credentials: Credential[]; notices: string[] } | undefined> {
  if (request.args.authState === null) return undefined;
  const path = resolvePath(request.args.authState);
  const found = credentialsFromState(await readStorageState(path, request.readText), { origin, publicText: [...request.urls, request.task] });
  return { state: { path }, credentials: found.credentials, notices: stateScrubNotices(found) };
}

/**
 * The plan the interpreters and the wire share, from the resolved login flow. **The declared identity-provider origins ride
 * with it, and only when there are some**: a flow that declares none sends the request it always sent, so the pin cannot be
 * loosened by a key that was merely absent. **A state run carries none**: it performs no login, so there is no hop to allow.
 */
function planFrom(steps: AuthPlan["login"], state?: { path: string }, idpOrigins: readonly string[] = []): AuthRequest {
  if (state !== undefined) return { login: steps, state };
  return idpOrigins.length === 0 ? { login: steps } : { login: steps, idpOrigins };
}

/**
 * What a state run says INSTEAD of the login count: no login is performed, and the state is not refreshed, so each capture
 * loads it as the person saved it.
 */
export function stateNotice({ captures, axe }: { captures: number; axe: boolean }): string {
  return `authenticated run: this run performs no login. It loads your saved state before each capture (${captures} `
    + `capture${captures === 1 ? "" : "s"}${axe ? ", and again for the rule layer" : ""}) and never writes it back. `
    + "The state is a credential: keep the file private.";
}

/** The names of the variables a login flow's `fill:` steps read, once each. */
const flowVariableNames = (steps: AuthPlan["login"]): string[] =>
  [...new Set(steps.flatMap((step) => ("fill" in step && step.fill.fromEnv !== undefined ? [step.fill.fromEnv] : [])))];

async function planFlow(request: ResolveRequest, file: FlowsFile, flow: Flow, blockUnused: boolean): Promise<Planned> {
  const stated = await resolveState(request, file.origin);
  const auth = planFrom(flow.steps, stated?.state, file.idpOrigins);
  return {
    auth, reads: auth, alsoRequired: [],
    names: stated === undefined ? flowVariableNames(flow.steps) : [], // a state run performs no login, so no login variable is read and none needs hiding
    stateCredentials: stated?.credentials ?? [],
    countNotice: stated === undefined ? loginNotice : stateNotice,
    notices: [...(stated?.notices ?? []), ...(blockUnused ? [BLOCK_UNUSED_NOTICE] : [])],
  };
}

/**
 * A block run: the wire shape, the plan the rule layer signs in by (the one `login --check` builds, so a `url:` check is refused
 * here by the same rule), and all THREE variables required. The worker reads the seed only when a code screen appears, but a
 * block names one on purpose, and a run that cannot answer the code screen is better refused here than ended there.
 */
function planBlock(block: LoginBlock): Planned {
  let built: ReturnType<typeof loginBlockPlan>;
  try {
    built = loginBlockPlan(block, { expectSeconds: EXPECT_DEFAULT_SECONDS });
  } catch (error) {
    if (error instanceof LoginBlockError) throw flowsErrorFrom(error);
    throw error;
  }
  const auth: AuthRequest = {
    login: [], loginBlock: loginBlockWire(block), ...(block.idpOrigins.length === 0 ? {} : { idpOrigins: block.idpOrigins }),
  };
  return {
    auth, reads: built.plan, alsoRequired: [block.totp], names: [...built.credentialNames, block.totp], stateCredentials: [],
    countNotice: loginNotice, notices: [LOGIN_BLOCK_NOTICE],
  };
}

const planSignIn = (request: ResolveRequest, file: FlowsFile, signIn: SignIn): Promise<Planned> | Planned =>
  "block" in signIn ? planBlock(signIn.block) : planFlow(request, file, signIn.flow, signIn.blockUnused);

/**
 * Resolve authentication, or `null` when the run asked for none. Throws a `FlowsError` or an `AuthError` naming what
 * refused; never a stack trace a person must read.
 */
export async function resolveAuthentication(request: ResolveRequest): Promise<ResolvedAuth | null> {
  const { args, urls, env, readText } = request;
  if (!asked(args)) return null;
  const flowsPath = args.flows as string;
  const privacy = await repositoryPrivacy(env, readText);
  if (privacy.onGithubActions) refuseAuthOnPublicRepository({ auth: planFrom([]), repositoryPrivate: privacy.isPrivate, requestedExits: [] });
  const file = parseFlowsFile(await readFlows(readText, flowsPath), flowsPath);
  const signIn = signInOf(file, args.loginFlow);
  for (const url of urls) {
    if (request.isPdf(url)) throw new FlowsError("origin-pinned", `${url} is a PDF, which has no login to perform; an authenticated run is for pages`);
    refuseIfWrongOrigin(file, url);
  }
  const planned = await planSignIn(request, file, signIn);
  const captures = await request.countCaptures();
  // Before anything is leased or captured, beside the other refusals: a run that asks a real account for more logins than
  // the bound is refused whole (PageListError, exit 2), and a single URL with many form states is caught here too.
  refuseAboveLoginCap({ captures, axe: request.axe });
  assertCredentialsPresent(planned.reads, env);
  for (const name of planned.alsoRequired) readCredential(name, env);
  const scrubSet = buildScrubSet([...planned.names.map((name) => ({ name, value: env[name] as string })), ...planned.stateCredentials]);
  refuseIfAnArgumentCarriesAValue({ urls, task: request.task }, scrubSet);
  const judgeNotice = judgeBackendDecision({ auth: planned.auth, sendTranscriptToJudgeVendor: args.sendAuthenticatedTranscriptToJudgeVendor });
  return {
    auth: planned.auth,
    scrubSet,
    notices: [PRESSING_OFF_NOTICE, planned.countNotice({ captures, axe: request.axe }), ...planned.notices, ...(judgeNotice ? [judgeNotice] : [])],
    overrides: { probeForms: false, probeNavigation: false },
  };
}
