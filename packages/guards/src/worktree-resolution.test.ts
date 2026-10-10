/**
 * The CALLERS of the worktree-resolution floor: `assert-glob-not-empty.ts` asks it before any runner starts, and `agent-org worktree:whose`
 * prints its line. The leaf itself, its classifier and its own tests live in `@a11ign/toolchain` (`lib/worktree-resolution`, #4425): four of its
 * tests stayed here because they exercise a CALLER (`memberScopeLister`, a copy of `assert-glob-not-empty.ts`, the `agent-org` CLI), not the leaf.
 *
 * CONSTRUCTED TREES, real symlinks: the classifier's whole content is what `realpath` returns, so a fake filesystem would test the string
 * handling and leave the resolution untouched.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { OVERRIDE_ENV, suiteStartVerdict } from "@a11ign/toolchain/lib/worktree-resolution";
import { memberScopeLister } from "./assert-glob-not-empty.ts";

const REPO = fileURLToPath(new URL("../../../", import.meta.url));
const PACKAGE = "agent-org";

/** A scratch directory holding the trees a test builds, removed afterwards. */
function withScratch(body: (base: string) => void) {
  const base = realpathSync(mkdtempSync(join(tmpdir(), "resolution-")));
  try { body(base); } finally { rmSync(base, { recursive: true, force: true }); }
}

/** A checkout with its own `packages/<PACKAGE>` directory. */
function checkout(base: string, name: string) {
  const root = join(base, name);
  mkdirSync(join(root, "packages", PACKAGE), { recursive: true });
  return root;
}

/** Make `tree/node_modules/@a11ign/agent-org` a symlink to `target`. */
function linkScope(tree: string, target: string) {
  mkdirSync(join(tree, "node_modules", "@a11ign"), { recursive: true });
  symlinkSync(target, join(tree, "node_modules", "@a11ign", PACKAGE));
}

test("#2181 THE CALLER: `worktree:whose` prints the resolution line for the tree it is asked about", () => {
  // The classifier was the first thing this repo ships with no caller three times over, so the claim
  // under test is that a session RUNNING the command it already runs is told.
  withScratch((base) => {
    const primary = checkout(base, "primary");
    const tree = checkout(base, "wt-cli");
    linkScope(tree, join(primary, "packages", PACKAGE));
    const ran = spawnSync("agent-org", ["worktree:whose", tree],
      { encoding: "utf8", env: { ...process.env, A11Y_SESSION: "worker-capture" } });
    assert.equal(ran.status, 0, ran.stderr);
    assert.match(ran.stdout, /UNSTAMPED/, "control: the ownership answer is still there");
    assert.ok(ran.stdout.includes(primary), "the resolution line must name the checkout being read");
    assert.match(ran.stdout, /resolve OUTSIDE this worktree/);
  });
});

test("#3447: the floor asks only about the workspace's members, so a registry copy of a package that LEFT is not a stale copy and a member's still is", () => {
  withScratch((base) => {
    const tree = checkout(base, "wt-registry");
    linkScope(tree, join(tree, "packages", PACKAGE));
    // `screenreader-worker` has no directory and no manifest name under packages/: the registry copy IS its source.
    const left = join(tree, "node_modules", "@a11ign", "screenreader-worker");
    mkdirSync(left, { recursive: true });
    writeFileSync(join(left, "index.mjs"), "// installed from the registry\n");
    const asked = (): ReturnType<typeof suiteStartVerdict> => suiteStartVerdict(tree, { env: {}, list: memberScopeLister(tree) });
    assert.equal(suiteStartVerdict(tree, { env: {} }).action, "refuse", "CONTROL: asked about every entry, the guard refuses this tree, so the lister is what changes the answer");
    assert.equal(asked().action, "proceed");
    // A package that is no member but is LINKED to another checkout is the broken shape whatever it is called, and is still asked about.
    const elsewhere = join(base, "other-checkout");
    mkdirSync(elsewhere, { recursive: true });
    symlinkSync(elsewhere, join(tree, "node_modules", "@a11ign", "not-a-member"));
    assert.equal(asked().action, "refuse", "a non-member that reads another checkout is not excused by not being a member");
    rmSync(join(tree, "node_modules", "@a11ign", "not-a-member"));
    // THE OTHER DIRECTION: the same copy shape for a package the workspace DOES hold still refuses. A member's directory and its
    // published name differ (`worker-fleet` is `@a11ign/screenreader-fleet`), so a name that only the manifest knows must count too.
    // A fixture directory, not the real one: naming a layer's own path here would make this test an edge out of the guards.
    mkdirSync(join(tree, "packages", "renamed-member"), { recursive: true });
    writeFileSync(join(tree, "packages", "renamed-member", "package.json"), JSON.stringify({ name: "@a11ign/by-manifest-name" }));
    mkdirSync(join(tree, "node_modules", "@a11ign", "by-manifest-name"), { recursive: true });
    assert.equal(asked().action, "refuse");
  });
});

