/**
 * #3504: `scripts/lay-layer.mjs` puts a layer's `src/` where `control` imports it from, at the tag the lockfile pins.
 *
 * Three things have to hold or it answers a question it should refuse:
 *   1. THE PIN IS THE LOCKFILE'S. The version the root imports from the registry is the tag laid; a `link:` (the package still in the workspace)
 *      or no entry at all is REFUSED, never answered with `main`.
 *   2. WHAT IS LAID is `src/` without the layer's own tests and without anything that names it a package (a manifest or a tsconfig would make every
 *      walker over `packages/` treat the laid directory as one).
 *   3. IT IS IDEMPOTENT AND IT REPLACES: a directory laid at the same tag is left alone (no network on a second run), one laid at another tag is replaced.
 *
 * THE POSITIVE CONTROLS are the fixtures: a lockfile with a link, one with no entry, a manifest with no remote, and a second tag.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { withGitSandbox } from "../../../scripts/test-support/git-sandbox.ts";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const { pinnedVersion, layingPlan, lay, REF_FILE } = await import(pathToFileURL(join(REPO_ROOT, "scripts/lay-layer.mjs")).href);
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
  const plan = layingPlan(JSON.parse(readFileSync(join(REPO_ROOT, "packages/control/layers.json"), "utf8")), lockfile, "screenreader-fleet");
  assert.deepEqual(plan, { remote: "https://github.com/a11ign/screenreader-fleet.git", tag: `${NAME}@${pinned.version}`, path: "packages/worker-fleet", lays: ["src"] });
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

/** A repository that holds the layer the way its own repository does: the package at `packages/worker-fleet`, plus tests and a manifest. */
function layerRepository(sandbox: { dir: string; run(args: string[]): string; commit(message: string): string }, version: string): void {
  const write = (path: string, text: string) => {
    mkdirSync(dirname(join(sandbox.dir, path)), { recursive: true });
    writeFileSync(join(sandbox.dir, path), text);
  };
  write("packages/worker-fleet/package.json", `{ "name": "${NAME}", "version": "${version}" }`);
  write("packages/worker-fleet/src/cli-flags.mjs", `export const VERSION = "${version}";\n`);
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
      assert.deepEqual(walk(join(root, "packages/worker-fleet")), [REF_FILE, "src/cli-flags.mjs", "src/provisioning/stamp.ps1"],
        "the laid directory holds src/ alone: no manifest (a walker would take it for a package) and no test (test:all would run it)");
      assert.match(readFileSync(join(root, "packages/worker-fleet/src/cli-flags.mjs"), "utf8"), /0\.3\.0/);
      // IDEMPOTENT: an unreachable remote is not asked for a directory already at the tag.
      assert.equal(lay(root, { ...plan("0.3.0"), remote: "https://example.invalid/gone.git" }), `already at ${NAME}@0.3.0`);
      // A REF FILE WITH NO CODE BESIDE IT IS NOT LAID: the rebase over the delete left exactly this, and "already at" over it served an empty directory.
      rmSync(join(root, "packages/worker-fleet/src"), { recursive: true });
      assert.equal(lay(root, plan("0.3.0")), `laid ${NAME}@0.3.0 at packages/worker-fleet`);
      assert.ok(existsSync(join(root, "packages/worker-fleet/src/cli-flags.mjs")));
      // REPLACES: another tag lays the other release over it and leaves nothing of the first.
      writeFileSync(join(root, "packages/worker-fleet/src/stale.mjs"), "stale\n");
      assert.equal(lay(root, plan("0.4.0")), `laid ${NAME}@0.4.0 at packages/worker-fleet`);
      assert.ok(!existsSync(join(root, "packages/worker-fleet/src/stale.mjs")));
      assert.match(readFileSync(join(root, "packages/worker-fleet/src/cli-flags.mjs"), "utf8"), /0\.4\.0/);
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
    write("packages/lab/scripts/run.mjs", "export const run = 1;\n");
    write("packages/lab/rule-ownership.json", "{}\n");
    sandbox.run(["add", "-A"]);
    sandbox.commit("release 0.1.2");
    sandbox.run(["tag", "v0.1.2"]);
    const root = mkdtempSync(join(tmpdir(), "lay-layer-root-"));
    try {
      const plan = { remote: pathToFileURL(sandbox.dir).href, tag: "v0.1.2", path: "packages/lab", lays: ["src", "scripts", "rule-ownership.json"] };
      assert.equal(lay(root, plan), "laid v0.1.2 at packages/lab");
      assert.deepEqual(walk(join(root, "packages/lab")), [REF_FILE, "rule-ownership.json", "scripts/run.mjs", "src/a.mjs"],
        "src, scripts and the file named, no test and no manifest");
      // A part the tag lacks: refused (a declaration that gained a part is not "already at" the tag), and the copy already there is still there.
      assert.throws(() => lay(root, { ...plan, lays: ["src", "baselines"] }), /holds no packages\/lab\/baselines/);
      assert.ok(existsSync(join(root, "packages/lab/scripts/run.mjs")), "the refusal came before the old copy was removed");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
