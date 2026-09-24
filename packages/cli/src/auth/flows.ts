/**
 * The flows file — ADR 0038, "The primitive: a flow, designed once".
 *
 * One file holds NAMED flows, and every use of it is the same thing: a login, a complete process, a step
 * before one URL. The file runs on the machine that drives the browser WITH SECRETS IN ITS ENVIRONMENT, so
 * this schema is a security boundary before it is a convenience, and it is written to refuse rather than to
 * tolerate — the opposite of `axe-results.ts`, and the same stance as `forms/config.ts`, for the same reason:
 * a misread step here is a real action on a real site, taken while logged in.
 *
 * Four properties are the point, and each one has a rule id that the refusal's message carries, so a person
 * (and a test) can tell WHICH rule refused without matching prose:
 *
 * - `closed-vocabulary` — `goto`, `fill`, `choose`, `check`, `press`, `expect`, `capture` and nothing else. No
 *   script step, no evaluated expression and no fixed sleep. A file that can run code is the "some environment
 *   variables are executable" class SECURITY.md already warns about, so this is a security property and not a
 *   simplicity one. `expect` waits, and its wait is BOUNDED.
 * - `origin-pinned` — every `goto` is resolved against `origin:` and leaving it fails, so a flow written for
 *   staging cannot be pointed at production, and a redirect-shaped `goto` cannot carry a login somewhere else.
 * - `by-accessible-name` — a control is addressed by the name a screen reader announces, never by selector
 *   (ADR 0024's decision 1, for the same reason: a control the script cannot address by name is one a
 *   screen-reader user cannot address either).
 * - `login-*` — the flow that `--login-flow` names takes secrets from the environment only, must END in an
 *   `expect`, and captures nothing.
 *
 * PURE. No file reads, no network, no browser and no `process.env`. The values behind `from-env:` are read
 * by the machine that drives the browser and never by this file: a flows file NAMES a variable and this
 * module cannot see one, which is what keeps "no secret in the request" checkable from the parser outward.
 */
import { parse as parseYaml } from "yaml";

/** The closed vocabulary. A verb outside it is `closed-vocabulary`, and there is no way to add one from a file. */
export const FLOW_VERBS = ["goto", "fill", "choose", "check", "press", "expect", "capture"] as const;
export type FlowVerb = (typeof FLOW_VERBS)[number];

/** Every rule that can refuse a flows file. Named so a test asserts the rule and not the wording. */
export const FLOW_RULES = [
  "file-shape",
  "closed-vocabulary",
  "origin-pinned",
  "by-accessible-name",
  "unknown-key",
  "step-shape",
  "login-literal",
  "login-final-expect",
  "login-no-capture",
  "login-flow-missing",
  "auth-literal-secret",
] as const;
export type FlowRule = (typeof FLOW_RULES)[number];

/** How long `expect` may wait, in seconds. Bounded on purpose: an unbounded wait is a sleep with better manners. */
export const EXPECT_DEFAULT_SECONDS = 10;
export const EXPECT_MAX_SECONDS = 30;

/** How a control is picked out when two share a name — `within:` first, as ADR 0024 decided, `nth:` as the fallback. */
export interface ControlRef {
  /** The control's accessible name, as the screen reader announces it. */
  field: string;
  within?: string;
  /** 1-based, as a person counts. */
  nth?: number;
}

export type FillStep = { fill: ControlRef & ({ value: string; fromEnv?: undefined } | { fromEnv: string; value?: undefined }) };
export type FlowStep =
  | { goto: string }
  | FillStep
  | { choose: ControlRef & { option: string } }
  | { check: ControlRef & { checked: boolean } }
  | { press: { control: string; within?: string; nth?: number } }
  | { expect: { kind: "heading" | "control" | "text"; name: string; timeoutSeconds: number } }
  | { capture: string };

export interface Flow {
  name: string;
  steps: FlowStep[];
}

export interface FlowsFile {
  version: 1;
  /** The only origin this file may be applied to, normalised to `URL.origin`. */
  origin: string;
  flows: Flow[];
}

