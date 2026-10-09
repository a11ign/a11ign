/**
 * NO TRACKED DOC PINS AN a11ign RELEASE MORE THAN ONE MINOR BEHIND THE NEWEST TAG, on the real checkout (#4508).
 *
 * Its own file because it needs the repository's `a11ign@<x.y.z>` tags, which the `ts` job's full clone holds and the acceptance job's
 * does not (the tags are not reachable from `main`, so `History: full` cannot fetch them, measured on #4521). With no tags it says
 * `CANNOT TELL` and FAILS: it is never turned into a pass or a skip. The named cases are in `docs-release-pin-currency.test.ts`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { sandboxGitEnv } from "./git-env.ts";
import { CANNOT_TELL, GUARDED_DOC, pinFaults, type Reader } from "./docs-release-pin-currency.ts";

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
  docs: () =>
    git(["ls-files", "-z", "README.md", "docs"])
      .split("\0")
      .filter((path) => GUARDED_DOC.test(path))
      .map((path) => ({ path, text: readFileSync(`${REPO}${path}`, "utf8") })),
};

test("no tracked doc pins an a11ign release more than one minor behind the newest tag", () => {
  const verdict = pinFaults(checkoutReader);
  assert.notEqual(verdict.status, "cannot-tell", CANNOT_TELL);
  assert.ok(verdict.pins.length > 0, "no `uses: a11ign/a11ign@<sha>` pin found in any doc: the positive control for the assertion below");
  assert.deepEqual(verdict.faults, []);
});
