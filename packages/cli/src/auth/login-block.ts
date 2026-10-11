// The `login:` block (v3 login phase 2, #4084): a start URL, the env-var NAMES of the username, password and
// TOTP secret, and ONE signed-in check. This module is the schema, its refusals, and the one plan every sign-in
// by a block runs (`login --check`, and a scan's rule layer): it reads no file and no `process.env`.
// `flows.ts` calls `parseLoginBlock` for a flows file's `login:` key, and `resolve.ts` sends the block to the worker.
//
// A refusal names the rule and the KEY, never the value: the value may be the secret somebody pasted.
import type { PageCondition } from "./flows.js";
import type { AuthPlan } from "./interpreter.js";

export type LoginBlockRule =
  | "login-block-shape"
  | "login-check-url"
  | "login-literal"
  | "login-no-check"
  | "login-unknown-key"
  | "login-url-not-http";

export class LoginBlockError extends Error {
  readonly rule: LoginBlockRule;
  /** The sentence without its `(rule: ...)` tail, for a caller that re-raises it under its own error type and adds the tail itself. */
  readonly detail: string;
  constructor(rule: LoginBlockRule, message: string) {
    super(`${message} (rule: ${rule})`);
    this.name = "LoginBlockError";
    this.rule = rule;
    this.detail = message;
  }
}

/** The signed-in check: an element by role and name, or a URL. Exactly one. */
export type LoginCheck = { role: string; name: string } | { url: string };

export interface LoginBlock {
  url: string;
  /** The NAME of the environment variable holding the username. */
  username: string;
  password: string;
  /** The NAME of the variable holding a bare base32 seed or a full `otpauth://` URI. */
  totp: string;
  check: LoginCheck;
  organization?: string;
  /** Accessible names for localised or rewritten login text, by what they stand for. */
  fields?: Record<string, string>;
  idpOrigins: string[];
}

const KEYS = ["url", "username", "password", "totp", "check", "organization", "fields", "idp-origins"];
const ENV_NAME_KEYS = ["username", "password", "totp"] as const;
const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

const fail = (rule: LoginBlockRule, message: string): never => {
  throw new LoginBlockError(rule, message);
};

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const isText = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";