/**
 * Thrown with a sentence a person can act on, carrying the rule that refused. A flows-file error must never
 * be a stack trace. `fault` is set only for the one refusal that has a fault code of its own
 * (`auth-literal-secret`), so PR 3's `FAULT_REMEDIATION` entry has something to key on.
 */
export class FlowsError extends Error {
  readonly rule: FlowRule;
  readonly fault?: string;
  constructor(rule: FlowRule, message: string, fault?: string) {
    super(`${message} (rule: ${rule})`);
    this.name = "FlowsError";
    this.rule = rule;
    this.fault = fault;
  }
}

/** Annotated on the CONST so `if (bad) fail(...)` narrows; see the note on `fail` in `forms/config.ts`. */
const fail: (rule: FlowRule, message: string) => never = (rule, message) => {
  throw new FlowsError(rule, message);
};

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const isName = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";

/** What somebody reaches for to run code, wait, or address by selector, each with the sentence that answers it. */
const KNOWN_WRONG_VERBS: Record<string, { rule: FlowRule; why: string }> = {
  script: { rule: "closed-vocabulary", why: "there is no script step: a file that can run code, run with secrets in its environment, is the risk this vocabulary exists to close" },
  eval: { rule: "closed-vocabulary", why: "there is no evaluated expression" },
  run: { rule: "closed-vocabulary", why: "there is no script step" },
  evaluate: { rule: "closed-vocabulary", why: "there is no evaluated expression" },
  wait: { rule: "closed-vocabulary", why: "there is no fixed sleep; use expect:, which waits for a condition and is bounded" },
  sleep: { rule: "closed-vocabulary", why: "there is no fixed sleep; use expect:, which waits for a condition and is bounded" },
  delay: { rule: "closed-vocabulary", why: "there is no fixed sleep; use expect:, which waits for a condition and is bounded" },
  click: { rule: "closed-vocabulary", why: "the verb is press:" },
  type: { rule: "closed-vocabulary", why: "the verb is fill:" },
  select: { rule: "closed-vocabulary", why: "the verb is choose:" },
};

const SELECTOR_KEYS = ["selector", "css", "xpath", "id", "testid", "locator", "role"];

function refuseUnknownKeys(entry: Record<string, unknown>, allowed: readonly string[], where: string): void {
  for (const key of Object.keys(entry)) {
    if (allowed.includes(key)) continue;
    if (SELECTOR_KEYS.includes(key)) {
      fail("by-accessible-name", `${where} addresses a control with ${key}:. Controls are addressed by the name a `
        + "screen reader announces, never by selector — a control that cannot be reached by name cannot be "
        + "reached by a screen-reader user either.");
    }
    fail("unknown-key", `${where} has ${key}:, which this file does not define. A flows file is read with secrets in `
      + "its environment, so an unrecognised key is refused rather than ignored.");
  }
}

/** The one place the origin is read, so `origin-pinned` and the schema cannot disagree about what "an origin" is. */
function originOf(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.origin : null;
  } catch {
    return null;
  }
}

function parseOrigin(raw: unknown, path: string): string {
  if (!isName(raw)) {
    fail("file-shape", `${path}: origin: is required. It names the only site this file may be applied to, and it is `
      + "what stops a flow written for staging being aimed at production.");
  }
  const origin = originOf(raw as string);
  if (origin === null) fail("file-shape", `${path}: origin: ${JSON.stringify(raw)} is not an http or https URL.`);
  const parsed = new URL(raw as string);
  if (parsed.username !== "" || parsed.password !== "") {
    fail("file-shape", `${path}: origin: carries a username or password. A credential does not belong in a file that is `
      + "committed; a login takes its secrets from-env: only.");
  }
  return origin as string;
}

/**
 * `goto` is resolved against the origin, and the RESOLVED origin is compared, never a prefix of the string:
 * `//evil.test/x` and `https://app.example.test.evil.test` both start like the origin and both leave it.
 */
