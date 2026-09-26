/**
 * Reading a saved storage state — ADR 0038, amendment 7, choices 3 and 5.
 *
 * The file is a CREDENTIAL on the person's disk: every cookie in it may be a live session. So the refusals here name the
 * PATH and the REASON and never a fragment of the file. `JSON.parse`'s own message quotes the text it choked on ("Unexpected
 * token 's', "sessionid=…" is not valid JSON"), so it is never repeated; a shape problem names a list and an index, never a
 * name or a value.
 *
 * The worker reads the same file with its own copy (`packages/nvda-worker/src/auth-flow.mjs`, `stateShapeProblem`), because it
 * cannot import this package; `interpreter.test.ts` runs one table of files through both and requires the same sentence.
 */
import { FlowsError } from "./flows.js";
import type { StorageState } from "./scrub.js";

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const SAME_SITE = ["Strict", "Lax", "None"];

/** Why one cookie is not a cookie, or undefined. Names a field and never a value. */
function cookieProblem(cookie: unknown, at: string): string | undefined {
  if (!isObject(cookie)) return `${at} is not an object`;
  for (const field of ["name", "value", "domain"]) {
    if (typeof cookie[field] !== "string") return `${at} has no string "${field}"`;
  }
  if (cookie.domain === "") return `${at} has an empty "domain"`;
  if (cookie.path !== undefined && typeof cookie.path !== "string") return `${at} has a "path" that is not a string`;
  if (cookie.expires !== undefined && typeof cookie.expires !== "number") return `${at} has an "expires" that is not a number`;
  for (const field of ["httpOnly", "secure"]) {
    if (cookie[field] !== undefined && typeof cookie[field] !== "boolean") return `${at} has a "${field}" that is not true or false`;
  }
  if (cookie.sameSite !== undefined && !SAME_SITE.includes(cookie.sameSite as string)) return `${at} has a "sameSite" that is not Strict, Lax or None`;
  return undefined;
}

function originProblem(entry: unknown, at: string): string | undefined {
  if (!isObject(entry)) return `${at} is not an object`;
  if (typeof entry.origin !== "string") return `${at} has no string "origin"`;
  if (!Array.isArray(entry.localStorage)) return `${at} has no "localStorage" list`;
  for (const [index, item] of entry.localStorage.entries()) {
    if (!isObject(item) || typeof item.name !== "string" || typeof item.value !== "string") {
      return `${at}.localStorage[${index + 1}] is not an object with a string "name" and a string "value"`;
    }
  }
  return undefined;
}

/**
 * Why a parsed value is not a storage state (`cookies[]` and `origins[].localStorage[]`, Playwright's own shape), or undefined
 * when it is. Places are 1-based, as a person counts, and match the `state cookie 3` names the scrub set uses.
 */
export function stateShapeProblem(raw: unknown): string | undefined {
  if (!isObject(raw)) return "is not a storage state: the top level must be an object";
  if (!Array.isArray(raw.cookies)) return "is not a storage state: it has no \"cookies\" list";
  if (!Array.isArray(raw.origins)) return "is not a storage state: it has no \"origins\" list";
  for (const [index, cookie] of raw.cookies.entries()) {
    const problem = cookieProblem(cookie, `cookies[${index + 1}]`);
    if (problem) return `is not a storage state: ${problem}`;
  }
  for (const [index, entry] of raw.origins.entries()) {
    const problem = originProblem(entry, `origins[${index + 1}]`);
    if (problem) return `is not a storage state: ${problem}`;
  }
  return undefined;
}

/** A state file's text as a storage state, or a `FlowsError` naming the path and the reason and never the file. */
export function parseStorageState(text: string, path: string): StorageState {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    void error; // deliberately not repeated: a parser's message quotes a fragment of the text, and this text is a credential
    throw new FlowsError("file-shape", `the state file ${path} is not valid JSON`);
  }
  const problem = stateShapeProblem(raw);
  if (problem) throw new FlowsError("file-shape", `the state file ${path} ${problem}`);
  return raw as StorageState;
}

/** The file's text, read through `readText`, or a refusal that says which file. An I/O error names the path and no contents. */
export async function readStorageState(path: string, readText: (path: string) => Promise<string>): Promise<StorageState> {
  let text: string;
  try {
    text = await readText(path);
  } catch (error) {
    throw new FlowsError("file-shape", `the state file ${path} could not be read (${error instanceof Error ? error.message : String(error)})`);
  }
  return parseStorageState(text, path);
}
