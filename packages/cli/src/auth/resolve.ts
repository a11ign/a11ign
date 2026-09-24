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
 *    is captured, so the run is refused rather than half-done.
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
import { buildScrubSet, type ScrubSet } from "./scrub.js";

export interface AuthArguments {
  flows: string | null;
  loginFlow: string | null;
  sendAuthenticatedTranscriptToJudgeVendor: boolean;
}

export interface ResolveRequest {
  args: AuthArguments;
  urls: readonly string[];
  /** Is the rule layer going to run (each page then logs in a second time)? */
  axe: boolean;
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
 * accessible name, in the order they run — a login's `press:`, `check:` and `choose:` steps. **No value**: not what was
 * typed, not what was chosen, and not which variable supplied it. A run that names nothing to press says so, because the
 * absence is the finding: automatic pressing is off, so nothing else was.
 */
export function pressedByThisRun(auth: AuthRequest): string[] {
  const names = [...auth.login, ...(auth.flow ?? []).slice(0, auth.upTo ?? auth.flow?.length ?? 0)].flatMap((step) => {
    if ("press" in step) return [step.press.control];
    if ("check" in step) return [step.check.field];
    if ("choose" in step) return [step.choose.field];
    return [];
  });
  return names;
}

/** One login per capture for the screen-reader layer, plus one per page for the rule layer. Stated, because it is real requests with a real account. */
export function loginCount({ pages, axe }: { pages: number; axe: boolean }): number {
  return pages * (axe ? 2 : 1);
}

export function loginNotice({ pages, axe }: { pages: number; axe: boolean }): string {
  const count = loginCount({ pages, axe });
  return `authenticated run: this run will perform ${count} login${count === 1 ? "" : "s"} (one per capture`
    + `${axe ? ", and one per page for the rule layer" : ""}; more if a capture has to be repeated). `
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
  const file = parseFlowsFile(await readText(flowsPath), flowsPath);
  const login = resolveLoginFlow(file, loginFlow);
  for (const url of urls) {
    if (request.isPdf(url)) throw new FlowsError("origin-pinned", `${url} is a PDF, which has no login to perform; an authenticated run is for pages`);
    refuseIfWrongOrigin(file, url);
  }
  const plan = planFrom(login.steps);
  assertCredentialsPresent(plan, env);
  const names = [...new Set(login.steps.flatMap((step) => ("fill" in step && step.fill.fromEnv !== undefined ? [step.fill.fromEnv] : [])))];
  const scrubSet = buildScrubSet(names.map((name) => ({ name, value: env[name] as string })));
  const judgeNotice = judgeBackendDecision({ auth: plan, sendTranscriptToJudgeVendor: args.sendAuthenticatedTranscriptToJudgeVendor });
  return {
    auth: plan,
    scrubSet,
    notices: [PRESSING_OFF_NOTICE, loginNotice({ pages: urls.length, axe: request.axe }), ...(judgeNotice ? [judgeNotice] : [])],
    overrides: { probeForms: false, probeNavigation: false },
  };
}