/** An installed package under `<checkout>/node_modules/.pnpm/`, the way pnpm lays one out, and `tree/node_modules/@a11ign/<name>` linked to it. */
function linkInstalled(tree: string, checkout: string, name: string) {
  const installed = join(checkout, "node_modules", ".pnpm", `@a11ign+${name}@1.0.0`, "node_modules", "@a11ign", name);
  mkdirSync(installed, { recursive: true });
  writeFileSync(join(installed, "index.mjs"), "// installed\n");
  mkdirSync(join(tree, "node_modules", "@a11ign"), { recursive: true });
  symlinkSync(installed, join(tree, "node_modules", "@a11ign", name));
}

test("#4816: an installed layer linked into ANOTHER checkout's pnpm store is not another checkout's source -- the per-PR reviewer's tree", () => {
  withScratch((base) => {
    // The reviewer's shape: this tree's own member is linked to its own packages/, and three layers link into the primary's store.
    const primary = join(base, "primary");
    const tree = checkout(base, "wt-reviewer");
    linkScope(tree, join(tree, "packages", PACKAGE));
    const layers = ["screenreader-fleet", "screenreader-worker", "toolchain"];
    for (const layer of layers) linkInstalled(tree, primary, layer);
    const asked = (): ReturnType<typeof suiteStartVerdict> => suiteStartVerdict(tree, { env: {}, list: memberScopeLister(tree) });
    const everyEntry = suiteStartVerdict(tree, { env: {} });
    assert.equal(everyEntry.action, "refuse", "CONTROL: asked about every entry (the lister before #4816), the guard refuses this tree");
    assert.match(String(everyEntry.line), /3 of 4 @a11ign\/\* resolve OUTSIDE this worktree/);
    assert.equal(asked().action, "proceed");
  });
});

test("#4816: what is still refused beside a store link -- another checkout's packages/, a member's store copy, a dangling entry", () => {
  withScratch((base) => {
    const primary = join(base, "primary");
    const asked = (tree: string): ReturnType<typeof suiteStartVerdict> => suiteStartVerdict(tree, { env: {}, list: memberScopeLister(tree) });
    const reviewerTree = (name: string) => {
      const tree = checkout(base, name);
      linkScope(tree, join(tree, "packages", PACKAGE));
      linkInstalled(tree, primary, "toolchain");
      return tree;
    };
    assert.equal(asked(reviewerTree("wt-clean")).action, "proceed", "CONTROL: the store link alone proceeds, so each refusal below is what the added entry caused");

    // A link into another checkout's SOURCE, beside a store link that is excused: the store link does not launder it.
    const sourceTree = reviewerTree("wt-source");
    const otherSource = join(primary, "packages", "worker-fleet");
    mkdirSync(otherSource, { recursive: true });
    symlinkSync(otherSource, join(sourceTree, "node_modules", "@a11ign", "screenreader-fleet"));
    assert.equal(asked(sourceTree).action, "refuse", "a link into another checkout's packages/ is the broken shape");

    // Only the `.pnpm` store is excused, not any `node_modules/`: another checkout's own installed copy is still another checkout.
    const copyTree = reviewerTree("wt-copy");
    const otherCopy = join(primary, "node_modules", "@a11ign", "screenreader-fleet");
    mkdirSync(otherCopy, { recursive: true });
    symlinkSync(otherCopy, join(copyTree, "node_modules", "@a11ign", "screenreader-fleet"));
    assert.equal(asked(copyTree).action, "refuse", "a link into another checkout's node_modules/ outside .pnpm is not excused");

    // A workspace MEMBER resolved into a store is a stale copy of something this tree holds, so it is asked about whatever the store is.
    const memberTree = reviewerTree("wt-member");
    rmSync(join(memberTree, "node_modules", "@a11ign", PACKAGE));
    linkInstalled(memberTree, primary, PACKAGE);
    assert.equal(asked(memberTree).action, "refuse", "a member's store copy is still asked about");

    // A dangling entry resolves nowhere, so it is no installed package: it stays in the list the guard is asked about and the guard
    // classifies it, as it did before. Read off the list itself, since the guard may rightly find nothing to refuse in a link to nowhere.
    const danglingTree = reviewerTree("wt-dangling");
    const scope = join(danglingTree, "node_modules", "@a11ign");
    symlinkSync(join(primary, "node_modules", ".pnpm", "gone", "node_modules", "@a11ign", "gone"), join(scope, "gone"));
    const listed = memberScopeLister(danglingTree)(scope) as string[];
    assert.ok(listed.includes("gone"), "a dangling entry is still asked about");
    assert.ok(!listed.includes("toolchain"), "CONTROL: the installed layer beside it is not");
  });
});

