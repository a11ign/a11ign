/**
 * NO TRACKED DOC PINS AN a11ign RELEASE MORE THAN ONE MINOR BEHIND THE NEWEST TAG, on the real checkout (#4508).
 *
 * Its own file because it needs the repository's `a11ign@<x.y.z>` tags, which the `ts` job's full clone holds and the acceptance job's
 * does not (the tags are not reachable from `main`, so `History: full` cannot fetch them, measured on #4521). With no tags it says
 * `CANNOT TELL` and FAILS: it is never turned into a pass or a skip. The named cases are in `docs-release-pin-currency.test.ts`.
 *
 * A WORLD-STATE GUARD NEVER BLOCKS A PULL REQUEST THAT DID NOT TOUCH WHAT IT CHECKS (#5125). It reads the newest release, so every release turned it red for every
 * PR in the merge queue at once until a doc pin was bumped: #5115, #5122 and #5124 were ejected by it on 2026-10-11 with diffs that touched no doc, and sat unqueued.
 * On a `pull_request` or `merge_group` run it therefore runs only when the diff touches a doc it checks or the guard itself; on every other event (`schedule`: the nightly
 * `pnpm run coverage`, which runs the whole suite and files its failure on #169; `push`; a local run) it runs, and when the diff cannot be read it runs: a skip is
 * for a diff that was READ and touched nothing, never for one that could not be. The decision is `scopeOf`, below, with its named cases.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { sandboxGitEnv } from "./git-env.ts";
import { GUARDED_DOC, pinFaults, type Reader } from "./docs-release-pin-currency.ts";

const REPO = fileURLToPath(new URL("../../..", import.meta.url));

const git = (args: string[]) => execFileSync("git", args, { cwd: REPO, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: sandboxGitEnv() });

/** The real reader: local tags (`%(*objectname)` is the peeled commit of an annotated tag, empty for a lightweight one) and tracked docs. */
const checkoutReader: Reader = {
  tags: () =>
    git(["for-each-ref", "refs/tags/a11ign@*", "--format=%(refname:short) %(objectname) %(*objectname)"])
      .split("\n")
      .filter(Boolean)
      .map((row) => {
        const [name, object, peeled] = row.split(" ");
        return { name, commit: peeled || object };
      }),
  /** Absent `v0` is a verdict (cannot-tell), not an error: `rev-parse` exits non-zero for it and that is caught here. */
  v0Commit: () => {
    try {
      return git(["rev-parse", "--verify", "--quiet", "refs/tags/v0^{commit}"]).trim();
    } catch {
      return undefined;
    }
  },
  docs: () =>
    git(["ls-files", "-z", "README.md", "docs"])
      .split("\0")
      .filter((path) => GUARDED_DOC.test(path))
      .map((path) => ({ path, text: readFileSync(`${REPO}${path}`, "utf8") })),
};

/** The events whose diff says what a run is about; every other event is a reading of the world as it is, which is what a nightly run is for. */
const DIFF_SCOPED_EVENTS = ["pull_request", "merge_group"];
/** The guard's own files: a change to its logic or its fixtures is a change it must answer for. */
const GUARD_FILES = /^packages\/guards\/src\/docs-release-pin-currency[.-]/;
/** How many touched paths a reason names. */
const NAMED_PATHS = 3;
const FULL_SHA = /^[0-9a-f]{40}$/;

type Scope = { run: true; why: string } | { run: false; why: string };

/** Does this run's diff touch what the guard checks? PURE: `changed` is `null` when the diff could not be read, and that RUNS the guard. */
function scopeOf({ event, changed }: { event: string | undefined; changed: readonly string[] | null }): Scope {
  if (event === undefined || !DIFF_SCOPED_EVENTS.includes(event)) return { run: true, why: `event ${event ?? "(none: a local run)"} reads the world as it is` };
  if (changed === null) return { run: true, why: "the diff could not be read, so the guard runs" };
  const touched = changed.filter((path) => GUARDED_DOC.test(path) || GUARD_FILES.test(path));
  if (touched.length > 0) return { run: true, why: `the diff touches ${touched.slice(0, NAMED_PATHS).join(", ")}` };
  return { run: false, why: `a ${event} run whose ${changed.length} changed file(s) touch no doc this guard checks and not the guard itself: the release it reads is the world's, not this change's (#5125); the nightly run reads it` };
}

