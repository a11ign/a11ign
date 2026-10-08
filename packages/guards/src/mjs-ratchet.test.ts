/**
 * THE COUNT OF `.js`/`.mjs`/`.cjs` SOURCE FILES IN THIS REPOSITORY MAY ONLY GO DOWN (ADR 0043; #4243 built the check, #4261 adopts it).
 *
 * The function lives in `@a11ign/toolchain/mjs-ratchet` and has its own controls there. This file points it at THIS tree and proves the
 * pointing bites: `from` is this test, and the function walks up to `mjs-ratchet.baseline.json`, so the layout flatten that moves this
 * file edits nothing here. It runs under `test:org`, so no workflow file is touched.
 *
 * THE CONTROLS RUN ON A MIRROR, not on the real tree: a directory with no `.git` holding one empty file per baseline entry (the walk the
 * function uses for agent-org's gate copy), so a test never edits a tracked file to prove a refusal.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { BASELINE_FILE, checkMjsRatchet, findBaselineRoot, type Baseline } from "@a11ign/toolchain/mjs-ratchet";

const HERE = fileURLToPath(import.meta.url);

function realBaseline(): Baseline {
  return JSON.parse(readFileSync(join(findBaselineRoot(HERE), BASELINE_FILE), "utf8")) as Baseline;
}

/** A name is placed in its own directory, so the same basename listed twice (`x.mjs` in two places) is two files. */
function mirrorPaths(baseline: Baseline): string[] {
  return [...baseline.files.map((name, index) => join(`d${index}`, name)), ...baseline.exceptions.map((entry) => entry.path)];
}

/** Lay a throwaway tree holding `paths` and `baseline`, hand its root to `body`, and remove it however `body` ends. */
function withMirror(paths: string[], baseline: unknown, body: (root: string) => void): void {
  const root = mkdtempSync(join(tmpdir(), "mjs-ratchet-"));
  try {
    for (const path of paths) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), "");
    }
    writeFileSync(join(root, BASELINE_FILE), JSON.stringify(baseline));
    body(root);
  } finally { rmSync(root, { recursive: true, force: true }); }
}

test("the JavaScript source count has not risen above the committed baseline", () => {
  const result = checkMjsRatchet({ from: HERE });
  assert.ok(result.ok, result.message);
  // POSITIVE CONTROL: an `ok` over a tree that read nothing would be the vacuous pass.
  assert.ok(result.count > 0, `the walk counted no JavaScript source in ${result.root}: it read nothing`);
});

test("CONTROL: a mirror of the committed baseline passes, so the failures below are the edits and not the mirror", () => {
  const baseline = realBaseline();
  withMirror(mirrorPaths(baseline), baseline, (root) => {
    const result = checkMjsRatchet({ from: root });
    assert.ok(result.ok, result.message);
    assert.equal(result.count, baseline.files.length);
  });
});

test("a baseline with one name removed fails and NAMES the file", () => {
  const baseline = realBaseline();
  const [removed, ...rest] = baseline.files;
  withMirror(mirrorPaths(baseline), { ...baseline, files: rest }, (root) => {
    const result = checkMjsRatchet({ from: root });
    assert.equal(result.ok, false);
    assert.ok(result.message.includes(removed!), `the failure does not name ${removed}: ${result.message}`);
  });
});

test("a file the tree lost passes and says the baseline can be lowered", () => {
  const baseline = realBaseline();
  withMirror(mirrorPaths(baseline).slice(1), baseline, (root) => {
    const result = checkMjsRatchet({ from: root });
    assert.ok(result.ok, result.message);
    assert.match(result.message, /baseline can be lowered/);
  });
});

test("an exception with no `why` fails", () => {
  const baseline = realBaseline();
  const [first, ...others] = baseline.exceptions;
  withMirror(mirrorPaths(baseline), { ...baseline, exceptions: [{ path: first!.path, why: "" }, ...others] }, (root) => {
    const result = checkMjsRatchet({ from: root });
    assert.equal(result.ok, false);
    assert.match(result.message, /has no `why`/);
  });
});
