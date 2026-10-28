// no-token: none -- reads .github/workflows/ci.yml; no network, no `gh`
// A11-370: a pull request stacked on another branch has that branch as its base, and `pull_request: branches: [main]` gave it no checks at all, so its reviewer (which starts on green checks) never started
// (agent-org#1984 on #1982, 2026-10-28). ci.yml's `pull_request` trigger has no base filter; `main` stays behind the merge queue's `merge_group` run, which keeps its filter.
//
// THE CHECK IS A FUNCTION OVER THE PARSED TRIGGERS, returning what is wrong, and it is run on a copy with the filter put back (a check that passes on everything would pass the real file too).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

type Triggers = Record<string, { branches?: string[]; types?: string[] } | null>;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const triggersOf = (text: string): Triggers => parseYaml(text).on;

/** Why a pull request with a base other than `main` would get no CI under `triggers`, or null when it would. */
function stackedGap(triggers: Triggers): string | null {
  const pull = triggers.pull_request;
  if (pull === undefined) return "ci.yml has no pull_request trigger";
  const branches = pull?.branches;
  if (branches === undefined) return null;
  return branches.some((pattern) => pattern !== "main") ? null : `pull_request is filtered to base ${branches.join(", ")}, so a pull request stacked on another branch gets no checks`;
}

const ciText = readFileSync(resolve(ROOT, ".github/workflows/ci.yml"), "utf8");
const ci = triggersOf(ciText);
const jobsOf = (text: string): Record<string, { if?: string }> => parseYaml(text).jobs;

/** The jobs that build: a draft pull request must not run them (A11-370 review). */
const HEAVY = ["ts", "python", "board", "rulesFitness"] as const;

/** What an `if:` reads: dotted paths into the event's context. */
type Context = Record<string, unknown>;

const FUNCTIONS: Record<string, (...args: never[]) => unknown> = {
  contains: (haystack: unknown, needle: unknown) => (Array.isArray(haystack) ? haystack.includes(needle) : String(haystack).includes(String(needle))),
  fromJSON: (text: string) => JSON.parse(text),
};

/**
 * EVALUATES a GitHub Actions `if:` expression against `context`, so a condition is judged by what it does, not by the text it contains. It takes the forms ci.yml's job conditions use: `'...'` strings, dotted
 * context paths, `==`, `!=`, `!`, `&&`, `||`, parentheses and the `contains`/`fromJSON` functions. Anything else throws, so a new form fails this test rather than passing it unread.
 */
function holds(expression: string, context: Context): boolean {
  const tokens = expression.replace(/^\$\{\{|\}\}$/g, "").match(/'(?:[^']|'')*'|[A-Za-z_][\w.-]*|==|!=|&&|\|\||[!(),]|\S/g) ?? [];
  const js = tokens.map((token, at) => {
    if (token.startsWith("'")) return JSON.stringify(token.slice(1, -1).replace(/''/g, "'"));
    if (token === "==") return "===";
    if (token === "!=") return "!==";
    if (["&&", "||", "!", "(", ")", ","].includes(token)) return token;
    if (/^[A-Za-z_]/.test(token)) {
      if (tokens[at + 1] === "(") { if (!(token in FUNCTIONS)) throw new Error(`the condition calls ${token}, which this test cannot evaluate`); return `f.${token}`; }
      return token === "true" || token === "false" ? token : `c(${JSON.stringify(token)})`;
    }
    throw new Error(`the condition has ${token}, which this test cannot evaluate`);
  }).join(" ");
  const read = (path: string): unknown => path.split(".").reduce<unknown>((value, key) => (value as Record<string, unknown> | undefined)?.[key], context);
  return Boolean(new Function("c", "f", `return (${js});`)(read, FUNCTIONS));
}

/** The context of a pull request update that changed everything, on `event`, as a draft when `draft`. */
const contextOf = (event: string, draft: boolean): Context => ({
  needs: { changed: { outputs: Object.fromEntries(HEAVY.map((name) => [name, "true"])) } },
  github: { event_name: event, event: { action: "synchronize", pull_request: event === "pull_request" ? { draft } : undefined } },
});

/** Why a draft pull request would run a job that builds, why another run would skip one, or why marking a draft ready would start no run; null when none. */
function draftGap(triggers: Triggers, jobs: Record<string, { if?: string }>): string | null {
  for (const name of HEAVY) {
    const runs = (event: string, draft: boolean) => jobs[name]?.if === undefined || holds(jobs[name]!.if!, contextOf(event, draft));
    if (runs("pull_request", true)) return `a draft pull request runs ${name}`;
    const skipped = ["pull_request", "merge_group", "push"].find((event) => !runs(event, false));
    if (skipped !== undefined) return `${name} does not run on a ${skipped} that is not a draft`;
  }
  return triggers.pull_request?.types?.includes("ready_for_review") ? null : "marking a draft ready starts no run, so its jobs that build never run";
}

test("ci.yml runs on a pull request whose base is not main, so a stacked pull request has checks", () => {
  assert.equal(stackedGap(ci), null);
  assert.equal(ci.pull_request?.branches, undefined, "the pull_request trigger has no base filter at all");
});

test("the check sees the filter that left a stacked pull request with no CI", () => {
  assert.match(stackedGap({ ...ci, pull_request: { ...ci.pull_request, branches: ["main"] } }) ?? "", /filtered to base main/);
  assert.equal(stackedGap({ ...ci, pull_request: { ...ci.pull_request, branches: ["main", "admin/**"] } }), null);
});

test("main stays behind the merge queue: merge_group keeps its filter on main, and the pull_request types still carry edited", () => {
  assert.deepEqual(ci.merge_group?.branches, ["main"]);
  assert.ok(ci.pull_request?.types?.includes("edited"), "a body edit re-reads the changeset line");
});

test("a draft pull request runs none of the jobs that build, and marking it ready starts the run that does", () => {
  assert.equal(draftGap(ci, jobsOf(ciText)), null);
});

test("the draft check sees a job that still runs on a draft, a job that skips more than drafts, and a trigger without ready_for_review", () => {
  const jobs = jobsOf(ciText);
  for (const name of HEAVY) {
    assert.match(draftGap(ci, { ...jobs, [name]: { if: "needs.changed.outputs.ts == 'true'" } }) ?? "", new RegExp(`runs ${name}`));
    assert.match(draftGap(ci, { ...jobs, [name]: { if: `${jobs[name]?.if} || github.event.pull_request.draft` } }) ?? "", new RegExp(`runs ${name}`), "extra logic that still runs it on a draft");
    assert.match(draftGap(ci, { ...jobs, [name]: { if: `${jobs[name]?.if} && github.event_name == 'pull_request'` } }) ?? "", new RegExp(`${name} does not run on a merge_group`));
  }
  assert.match(draftGap({ ...ci, pull_request: { types: ["opened", "synchronize"] } }, jobs) ?? "", /starts no run/);
  assert.throws(() => holds("startsWith(github.ref, 'refs/')", {}), /cannot evaluate/);
});
