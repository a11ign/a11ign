/**
 * `filesUnder` walks a real directory tree, and the defect it exists to close is a property of a real
 * syscall — so every fixture here is built on disk with `mkdirSync`/`symlinkSync` and nothing is mocked.
 *
 * A faked `fs` would answer `isDirectory()` however this file asked it to, and the whole question is what
 * the KERNEL says about a link: `stat` follows it and reports a directory, `lstat` (and the `Dirent` a
 * `withFileTypes` readdir hands back) does not. A test against a fake would pass identically over the
 * broken walk and the fixed one — see #2171, where four private copies of the broken walk stood for four
 * days because nothing could call one.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";

import { filesUnder } from "./files-under.mjs";

/**
 * Build a throwaway tree, hand it to `body`, and remove it however `body` ends.
 *
 * `try/finally` rather than the runner's own `after` hook: this file runs under rstest through
 * `scripts/rstest/node-test-shim.mjs`, which REFUSES by name every `node:test` API it does not map, and
 * the test context's `after` is one of them.
 */
function withTempTree(body: (root: string) => void): void {
  const root = mkdtempSync(join(tmpdir(), "files-under-"));
  try { body(root); } finally { rmSync(root, { recursive: true, force: true }); }
}

// THE NAME IS A PARAMETER ON PURPOSE. `guards` is what the five links in the primary checkout were
// actually called, and a walker patched by naming that one string would pass a test that only ever built
// `guards` — "a rule that names the debris it was written for fixes nothing the next time the debris has
// another name". Two names, so no literal can satisfy this.
const CYCLE_NAMES = ["guards", "pkg"];

test("the walk RETURNS over a real directory-symlink cycle, and reports no path through the link", () => {
  for (const name of CYCLE_NAMES) withTempTree((root) => {
    const dir = join(root, name);
    mkdirSync(dir);
    writeFileSync(join(dir, "a.mjs"), "");
    // The shape that was really there: `packages/guards/guards -> packages/guards`, a link to its own
    // parent. `statSync(...).isDirectory()` is true of it, so a walk that asks `stat` descends
    // `<name>/<name>/<name>/…` until the kernel refuses with ELOOP.
    symlinkSync(dir, join(dir, name));

    // RETURNS — this is the assertion the ELOOP fails. `assert.doesNotThrow` would report the throw as a
    // failure with the walk's own message, which is the diagnosis: keep it.
    const found = filesUnder(root);

    assert.deepEqual(found, [join(dir, "a.mjs")],
      `walking a tree whose ${name}/ links to itself must find the one real file and nothing else`);
    // The emptiness, stated apart from the deepEqual above so its failure names the cause. ITS POSITIVE
    // CONTROL is the next test: a walk that descended nothing would satisfy this perfectly.
    assert.deepEqual(found.filter((f) => f.includes(`${sep}${name}${sep}${name}${sep}`)), [],
      `no result may be reached THROUGH the link (${name}/${name}/…)`);
  });
});

test("THE CONTROL: the walk descends an ordinary subdirectory and finds the file inside it", () => {
  // Without this, every assertion above is satisfied by a walker that returns [] — and by a walker
  // "fixed" with `if (name === "pkg") continue`, which is the second mutation #2171 names. That mutant
  // silences the cycle above and loses both files here.
  withTempTree((root) => {
    mkdirSync(join(root, "pkg", "nested"), { recursive: true });
    writeFileSync(join(root, "pkg", "a.mjs"), "");
    writeFileSync(join(root, "pkg", "nested", "b.mjs"), "");

    assert.deepEqual(filesUnder(root), [join(root, "pkg", "a.mjs"), join(root, "pkg", "nested", "b.mjs")]);
  });
});

test("a symlink is not reported either, whether it points at a directory or at a file", () => {
  // Not an incidental consequence of not descending: a link's target is either already inside the root,
  // where reporting it hands the caller the same file twice under two names, or outside it, where a
  // caller that declared a subtree never agreed to read. Both callers here read what they are handed.
  withTempTree((root) => {
    mkdirSync(join(root, "pkg"));
    writeFileSync(join(root, "pkg", "a.mjs"), "");
    symlinkSync(join(root, "pkg", "a.mjs"), join(root, "pkg", "b.mjs"));
    symlinkSync(join(root, "pkg"), join(root, "elsewhere"));

    assert.deepEqual(filesUnder(root), [join(root, "pkg", "a.mjs")]);
  });
});

test("skipDirectory is asked by entry name, and keepFile decides what is reported", () => {
  withTempTree((root) => {
    mkdirSync(join(root, "node_modules"));
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "node_modules", "dep.mjs"), "");
    writeFileSync(join(root, "src", "kept.mjs"), "");
    writeFileSync(join(root, "src", "dropped.json"), "");

    assert.deepEqual(filesUnder(root, {
      skipDirectory: (name) => name === "node_modules",
      keepFile: (name) => name.endsWith(".mjs"),
    }), [join(root, "src", "kept.mjs")]);
  });
});

test("an unreadable root THROWS rather than reporting an empty tree", () => {
  // A walk that swallowed its own readdir would report success having examined nothing — the shape every
  // caller of this function already carries a floor against (`MIN_EXPECTED_SOURCE_FILES`, and the "or
  // this suite is vacuous" test beside the corpus walk). The floor stays; this makes it a backstop
  // rather than the only thing standing between a moved directory and a green guard.
  assert.throws(() => filesUnder(join(tmpdir(), "files-under-no-such-directory-2171")),
    /ENOENT/, "a missing root must fail loudly, not walk to []");
});
