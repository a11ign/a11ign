/**
 * #3504: `scripts/lay-layer.ts` puts a layer's `src/` where `control` imports it from, at the tag the lockfile pins.
 *
 * Three things have to hold or it answers a question it should refuse:
 *   1. THE PIN IS THE LOCKFILE'S. The version the root imports from the registry is the tag laid; a `link:` (the package still in the workspace)
 *      or no entry at all is REFUSED, never answered with `main`.
 *   2. WHAT IS LAID is `src/` without the layer's own tests and without anything that names it a package (a manifest or a tsconfig would make every
 *      walker over `packages/` treat the laid directory as one).
 *   3. IT IS IDEMPOTENT AND IT REPLACES: a directory laid at the same tag is left alone (no network on a second run), one laid at another tag is replaced.
 *   4. IT REPLACES A GIT CLONE ONLY WHEN IT IS DISPOSABLE (#3836): a dirty tree or an unpushed commit is REFUSED, naming the path and which, and the work is still there.
 *
 * THE POSITIVE CONTROLS are the fixtures: a lockfile with a link, one with no entry, a manifest with no remote, and a second tag.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { sandboxGitEnv } from "@a11ign/toolchain/lib/git-sandbox";
import { withGitSandbox } from "@a11ign/toolchain/lib/git-sandbox";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const { pinnedVersion, layingPlan, lay, REF_FILE } = await import(pathToFileURL(join(REPO_ROOT, "scripts/lay-layer.ts")).href);
const NAME = "@a11ign/screenreader-fleet";

/** A root importer block as pnpm writes it, with `version` as the lockfile would hold it. */
const lockfileWith = (version: string) => `importers:\n\n  .:\n    dependencies:\n      '${NAME}':\n        specifier: ^0.3.0\n        version: ${version}\n      '@anthropic-ai/sdk':\n        specifier: ^0.131.0\n        version: 0.131.0\n`;
const MANIFEST = { layers: { "screenreader-fleet": { path: "packages/worker-fleet", remote: "https://example.invalid/screenreader-fleet.git" }, bare: { path: "packages/bare" } } };
/** A layer that is not on the registry: it declares its own tag and what to lay (#3505). */
const UNPUBLISHED = { path: "packages/lab", remote: "https://example.invalid/lab.git", tag: "v0.1.2", lays: ["src", "scripts", "rule-ownership.json"] };

test("the real lockfile pins a registry release, and the plan names its tag", () => {
  const lockfile = readFileSync(join(REPO_ROOT, "pnpm-lock.yaml"), "utf8");
  const pinned = pinnedVersion(lockfile, NAME);
  assert.ok("version" in pinned, JSON.stringify(pinned));
  const plan = layingPlan(JSON.parse(readFileSync(join(REPO_ROOT, "layers.json"), "utf8")), lockfile, "screenreader-fleet");
  assert.deepEqual(plan, { remote: "https://github.com/a11ign/screenreader-fleet.git", tag: `v${pinned.version}`, path: "packages/worker-fleet", source: ".", lays: ["src"] });
});

test("POSITIVE CONTROL: the version is read past the peers pnpm appends, and a link, a missing entry and an undeclared layer are REFUSED", () => {
  assert.deepEqual(pinnedVersion(lockfileWith("0.3.0(@a11ign/scorer@packages+scorer)(@anthropic-ai/sdk@0.131.0)"), NAME), { version: "0.3.0" });
  assert.match(pinnedVersion(lockfileWith("link:packages/worker-fleet"), NAME).refusal, /not a registry release/);
  assert.match(pinnedVersion(lockfileWith("0.3.0"), "@a11ign/other").refusal, /no importer entry for @a11ign\/other/);
  const ok = lockfileWith("0.3.0");
  assert.match(layingPlan(MANIFEST, ok, "nope").refusal, /not declared with a remote/);
  assert.match(layingPlan(MANIFEST, ok, "bare").refusal, /not declared with a remote/);
  assert.match(layingPlan(MANIFEST, lockfileWith("link:../worker-fleet"), "screenreader-fleet").refusal, /not a registry release/);
  assert.equal(layingPlan(MANIFEST, ok, "screenreader-fleet").tag, `${NAME}@0.3.0`);
});

