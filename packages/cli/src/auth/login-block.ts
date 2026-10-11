// The `login:` block (v3 login phase 2, #4084): a start URL, the env-var NAMES of the username, password and
// TOTP secret, and ONE signed-in check. This module is the schema and its refusals and nothing else: it reads
// no file and no `process.env`, and `flows.ts` does not call it yet (wiring is the flows-verbs row's).
//
// A refusal names the rule and the KEY, never the value: the value may be the secret somebody pasted.

export type LoginBlockRule =
  | "login-block-shape"
  | "login-literal"
  | "login-no-check"
  | "login-unknown-key"
  | "login-url-not-http";

export class LoginBlockError extends Error {
  readonly rule: LoginBlockRule;
  constructor(rule: LoginBlockRule, message: string) {
    super(`${message} (rule: ${rule})`);
    this.name = "LoginBlockError";
    this.rule = rule;
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

function parseIdpOrigins(value: unknown): string[] {
  if (!Array.isArray(value)) return fail("login-block-shape", "login: \"idp-origins\" must be a list of origins.");
  return value.map((origin, i) => httpUrl(`idp-origins[${i}]`, origin));
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
  if (value["idp-origins"] !== undefined) block.idpOrigins = parseIdpOrigins(value["idp-origins"]);
  return block;
}