/** `javascript:`, `file:`, `data:` and a bare path are all refused here; the key is named, the value is not. */
function httpUrl(key: string, value: unknown): string {
  if (!isText(value)) return fail("login-block-shape", `login: "${key}" must be a URL string.`);
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch (cause) {
    throw new LoginBlockError("login-url-not-http", `login: "${key}" is not an absolute http(s) URL. ${(cause as Error).name}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    fail("login-url-not-http", `login: "${key}" must be an http: or https: URL.`);
  }
  // Same boundary as flows.ts: a credential does not belong in a file that is committed, and the key is named, never the value.
  if (parsed.username !== "" || parsed.password !== "") {
    fail("login-literal", `login: "${key}" carries a username or password. Credentials are never written in the file: name the variable that holds them.`);
  }
  return value;
}

function envName(key: string, value: unknown): string {
  if (!isText(value)) return fail("login-block-shape", `login: "${key}" must name an environment variable.`);
  if (!ENV_NAME.test(value)) {
    fail("login-literal", `login: "${key}" holds something that is not an environment-variable name (letters, digits and `
      + "underscores, not starting with a digit). Credentials are never written in the file: name the variable that holds it.");
  }
  return value;
}

function parseCheck(value: unknown): LoginCheck {
  if (value === undefined) return fail("login-no-check", "login: has no \"check:\". A sign-in is only done when something says so: name an element by role and name, or a URL.");
  if (!isObject(value)) return fail("login-block-shape", "login: \"check\" must be a mapping with role and name, or url.");
  const keys = Object.keys(value);
  const unknown = keys.filter((k) => !["role", "name", "url"].includes(k));
  if (unknown.length > 0) return fail("login-unknown-key", `login: check has unknown key "${unknown[0]}"; it takes role and name, or url.`);
  if (keys.includes("url")) {
    if (keys.length !== 1) return fail("login-block-shape", "login: check takes role and name, or url, not both.");
    return { url: httpUrl("check.url", value.url) };
  }
  if (!isText(value.role) || !isText(value.name)) {
    return fail("login-no-check", "login: check names neither an element (role and name) nor a url.");
  }
  return { role: value.role, name: value.name };
}

function parseFields(value: unknown): Record<string, string> {
  if (!isObject(value)) return fail("login-block-shape", "login: \"fields\" must be a mapping of names.");
  const out: Record<string, string> = {};
  for (const [key, name] of Object.entries(value)) {
    if (!isText(name)) return fail("login-block-shape", `login: fields."${key}" must be a non-empty accessible name.`);
    out[key] = name;
  }
  return out;
}

/** One identity-provider origin, exact and nothing wider, as flows.ts reads it; returned as `URL.origin`. */
function idpOrigin(key: string, value: unknown, appOrigin: string): string {
  const text = httpUrl(key, value);
  if (text.includes("*")) return fail("login-block-shape", `login: "${key}" holds a wildcard; list each origin exactly.`);
  const parsed = new URL(text);
  if (parsed.pathname !== "/" || parsed.search !== "" || parsed.hash !== "") {
    fail("login-block-shape", `login: "${key}" carries a path, query or fragment; an origin is a scheme, a host and a port.`);
  }
  if (parsed.origin === appOrigin) fail("login-block-shape", `login: "${key}" is the start URL's own origin, which needs no allowance.`);
  return parsed.origin;
}

function parseIdpOrigins(value: unknown, appOrigin: string): string[] {
  if (!Array.isArray(value)) return fail("login-block-shape", "login: \"idp-origins\" must be a list of origins.");
  return [...new Set(value.map((origin, i) => idpOrigin(`idp-origins[${i}]`, origin, appOrigin)))];
}

/** Parse the already-parsed YAML of a `login:` mapping; throws a `LoginBlockError` naming the rule. */
export function parseLoginBlock(value: unknown): LoginBlock {
  if (!isObject(value)) return fail("login-block-shape", "login: must be a mapping.");
  const unknown = Object.keys(value).find((k) => !KEYS.includes(k));
  if (unknown !== undefined) fail("login-unknown-key", `login: has unknown key "${unknown}"; the keys are ${KEYS.join(", ")}.`);
  // Check before shape-checking the rest, so a block missing its check says so rather than something earlier.
  const check = parseCheck(value.check);
  const url = httpUrl("url", value.url);
  const [username, password, totp] = ENV_NAME_KEYS.map((key) => envName(key, value[key]));
  const block: LoginBlock = { url, username, password, totp, check, idpOrigins: [] };
  if (value.organization !== undefined) {
    if (!isText(value.organization)) fail("login-block-shape", "login: \"organization\" must be a non-empty string.");
    block.organization = value.organization as string;
  }
  if (value.fields !== undefined) block.fields = parseFields(value.fields);
  if (value["idp-origins"] !== undefined) block.idpOrigins = parseIdpOrigins(value["idp-origins"], new URL(url).origin);
  return block;
}

/**
 * `auth.loginBlock` as the worker validates it (`@a11ign/screenreader-worker` v0.11.0, `LoginBlockPlan`): its own key names, the
 * three NAMES of environment variables and never a value. **`fields` and `idp-origins` do not ride in it**: the worker refuses
 * an unknown key, and the origins go beside it as `auth.idpOrigins`.
 */
export interface LoginBlockWire {
  readonly url: string;
  readonly usernameEnv: string;
  readonly passwordEnv: string;
  readonly totpEnv: string;
  readonly check: LoginCheck;
  readonly organization?: string;
}

export function loginBlockWire(block: LoginBlock): LoginBlockWire {
  const { url, username, password, totp, check, organization } = block;
  return { url, usernameEnv: username, passwordEnv: password, totpEnv: totp, check, ...(organization === undefined ? {} : { organization }) };
}

/** The login as the interpreters run it, from a block. Names only: no value of an environment variable. */
export interface LoginBlockPlan {
  plan: AuthPlan;
  startUrl: string;
  appOrigin: string;
  /** The signed-in check as the `expect:` that ends the login: the loop's exit condition and the check on the signed-out page. */
  stop: PageCondition & { timeoutSeconds: number };
  credentialNames: string[];
  totpName: string;
}

/**
 * The plan `login --check` and a scan's rule layer sign in by, so the two cannot drift: `{ goto }, { auto }, { expect }` with the
 * loop's variable names. **A `url:` check is refused**, because the signed-out page cannot be asked about a URL before anything is
 * typed; the same rule on both paths. `expectSeconds` is flows.ts's default, passed in because flows.ts imports this module.
 */
export function loginBlockPlan(block: LoginBlock, { expectSeconds }: { expectSeconds: number }): LoginBlockPlan {
  if (!("role" in block.check)) {
    throw new LoginBlockError("login-check-url", "login: \"check\" is a url:, which cannot be run yet. Name an element as the check "
      + "(role and name), which the signed-out page can be asked about before anything is typed.");
  }
  const url = new URL(block.url);
  const stop = { kind: block.check.role === "heading" ? "heading" : "control", name: block.check.name, timeoutSeconds: expectSeconds } as const;
  return {
    plan: {
      login: [{ goto: `${url.pathname}${url.search}` }, { auto: true }, { expect: stop }],
      auto: { username: block.username, password: block.password, totp: block.totp, organization: block.organization },
      idpOrigins: block.idpOrigins,
    },
    startUrl: url.href, appOrigin: url.origin, stop, credentialNames: [block.username, block.password], totpName: block.totp,
  };
}

/**
 * The plan the rule layer signs in by: a request with no block is its own plan, and one with a block is the block's, rebuilt
 * from the wire shape (`login` is empty there, and `auto:` is the CLI's own and never sent).
 */
export function ruleLayerPlanOf(
  request: AuthPlan & { readonly loginBlock?: LoginBlockWire }, options: { expectSeconds: number },
): AuthPlan {
  const { loginBlock } = request;
  if (loginBlock === undefined) return request;
  const block: LoginBlock = {
    url: loginBlock.url, username: loginBlock.usernameEnv, password: loginBlock.passwordEnv, totp: loginBlock.totpEnv,
    check: loginBlock.check, organization: loginBlock.organization, idpOrigins: [...(request.idpOrigins ?? [])],
  };
  return loginBlockPlan(block, options).plan;
}