test("#3447: a tree with no packages/ directory is asked about in full -- silence never grants the exemption", () => {
  withScratch((base) => {
    const tree = checkout(base, "wt-no-packages");
    mkdirSync(join(tree, "node_modules", "@a11ign", "screenreader-worker"), { recursive: true });
    rmSync(join(tree, "packages"), { recursive: true, force: true });
    assert.equal(suiteStartVerdict(tree, { env: {}, list: memberScopeLister(tree) }).action, "refuse");
  });
});

test("#2218 THE CALLER: `assert-glob-not-empty --run` refuses in a mis-wired tree BEFORE any runner starts", () => {
  // A copy of the floor inside a constructed tree whose `@a11ign/screenreader-fleet` reads ANOTHER constructed checkout: the floor
  // asks about the tree it lives in, so this is the broken shape by construction. The refusal precedes the
  // spawn, so no runner is reached and nothing is measured.
  withScratch((base) => {
    const tree = checkout(base, "wt-caller");
    for (const rel of ["packages/guards/src/assert-glob-not-empty.ts", "scripts/npm-cli-executable.ts"]) {
      mkdirSync(join(tree, rel, ".."), { recursive: true });
      copyFileSync(join(REPO, rel), join(tree, rel));
    }
    mkdirSync(join(tree, "packages", "x"), { recursive: true });
    writeFileSync(join(tree, "packages", "x", "a.test.ts"), "");
    // The floor imports `@a11ign/screenreader-fleet/cli-flags`, which the real package serves from `dist/`. So the OTHER checkout is
    // constructed too, with the one entry the import needs copied from the installed package (a path, not `import.meta.resolve`, which rstest stubs): `packages/worker-fleet/src` no longer
    // exists in this repository (the package is consumed from the registry, #3447), so reading it there threw ENOENT.
    const other = join(base, "other-checkout", "packages", "worker-fleet");
    mkdirSync(join(other, "dist"), { recursive: true });
    writeFileSync(join(other, "package.json"), JSON.stringify({
      name: "@a11ign/screenreader-fleet", type: "module", exports: { "./cli-flags": "./dist/cli-flags.mjs" },
    }));
    copyFileSync(join(REPO, "node_modules/@a11ign/screenreader-fleet/dist/cli-flags.mjs"), join(other, "dist", "cli-flags.mjs"));
    // Since 0.7.0 that file re-exports the guard from `@a11ign/toolchain/lib/cli-flags` (#4425), so the other checkout must resolve the
    // toolchain too; without it the import threw ERR_MODULE_NOT_FOUND before the floor could print its refusal.
    mkdirSync(join(base, "other-checkout", "node_modules", "@a11ign"), { recursive: true });
    symlinkSync(realpathSync(join(REPO, "node_modules", "@a11ign", "toolchain")), join(base, "other-checkout", "node_modules", "@a11ign", "toolchain"));
    mkdirSync(join(tree, "node_modules", "@a11ign"), { recursive: true });
    symlinkSync(other, join(tree, "node_modules", "@a11ign", "screenreader-fleet"));
    // The floor's own import of the leaf (`@a11ign/toolchain/lib/worktree-resolution`) resolves from the tree it lives in, so that tree needs the toolchain too.
    symlinkSync(realpathSync(join(REPO, "node_modules", "@a11ign", "toolchain")), join(tree, "node_modules", "@a11ign", "toolchain"));
    const ran = spawnSync(process.execPath, [join(tree, "packages/guards/src/assert-glob-not-empty.ts"),
      "packages/x/a.test.ts", "--run", "--runner=rstest"], { cwd: tree, encoding: "utf8", env: { ...process.env, [OVERRIDE_ENV]: "" } });
    assert.equal(ran.status, 1, ran.stdout + ran.stderr);
    assert.match(ran.stderr, /REFUSING: this tree does not measure itself/);
    assert.match(ran.stderr, /resolve OUTSIDE this worktree/);
    assert.ok(ran.stderr.includes(join(base, "other-checkout")), "the refusal names the checkout being read");
  });
});