function parseGoto(target: unknown, origin: string, where: string): string {
  if (!isName(target)) fail("step-shape", `${where}: goto: needs a path such as /login.`);
  const resolved = (() => {
    try {
      return new URL(target as string, origin);
    } catch {
      return null;
    }
  })();
  if (resolved === null || resolved.origin !== origin) {
    fail("origin-pinned", `${where}: goto: ${JSON.stringify(target)} leaves ${origin}. A flow may only navigate inside `
      + "the origin its file declares; write a path relative to it.");
  }
  return target as string;
}

function parseControlRef(entry: Record<string, unknown>, where: string): ControlRef {
  if (!isName(entry.field)) {
    fail("step-shape", `${where} has no field: name. Name it as the screen reader announces it.`);
  }
  if (entry.within !== undefined && !isName(entry.within)) {
    fail("step-shape", `${where}: within: must be the accessible name of the group.`);
  }
  if (entry.nth !== undefined && (!Number.isInteger(entry.nth) || (entry.nth as number) < 1)) {
    fail("step-shape", `${where}: nth: counts from 1, as a person counts.`);
  }
  return {
    field: entry.field as string,
    ...(entry.within === undefined ? {} : { within: entry.within as string }),
    ...(entry.nth === undefined ? {} : { nth: entry.nth as number }),
  };
}

const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

function parseFill(raw: unknown, where: string): FillStep {
  if (!isObject(raw)) fail("step-shape", `${where}: fill: takes a mapping with field: and one of value: or from-env:.`);
  const entry = raw as Record<string, unknown>;
  refuseUnknownKeys(entry, ["field", "within", "nth", "value", "from-env"], `${where}: fill:`);
  const ref = parseControlRef(entry, `${where}: fill:`);
  const given = (["value", "from-env"] as const).filter((key) => entry[key] !== undefined);
  if (given.length !== 1) {
    fail("step-shape", `${where}: fill: on "${ref.field}" needs exactly one of value: or from-env: (found ${given.length}).`);
  }
  if (entry["from-env"] !== undefined) {
    if (typeof entry["from-env"] !== "string" || !ENV_NAME.test(entry["from-env"])) {
      fail("step-shape", `${where}: from-env: on "${ref.field}" must be the NAME of an environment variable, `
        + "such as APP_TEST_PASSWORD, and never its value.");
    }
    return { fill: { ...ref, fromEnv: entry["from-env"] as string } } as FillStep;
  }
  if (typeof entry.value !== "string") fail("step-shape", `${where}: value: on "${ref.field}" must be text.`);
  return { fill: { ...ref, value: entry.value as string } } as FillStep;
}

function parseChoose(raw: unknown, where: string): FlowStep {
  if (!isObject(raw)) fail("step-shape", `${where}: choose: takes a mapping with field: and option:.`);
  const entry = raw as Record<string, unknown>;
  refuseUnknownKeys(entry, ["field", "within", "nth", "option"], `${where}: choose:`);
  const ref = parseControlRef(entry, `${where}: choose:`);
  if (!isName(entry.option)) fail("step-shape", `${where}: choose: on "${ref.field}" has no option: to select.`);
  return { choose: { ...ref, option: entry.option as string } };
}

function parseCheck(raw: unknown, where: string): FlowStep {
  if (!isObject(raw)) fail("step-shape", `${where}: check: takes a mapping with field: and optionally checked:.`);
  const entry = raw as Record<string, unknown>;
  refuseUnknownKeys(entry, ["field", "within", "nth", "checked"], `${where}: check:`);
  const ref = parseControlRef(entry, `${where}: check:`);
  if (entry.checked !== undefined && typeof entry.checked !== "boolean") {
    fail("step-shape", `${where}: checked: on "${ref.field}" is true or false.`);
  }
  return { check: { ...ref, checked: entry.checked !== false } };
}