/** The changed files of THIS run, from the event payload's base commit; `null` when the event, the payload or the base is not there to read. */
function changedFilesOfRun(env: NodeJS.ProcessEnv): string[] | null {
  const event = env.GITHUB_EVENT_NAME;
  if (event === undefined || !DIFF_SCOPED_EVENTS.includes(event) || env.GITHUB_EVENT_PATH === undefined) return null;
  try {
    const payload = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, "utf8"));
    const base: unknown = event === "merge_group" ? payload?.merge_group?.base_sha : payload?.pull_request?.base?.sha;
    if (typeof base !== "string" || !FULL_SHA.test(base)) return null;
    return git(["diff", "--name-only", "-z", base, "HEAD"]).split("\0").filter(Boolean);
  } catch {
    return null; // a base commit this clone does not hold, or a payload that is not JSON: the diff is UNKNOWN, and unknown runs
  }
}

const scope = scopeOf({ event: process.env.GITHUB_EVENT_NAME, changed: changedFilesOfRun(process.env) });

test("the scope: a diff that touches no checked doc skips, and anything else, unknown included, runs", () => {
  const README = ["README.md"];
  assert.equal(scopeOf({ event: "merge_group", changed: ["packages/judge/src/a.ts", ".github/workflows/ci.yml"] }).run, false, "the #5124 shape: a diff that touches no doc");
  assert.equal(scopeOf({ event: "pull_request", changed: ["packages/judge/src/a.ts"] }).run, false);
  assert.equal(scopeOf({ event: "merge_group", changed: [] }).run, false, "an empty diff touches nothing");
  for (const event of DIFF_SCOPED_EVENTS) {
    assert.equal(scopeOf({ event, changed: README }).run, true, `${event}: README.md is checked`);
    assert.equal(scopeOf({ event, changed: ["docs/try-it.md"] }).run, true, `${event}: so is docs/*.md`);
    assert.equal(scopeOf({ event, changed: ["docs/adr/0021-x.md"] }).run, true, `${event}: and docs/adr/*.md`);
    assert.equal(scopeOf({ event, changed: ["packages/guards/src/docs-release-pin-currency.ts"] }).run, true, `${event}: the guard's own logic`);
    assert.equal(scopeOf({ event, changed: ["packages/guards/src/docs-release-pin-currency.test.ts"] }).run, true, `${event}: and its cases`);
    assert.equal(scopeOf({ event, changed: null }).run, true, `${event}: a diff that could not be read is not a diff that touched nothing`);
  }
  assert.equal(scopeOf({ event: "merge_group", changed: ["docs/corpus/deep/x.md"] }).run, false, "a doc deeper than docs/*.md is not one the guard reads");
  // THE NIGHTLY AND THE LOCAL RUN: no diff is consulted, and the guard runs, so the world is still read once a day.
  for (const event of ["schedule", "push", "workflow_dispatch", undefined]) {
    assert.equal(scopeOf({ event, changed: ["packages/judge/src/a.ts"] }).run, true, `${event ?? "local"}: reads the world`);
  }
});

test("no tracked doc pins an a11ign release more than one minor behind the release v0 points at", { skip: scope.run ? false : scope.why }, () => {
  const verdict = pinFaults(checkoutReader);
  assert.notEqual(verdict.status, "cannot-tell", verdict.faults[0]);
  assert.ok(verdict.pins.length > 0, "no `uses: a11ign/a11ign@<sha>` pin found in any doc: the positive control for the assertion below");
  assert.deepEqual(verdict.faults, []);
});
