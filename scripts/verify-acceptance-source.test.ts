// no-token: gh -- pure function over arrays and a stand-in `exists`; no `gh`, no network, no filesystem
/**
 * #4600: `acceptanceDiffOf` is what lets `verify` read the `.acceptance/` file a branch adds, as `pr:open` and CI do.
 *
 * POSITIVE CONTROL for the emptiness asserted below: the first case puts one added file in `added` and the last asserts the whole result, so a
 * function that returned `added: []` for everything fails the first case and not only the dropped-file ones.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { acceptanceDiffOf } from "./verify-acceptance-source.ts";

const ACCEPTANCE = ".acceptance/agent~foo-4600.md";
const present = new Set([ACCEPTANCE, "scripts/verify.ts", ".acceptance/agent~also-4600.md"]);
const exists = (path: string) => present.has(path);

test("an added .acceptance/ file that exists is in added and in files", () => {
  const diff = acceptanceDiffOf({ files: [ACCEPTANCE, "scripts/verify.ts"], added: [ACCEPTANCE], exists });
  assert.deepEqual(diff, { ok: true, files: [ACCEPTANCE, "scripts/verify.ts"], added: [ACCEPTANCE] });
});

test("an added path that does not exist is dropped from both lists", () => {
  const gone = ".acceptance/agent~gone-4600.md";
  const diff = acceptanceDiffOf({ files: [gone, "scripts/verify.ts"], added: [gone], exists });
  assert.deepEqual(diff.files, ["scripts/verify.ts"]);
  assert.deepEqual(diff.added, []);
});

test("a modified file is in files and not in added", () => {
  const diff = acceptanceDiffOf({ files: ["scripts/verify.ts"], added: [], exists });
  assert.deepEqual(diff.files, ["scripts/verify.ts"]);
  assert.deepEqual(diff.added, []);
});

test("two added .acceptance/ files both reach added, so checkBody can report the duplicate", () => {
  const second = ".acceptance/agent~also-4600.md";
  assert.deepEqual(acceptanceDiffOf({ files: [ACCEPTANCE, second], added: [ACCEPTANCE, second], exists }).added, [ACCEPTANCE, second]);
});