function parsePress(raw: unknown, where: string): FlowStep {
  if (isName(raw)) return { press: { control: raw } };
  if (!isObject(raw)) fail("step-shape", `${where}: press: takes the control's accessible name.`);
  const entry = raw as Record<string, unknown>;
  refuseUnknownKeys(entry, ["control", "within", "nth"], `${where}: press:`);
  if (!isName(entry.control)) fail("step-shape", `${where}: press: has no control: name.`);
  const { field, ...disambiguators } = parseControlRef({ ...entry, field: entry.control }, `${where}: press:`);
  return { press: { control: field, ...disambiguators } };
}

const EXPECT_KINDS = ["heading", "control", "text"] as const;

function parseExpect(raw: unknown, where: string): FlowStep {
  if (!isObject(raw)) fail("step-shape", `${where}: expect: takes a mapping such as { heading: "Dashboard" }.`);
  const entry = raw as Record<string, unknown>;
  refuseUnknownKeys(entry, [...EXPECT_KINDS, "timeout"], `${where}: expect:`);
  const kinds = EXPECT_KINDS.filter((kind) => entry[kind] !== undefined);
  if (kinds.length !== 1 || !isName(entry[kinds[0]])) {
    fail("step-shape", `${where}: expect: needs exactly one of heading:, control: or text:, with a name.`);
  }
  const timeout = entry.timeout ?? EXPECT_DEFAULT_SECONDS;
  if (typeof timeout !== "number" || !(timeout > 0) || timeout > EXPECT_MAX_SECONDS) {
    fail("closed-vocabulary", `${where}: expect: waits at most ${EXPECT_MAX_SECONDS} seconds, and a wait with no bound `
      + "is a sleep. Give timeout: as a number of seconds between 0 and " + `${EXPECT_MAX_SECONDS}.`);
  }
  return { expect: { kind: kinds[0], name: entry[kinds[0]] as string, timeoutSeconds: timeout as number } };
}

function parseCapture(raw: unknown, where: string): FlowStep {
  if (!isName(raw)) fail("step-shape", `${where}: capture: needs a name for the capture point.`);
  return { capture: raw as string };
}

function parseStep(raw: unknown, origin: string, where: string): FlowStep {
  if (!isObject(raw) || Object.keys(raw).length !== 1) {
    fail("step-shape", `${where} must be a mapping with exactly one verb (${FLOW_VERBS.join(", ")}).`);
  }
  const [verb, body] = Object.entries(raw as Record<string, unknown>)[0];
  const known = KNOWN_WRONG_VERBS[verb];
  if (known) fail(known.rule, `${where}: ${verb}: is not a step. ${known.why}.`);
  switch (verb as FlowVerb) {
    case "goto": return { goto: parseGoto(body, origin, where) };
    case "fill": return parseFill(body, where);
    case "choose": return parseChoose(body, where);
    case "check": return parseCheck(body, where);
    case "press": return parsePress(body, where);
    case "expect": return parseExpect(body, where);
    case "capture": return parseCapture(body, where);
    default:
      return fail("closed-vocabulary", `${where}: ${verb}: is not a step. The vocabulary is closed: ${FLOW_VERBS.join(", ")}.`);
  }
}

function parseFlow(name: string, raw: unknown, origin: string): Flow {
  const where = `flow "${name}"`;
  if (!isObject(raw)) fail("file-shape", `${where} is not a mapping with steps:.`);
  const entry = raw as Record<string, unknown>;
  refuseUnknownKeys(entry, ["steps"], where);
  if (!Array.isArray(entry.steps) || entry.steps.length === 0) {
    fail("file-shape", `${where} lists no steps:, so it would do nothing.`);
  }
  const steps = (entry.steps as unknown[]).map((step, index) => parseStep(step, origin, `${where} step ${index + 1}`));
  return { name, steps };
}

/**
 * Parse and validate a flows file.
 *
 * What is decided HERE is everything a flow can be refused for without knowing which one is the login;
 * `resolveLoginFlow` adds the rules that only the flow `--login-flow` names is held to.
 */