test("#3939: a layer's DECLARED package names the tag, not its key; no declaration still means @a11ign/<key>; a declared package the lockfile lacks is REFUSED naming it", () => {
  const worker = { path: "packages/nvda-worker", package: "screenreader-worker", remote: "https://example.invalid/screenreader-worker.git" };
  const lockfile = `importers:\n\n  .:\n    dependencies:\n      '@a11ign/screenreader-worker':\n        specifier: 0.2.0\n        version: 0.2.0\n`;
  const manifest = { layers: { "nvda-worker": worker } };
  assert.equal(layingPlan(manifest, lockfile, "nvda-worker").tag, "@a11ign/screenreader-worker@0.2.0");
  // The key alone is NOT the package: the same layer without the declaration looks for @a11ign/nvda-worker and refuses (the defect this row closes).
  assert.match(layingPlan({ layers: { "nvda-worker": { ...worker, package: undefined } } }, lockfile, "nvda-worker").refusal, /no importer entry for @a11ign\/nvda-worker/);
  // A declared package the lockfile does not hold is a refusal that names the PACKAGE, not the key.
  assert.match(layingPlan({ layers: { "nvda-worker": { ...worker, package: "ghost" } } }, lockfile, "nvda-worker").refusal, /no importer entry for @a11ign\/ghost/);
  // A layer with no `package` is unchanged.
  assert.equal(layingPlan(MANIFEST, lockfileWith("0.3.0"), "screenreader-fleet").tag, `${NAME}@0.3.0`);
  // The real declaration and the real lockfile agree.
  const real = JSON.parse(readFileSync(join(REPO_ROOT, "layers.json"), "utf8"));
  const plan = layingPlan(real, readFileSync(join(REPO_ROOT, "pnpm-lock.yaml"), "utf8"), "nvda-worker");
  // From 0.3.0 the worker repository tags `v<semver>` (#4119), so the real pin is a bare tag; the old form is pinned in the test below.
  assert.match(plan.tag, /^v\d+\.\d+\.\d+$/);
});

test("#4119: the worker lays `<package>@<version>` below 0.3.0 and `v<version>` from it; the fleet does the same from 0.5.3 (the flat release, #4224)", () => {
  const worker = { path: "packages/nvda-worker", package: "screenreader-worker", remote: "https://example.invalid/screenreader-worker.git" };
  const manifest = { layers: { "nvda-worker": worker, "screenreader-fleet": MANIFEST.layers["screenreader-fleet"] } };
  const lockfile = (name: string, version: string) => `importers:\n\n  .:\n    dependencies:\n      '${name}':\n        specifier: ${version}\n        version: ${version}\n`;
  const workerTag = (version: string) => layingPlan(manifest, lockfile("@a11ign/screenreader-worker", version), "nvda-worker").tag;
  assert.equal(workerTag("0.2.0"), "@a11ign/screenreader-worker@0.2.0");
  assert.equal(workerTag("0.3.0"), "v0.3.0");
  assert.equal(workerTag("0.4.0"), "v0.4.0");
  assert.equal(workerTag("1.0.0"), "v1.0.0");
  assert.equal(workerTag("0.10.0"), "v0.10.0");
  const fleetTag = (version: string) => layingPlan(manifest, lockfile(NAME, version), "screenreader-fleet").tag;
  assert.equal(fleetTag("0.5.2"), `${NAME}@0.5.2`);
  assert.equal(fleetTag("0.5.3"), "v0.5.3");
});

test("#4119: `source` is where the layer is in ITS repository and `path` stays where it is laid; without it the two are one; the real worker declares the root", () => {
  const worker = { path: "packages/nvda-worker", package: "screenreader-worker", remote: "https://example.invalid/screenreader-worker.git" };
  const lockfile = `importers:\n\n  .:\n    dependencies:\n      '@a11ign/screenreader-worker':\n        specifier: 0.4.0\n        version: 0.4.0\n`;
  assert.equal(layingPlan({ layers: { "nvda-worker": { ...worker, source: "." } } }, lockfile, "nvda-worker").source, ".");
  assert.ok(!("source" in layingPlan({ layers: { "nvda-worker": worker } }, lockfile, "nvda-worker")), "no declaration, no key: the plan is the one every layer had");
  const real = JSON.parse(readFileSync(join(REPO_ROOT, "layers.json"), "utf8"));
  const plan = layingPlan(real, readFileSync(join(REPO_ROOT, "pnpm-lock.yaml"), "utf8"), "nvda-worker");
  assert.equal(plan.path, "packages/nvda-worker");
  assert.equal(plan.source, ".", "v0.3.0 and later hold the package at the repository root");
});