export function parseFlowsFile(text: string, path = "the flows file"): FlowsFile {
  let parsed: unknown;
  try {
    parsed = parseYaml(text);
  } catch (cause) {
    throw new FlowsError("file-shape", `${path} is not valid YAML: ${(cause as Error).message}`);
  }
  if (!isObject(parsed)) fail("file-shape", `${path} is empty or is not a mapping.`);
  const doc = parsed as Record<string, unknown>;
  refuseUnknownKeys(doc, ["version", "origin", "flows"], path);
  if (doc.version !== 1) fail("file-shape", `${path}: version: must be 1 (found ${JSON.stringify(doc.version ?? null)}).`);
  const origin = parseOrigin(doc.origin, path);
  if (!isObject(doc.flows) || Object.keys(doc.flows).length === 0) {
    fail("file-shape", `${path}: flows: lists nothing, so this file would do nothing.`);
  }
  const flows = Object.entries(doc.flows as Record<string, unknown>).map(([name, flow]) => parseFlow(name, flow, origin));
  return { version: 1, origin, flows };
}

/**
 * The flow `--login-flow` names, held to the rules only a login is held to.
 *
 * - **`from-env:` only.** A login's `fill` never carries a literal: a password typed into the file the tool
 *   reads is a password committed. The refusal names the step and the field, and prints no value.
 * - **It ends in `expect`.** A login with no post-condition would report the login wall as a page: the run
 *   would capture whatever loaded, sign-in form or dashboard, and call it the product.
 * - **It captures nothing.** The transcript must not begin until the login has ended (ADR 0038, Constraint 4's
 *   first defence), and a `capture:` inside the login is a capture that begins during it.
 */
export function resolveLoginFlow(file: FlowsFile, name: string): Flow {
  const flow = file.flows.find((candidate) => candidate.name === name);
  if (flow === undefined) {
    const known = file.flows.map((candidate) => candidate.name).join(", ");
    fail("login-flow-missing", `--login-flow names "${name}", and this file has no such flow (it has: ${known}).`);
  }
  const found = flow as Flow;
  found.steps.forEach((step, index) => {
    const where = `login flow "${name}" step ${index + 1}`;
    if ("fill" in step && step.fill.fromEnv === undefined) {
      fail("login-literal", `${where}: fill: on "${step.fill.field}" carries a literal. A login takes its values from-env: `
        + "only, so that no secret is ever typed into a file that gets committed.");
    }
    if ("capture" in step) {
      fail("login-no-capture", `${where}: capture: inside a login. The transcript must not begin until the login has `
        + "ended, so a login captures nothing.");
    }
  });
  if (!("expect" in found.steps[found.steps.length - 1])) {
    fail("login-final-expect", `login flow "${name}" does not end with expect:. Without a post-condition the run cannot `
      + "tell a signed-in page from the login wall, and would report the wall as the product.");
  }
  return found;
}

/**
 * May this file be applied to this URL? By parsed origin, never a prefix (see `parseGoto`). A mismatch is a
 * refusal and never a warning: the file's `from-env:` values were named for one site.
 */
export function refuseIfWrongOrigin(file: FlowsFile, url: string): void {
  const target = originOf(url);
  if (target === file.origin) return;
  fail("origin-pinned", `This flows file declares origin ${file.origin}, and the run is against ${target ?? url}. Refusing: `
    + "a login's secrets were named for one site, and sending them to another is not something a tool may decide.");
}

/**
 * A literal typed into a password-type input, in ANY flow, is `auth-literal-secret`.
 *
 * Whether an input is a password input is a fact about the PAGE, which a parser cannot read, so the two
 * drivers (the worker's, and the CLI's Playwright one) call this with the input type they found. It is
 * here, pure, so both drivers share one decision and one message — and so it has a test that needs no
 * browser. It names the field and never the value.
 */
export function assertLiteralIsNotSecret(step: FillStep, control: { inputType: string }): void {
  if (step.fill.value === undefined || control.inputType.toLowerCase() !== "password") return;
  throw new FlowsError("auth-literal-secret",
    `fill: on "${step.fill.field}" types a literal into a password field. A password is never written in a flows `
    + "file; name the environment variable with from-env: instead.", "auth-literal-secret");
}