test("#4119: lay reads the layer from `source` in the repository and lays it at `path` here", () => {
  withGitSandbox((sandbox) => {
    mkdirSync(join(sandbox.dir, "src"), { recursive: true });
    writeFileSync(join(sandbox.dir, "src/index.mjs"), "export const ROOT = true;\n");
    writeFileSync(join(sandbox.dir, "package.json"), "{}\n");
    sandbox.run(["add", "-A"]);
    sandbox.commit("root layout");
    sandbox.run(["tag", "v0.4.0"]);
    const root = mkdtempSync(join(tmpdir(), "lay-layer-root-"));
    try {
      const plan = { remote: pathToFileURL(sandbox.dir).href, tag: "v0.4.0", path: "packages/nvda-worker", lays: ["src"] };
      // CONTROL: without `source` the plan looks for packages/nvda-worker/src in the repository, which is not there.
      assert.throws(() => lay(root, plan), /holds no packages\/nvda-worker\/src/);
      assert.equal(lay(root, { ...plan, source: "." }), "laid v0.4.0 at packages/nvda-worker");
      assert.deepEqual(walk(join(root, "packages/nvda-worker")), [REF_FILE, "src/index.mjs"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

/** A repository that holds the layer the way its own repository does: the package at `packages/worker-fleet`, plus tests and a manifest. */
function layerRepository(sandbox: { dir: string; run(args: string[]): string; commit(message: string): string }, version: string): void {
  const write = (path: string, text: string) => {
    mkdirSync(dirname(join(sandbox.dir, path)), { recursive: true });
    writeFileSync(join(sandbox.dir, path), text);
  };
  write("packages/worker-fleet/package.json", `{ "name": "${NAME}", "version": "${version}" }`);
  write("packages/worker-fleet/src/cli-flags.ts", `export const VERSION = "${version}";\n`);
  write("packages/worker-fleet/src/provisioning/stamp.ps1", `# ${version}\n`);
  write("packages/worker-fleet/src/cli-flags.test.ts", "// the layer's own test\n");
  sandbox.run(["add", "-A"]);
  sandbox.commit(`release ${version}`);
  sandbox.run(["tag", `${NAME}@${version}`]);
}

const walk = (root: string, dir = ""): string[] => readdirSync(join(root, dir), { withFileTypes: true })
  .flatMap((entry) => (entry.isDirectory() ? walk(root, join(dir, entry.name)) : [join(dir, entry.name)])).sort();

test("a CRLF lockfile, as a Windows runner checks it out, pins the same version as an LF one (#3787)", () => {
  const lf = lockfileWith("0.3.0(@a11ign/scorer@packages+scorer)");
  const crlf = lf.replace(/\n/g, "\r\n");
  assert.notEqual(crlf, lf, "the control must differ from the LF text, or this proves nothing");
  assert.deepEqual(pinnedVersion(crlf, NAME), { version: "0.3.0" });
  assert.match(pinnedVersion(lockfileWith("link:packages/worker-fleet").replace(/\n/g, "\r\n"), NAME).refusal, /not a registry release/);
  assert.equal(layingPlan(MANIFEST, crlf, "screenreader-fleet").tag, `${NAME}@0.3.0`);
  const real = readFileSync(join(REPO_ROOT, "pnpm-lock.yaml"), "utf8");
  assert.deepEqual(pinnedVersion(real.replace(/\r?\n/g, "\r\n"), NAME), pinnedVersion(real.replace(/\r?\n/g, "\n"), NAME));
});

test("lay: src/ only, without the layer's tests or its manifest, at the pinned tag; again is a no-op; another tag replaces it", () => {
  withGitSandbox((sandbox) => {
    layerRepository(sandbox, "0.3.0");
    layerRepository(sandbox, "0.4.0");
    const root = mkdtempSync(join(tmpdir(), "lay-layer-root-"));
    try {
      const plan = (version: string) => ({ remote: pathToFileURL(sandbox.dir).href, tag: `${NAME}@${version}`, path: "packages/worker-fleet", lays: ["src"] });
      assert.equal(lay(root, plan("0.3.0")), `laid ${NAME}@0.3.0 at packages/worker-fleet`);
      assert.deepEqual(walk(join(root, "packages/worker-fleet")), [REF_FILE, "src/cli-flags.ts", "src/provisioning/stamp.ps1"],
        "the laid directory holds src/ alone: no manifest (a walker would take it for a package) and no test (test:all would run it)");
      assert.match(readFileSync(join(root, "packages/worker-fleet/src/cli-flags.ts"), "utf8"), /0\.3\.0/);
      // IDEMPOTENT: an unreachable remote is not asked for a directory already at the tag.
      assert.equal(lay(root, { ...plan("0.3.0"), remote: "https://example.invalid/gone.git" }), `already at ${NAME}@0.3.0`);
      // A REF FILE WITH NO CODE BESIDE IT IS NOT LAID: the rebase over the delete left exactly this, and "already at" over it served an empty directory.
      rmSync(join(root, "packages/worker-fleet/src"), { recursive: true });
      assert.equal(lay(root, plan("0.3.0")), `laid ${NAME}@0.3.0 at packages/worker-fleet`);
      assert.ok(existsSync(join(root, "packages/worker-fleet/src/cli-flags.ts")));
      // REPLACES: another tag lays the other release over it and leaves nothing of the first.
      writeFileSync(join(root, "packages/worker-fleet/src/stale.ts"), "stale\n");
      assert.equal(lay(root, plan("0.4.0")), `laid ${NAME}@0.4.0 at packages/worker-fleet`);
      assert.ok(!existsSync(join(root, "packages/worker-fleet/src/stale.ts")));
      assert.match(readFileSync(join(root, "packages/worker-fleet/src/cli-flags.ts"), "utf8"), /0\.4\.0/);
      // A TAG THAT DOES NOT EXIST is a refusal, and it does not leave a half-laid directory to be mistaken for a laid one.
      assert.throws(() => lay(root, plan("9.9.9")));
      assert.match(readFileSync(join(root, "packages/worker-fleet", REF_FILE), "utf8"), /0\.4\.0/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

test("#3505: a layer that is not on the registry lays the tag IT declares, whatever the lockfile says, and a tag that is not a v<semver> is REFUSED", () => {
  const manifest = { layers: {}, pinned: { lab: UNPUBLISHED } };
  // The lockfile holds no `@a11ign/lab` entry at all, and the plan does not need one: the declaration is the pin.
  assert.deepEqual(layingPlan(manifest, lockfileWith("0.3.0"), "lab"), { remote: UNPUBLISHED.remote, tag: "v0.1.2", path: "packages/lab", lays: UNPUBLISHED.lays });
  // POSITIVE CONTROL for the refusal: a branch, a sha, a moving range and a missing `v` each stand where a pin should.
  for (const tag of ["main", "e61c6faf9209d7b9c55d6b90a4363807b5dd9b08", "v0.1", "0.1.2", "v0.1.2-rc.1"]) {
    assert.match(layingPlan({ layers: {}, pinned: { lab: { ...UNPUBLISHED, tag } } }, lockfileWith("0.3.0"), "lab").refusal, /not a v<semver> tag/, tag);
  }
  // Declared under `layers` it is laid the same way, which is what a layer that gains a registry release and keeps a tag would be.
  assert.equal(layingPlan({ layers: { lab: UNPUBLISHED } }, lockfileWith("0.3.0"), "lab").tag, "v0.1.2");
  // A layer in neither section is refused, naming the manifest.
  assert.match(layingPlan(manifest, lockfileWith("0.3.0"), "ghost").refusal, /not declared with a remote/);
  // And the registry path is untouched: no `tag` means the lockfile's, laid as `src/` alone.
  assert.deepEqual(layingPlan(MANIFEST, lockfileWith("0.3.0"), "screenreader-fleet").lays, ["src"]);
});

test("#3505: lay puts down every part the declaration names, without tests, and REFUSES a part the tag does not hold before it touches the old copy", () => {
  withGitSandbox((sandbox) => {
    const write = (path: string, text: string) => {
      mkdirSync(dirname(join(sandbox.dir, path)), { recursive: true });
      writeFileSync(join(sandbox.dir, path), text);
    };
    write("packages/lab/package.json", "{}");
    write("packages/lab/src/a.mjs", "export const a = 1;\n");
    write("packages/lab/src/a.test.ts", "// a test\n");
    write("packages/lab/scripts/run.ts", "export const run = 1;\n");
    write("packages/lab/rule-ownership.json", "{}\n");
    sandbox.run(["add", "-A"]);
    sandbox.commit("release 0.1.2");
    sandbox.run(["tag", "v0.1.2"]);
    const root = mkdtempSync(join(tmpdir(), "lay-layer-root-"));
    try {
      const plan = { remote: pathToFileURL(sandbox.dir).href, tag: "v0.1.2", path: "packages/lab", lays: ["src", "scripts", "rule-ownership.json"] };
      assert.equal(lay(root, plan), "laid v0.1.2 at packages/lab");
      assert.deepEqual(walk(join(root, "packages/lab")), [REF_FILE, "rule-ownership.json", "scripts/run.ts", "src/a.mjs"],
        "src, scripts and the file named, no test and no manifest");
      // A part the tag lacks: refused (a declaration that gained a part is not "already at" the tag), and the copy already there is still there.
      assert.throws(() => lay(root, { ...plan, lays: ["src", "baselines"] }), /holds no packages\/lab\/baselines/);
      assert.ok(existsSync(join(root, "packages/lab/scripts/run.ts")), "the refusal came before the old copy was removed");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

test("#3506: a layer that DECLARES a copy gets this repository's file written over the tag's, a re-lay keeps what `keeps` names, and a changed declaration at the same tag is not 'already at'", () => {
  withGitSandbox((sandbox) => {
    const write = (root: string, path: string, text: string) => {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), text);
    };
    write(sandbox.dir, "packages/control/src/a.mjs", "export const a = 1;\n");
    write(sandbox.dir, "packages/control/ansible/play.yml", "- hosts: all\n");
    write(sandbox.dir, "packages/control/layers.json", '{"fromTheTag":true}\n');
    sandbox.run(["add", "-A"]);
    sandbox.commit("release 0.1.2");
    sandbox.run(["tag", "v0.1.2"]);
    const root = mkdtempSync(join(tmpdir(), "lay-layer-root-"));
    try {
      write(root, "layers.json", '{"fromTheRoot":1}\n');
      const plan = { remote: pathToFileURL(sandbox.dir).href, tag: "v0.1.2", path: "packages/control", lays: ["src", "ansible"], declares: "layers.json",
        keeps: ["ansible/inventory.yml", "ansible/*.local.yml"] };
      // An operator's untracked files sit in the directory BEFORE the first lay (a checkout that held the tracked tree): they must survive it.
      write(root, "packages/control/ansible/inventory.yml", "real addresses\n");
      write(root, "packages/control/ansible/me.local.yml", "my laptop\n");
      write(root, "packages/control/ansible/notes.txt", "not kept\n");
      write(root, "packages/control/src/stale.mjs", "gone after the lay\n");
      assert.equal(lay(root, plan), "laid v0.1.2 at packages/control");
      assert.equal(readFileSync(join(root, "packages/control/layers.json"), "utf8"), '{"fromTheRoot":1}\n', "the root's declaration, never the tag's");
      assert.deepEqual(walk(join(root, "packages/control")), [REF_FILE, "ansible/inventory.yml", "ansible/me.local.yml", "ansible/play.yml", "layers.json", "src/a.mjs"],
        "what keeps names is carried across, the rest of the old directory is not, and the tag's own layers.json is not laid");
      assert.equal(readFileSync(join(root, "packages/control/ansible/inventory.yml"), "utf8"), "real addresses\n");
      assert.equal(lay(root, plan), "already at v0.1.2");
      // POSITIVE CONTROL for the idempotence check: the declaration moved, the TAG did not, and the laid copy must follow.
      write(root, "layers.json", '{"fromTheRoot":2}\n');
      assert.equal(lay(root, plan), "laid v0.1.2 at packages/control", "an unchanged tag with a changed declaration is laid again");
      assert.equal(readFileSync(join(root, "packages/control/layers.json"), "utf8"), '{"fromTheRoot":2}\n');
      assert.ok(existsSync(join(root, "packages/control/ansible/inventory.yml")), "and the kept file survived the second lay too");
      // A layer that declares neither is wiped whole, as before: `keeps` is opt-in.
      const plain = { remote: plan.remote, tag: plan.tag, path: plan.path, lays: plan.lays };
      write(root, "packages/control/ansible/inventory.yml", "still there\n");
      rmSync(join(root, "packages/control", REF_FILE));
      assert.equal(lay(root, plain), "laid v0.1.2 at packages/control");
      assert.ok(!existsSync(join(root, "packages/control/ansible/inventory.yml")), "with no `keeps` the directory is replaced whole");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

/** What a host that ran `bootstrap-control-plane.sh` holds at the layer's path: a clone of the layer's repository, not a laid copy. */
function cloneInto(sandbox: { dir: string }, root: string, path: string): { run(args: string[]): string } {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  execFileSync("git", ["clone", "--quiet", pathToFileURL(sandbox.dir).href, target], { env: sandboxGitEnv() });
  const run = (args: string[]) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.invalid", ...args], { cwd: target, encoding: "utf8", env: sandboxGitEnv() });
  return { run };
}

test("#3836: a git clone is replaced when it is disposable, and REFUSED naming the path and why when it holds work", () => {
  withGitSandbox((sandbox) => {
    layerRepository(sandbox, "0.3.0");
    const root = mkdtempSync(join(tmpdir(), "lay-layer-root-"));
    try {
      const plan = { remote: pathToFileURL(sandbox.dir).href, tag: `${NAME}@0.3.0`, path: "packages/worker-fleet", lays: ["src"] };
      const target = join(root, plan.path);
      // The clone of the layer's repository holds the package at packages/worker-fleet inside itself, so its tracked file is one level down.
      const clone = cloneInto(sandbox, root, plan.path);
      const refused = (pattern: RegExp) => {
        assert.throws(() => lay(root, plan), (error: Error) => error.message.includes(target) && pattern.test(error.message), String(pattern));
        assert.ok(existsSync(join(target, ".git")), "the refusal came before the clone was removed");
      };
      // DIRTY: an edit to a tracked file, then an untracked one.
      writeFileSync(join(target, "packages/worker-fleet/src/cli-flags.ts"), "// mine\n");
      refused(/uncommitted/);
      clone.run(["checkout", "--", "."]);
      writeFileSync(join(target, "notes.txt"), "mine\n");
      refused(/uncommitted/);
      rmSync(join(target, "notes.txt"));
      // UNPUSHED: a commit on the checked-out branch that no remote ref holds, with the tree clean.
      writeFileSync(join(target, "notes.txt"), "mine\n");
      clone.run(["add", "notes.txt"]);
      clone.run(["commit", "--quiet", "-m", "local only"]);
      assert.equal(clone.run(["status", "--porcelain"]), "");
      refused(/unpushed/);
      // ... and on another local branch, which a replaced directory would lose as well.
      clone.run(["reset", "--quiet", "--hard", "origin/HEAD"]);
      clone.run(["branch", "wip", "HEAD"]);
      clone.run(["checkout", "--quiet", "wip"]);
      writeFileSync(join(target, "wip.txt"), "mine\n");
      clone.run(["add", "wip.txt"]);
      clone.run(["commit", "--quiet", "-m", "wip"]);
      clone.run(["checkout", "--quiet", "-"]);
      refused(/unpushed/);
      // DISPOSABLE: nothing local that a remote ref does not hold. The laid copy replaces the clone, `.git` and all.
      clone.run(["branch", "-D", "wip"]);
      assert.equal(lay(root, plan), `laid ${plan.tag} at ${plan.path}`);
      assert.ok(!existsSync(join(target, ".git")), "the clone is gone");
      assert.deepEqual(walk(target), [REF_FILE, "src/cli-flags.ts", "src/provisioning/stamp.ps1"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

/**
 * #3973: what a lab host holds at the pinned release: the layer's repository cloned, then detached AT a release tag whose commit is on NO branch of origin
 * (a release is tagged, not merged), with `tsc --build`'s output beside the source. The tag is fetched from origin the way the host's clone got it.
 */
function cloneAtReleaseTag(sandbox: { dir: string; run(args: string[]): string; commit(message: string): string }, root: string, path: string) {
  layerRepository(sandbox, "0.3.0");
  const branch = sandbox.run(["rev-parse", "--abbrev-ref", "HEAD"]).trim();
  sandbox.run(["checkout", "--quiet", "--detach"]);
  writeFileSync(join(sandbox.dir, "packages/worker-fleet/src/cli-flags.ts"), `export const VERSION = "0.4.0";\n`);
  sandbox.run(["add", "-A"]);
  sandbox.commit("release 0.4.0");
  sandbox.run(["tag", `${NAME}@0.4.0`]);
  sandbox.run(["checkout", "--quiet", branch]);
  assert.equal(sandbox.run(["branch", "--contains", `${NAME}@0.4.0`]).trim(), "", "the release commit is on no branch of origin");
  const clone = cloneInto(sandbox, root, path);
  clone.run(["fetch", "--quiet", "origin", "tag", `${NAME}@0.4.0`]);
  clone.run(["checkout", "--quiet", "--detach", `${NAME}@0.4.0`]);
  return clone;
}

test("#3973: a clone detached at a release tag that origin holds, with only build output untracked, is replaced; work beside it is still REFUSED", () => {
  withGitSandbox((sandbox) => {
    const root = mkdtempSync(join(tmpdir(), "lay-layer-root-"));
    try {
      const plan = { remote: pathToFileURL(sandbox.dir).href, tag: `${NAME}@0.4.0`, path: "packages/worker-fleet", lays: ["src"] };
      const target = join(root, plan.path);
      const clone = cloneAtReleaseTag(sandbox, root, plan.path);
      const refused = (pattern: RegExp) => {
        assert.throws(() => lay(root, plan), (error: Error) => error.message.includes(target) && pattern.test(error.message), String(pattern));
        assert.ok(existsSync(join(target, ".git")), "the refusal came before the clone was removed");
      };
      // CONTROLS, so a check that ignores everything is refused. An untracked file that is not build output is work, beside the build file too.
      writeFileSync(join(target, "tsconfig.tsbuildinfo"), "{}\n");
      writeFileSync(join(target, "notes.txt"), "mine\n");
      refused(/uncommitted/);
      rmSync(join(target, "notes.txt"));
      // A modified TRACKED file is work whatever it is named, and so is a staged one.
      writeFileSync(join(target, "packages/worker-fleet/src/cli-flags.ts"), "// mine\n");
      refused(/uncommitted/);
      clone.run(["checkout", "--", "."]);
      // A commit on no remote ref and under no tag origin holds.
      writeFileSync(join(target, "work.txt"), "mine\n");
      clone.run(["add", "work.txt"]);
      clone.run(["commit", "--quiet", "-m", "local only"]);
      refused(/unpushed/);
      // A tag made only in the clone, over a commit origin lacks, is not evidence; nor is a local tag moved onto a name origin holds.
      clone.run(["tag", `${NAME}@9.9.9`]);
      refused(/unpushed/);
      clone.run(["tag", "--force", `${NAME}@0.4.0`]);
      refused(/unpushed/);
      // ... and a build file nested in a directory is the same build output, while the same directory holding anything else is not.
      clone.run(["reset", "--quiet", "--hard", `${NAME}@0.3.0`]);
      clone.run(["fetch", "--quiet", "--force", "origin", "tag", `${NAME}@0.4.0`]);
      clone.run(["checkout", "--quiet", "--detach", `${NAME}@0.4.0`]);
      clone.run(["tag", "-d", `${NAME}@9.9.9`]);
      mkdirSync(join(target, "build"), { recursive: true });
      writeFileSync(join(target, "build/tsconfig.tsbuildinfo"), "{}\n");
      writeFileSync(join(target, "build/out.js"), "\n");
      refused(/uncommitted/);
      rmSync(join(target, "build/out.js"));
      // DISPOSABLE: at origin's tag, with build output only.
      assert.equal(lay(root, plan), `laid ${plan.tag} at ${plan.path}`);
      assert.ok(!existsSync(join(target, ".git")), "the clone is gone");
      assert.deepEqual(walk(target), [REF_FILE, "src/cli-flags.ts", "src/provisioning/stamp.ps1"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

test("#3973: when origin cannot be asked for its tags, a commit no branch holds is 'cannot tell', never disposable", () => {
  withGitSandbox((sandbox) => {
    const root = mkdtempSync(join(tmpdir(), "lay-layer-root-"));
    try {
      const plan = { remote: pathToFileURL(sandbox.dir).href, tag: `${NAME}@0.4.0`, path: "packages/worker-fleet", lays: ["src"] };
      const clone = cloneAtReleaseTag(sandbox, root, plan.path);
      clone.run(["remote", "set-url", "origin", pathToFileURL(join(root, "nowhere")).href]);
      assert.throws(() => lay(root, plan), (error: Error) => /git could not say whether it is disposable/.test(error.message));
      assert.ok(existsSync(join(root, plan.path, ".git")), "nothing was removed");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
