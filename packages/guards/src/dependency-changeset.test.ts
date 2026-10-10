/**
 * `scripts/dependency-changeset.ts` derives what a dependency pull request owes the changelog FROM ITS MANIFESTS' DIFF (#3159). Four
 * things have to hold or a consumer-visible change ships with no entry, or a human-visible one is waved through:
 *   1. A BUMP OF A RUNTIME RANGE OF A PUBLISHED PACKAGE IS A `patch` ENTRY naming the dependency and both ranges; `devDependencies`
 *      and private packages are EMPTY, recorded as such rather than inferred from silence.
 *   2. EVERYTHING ELSE IS REFUSED, by name: a major, a 0.x minor, a 0.0.x bump, a downgrade, an added or removed dependency, a range
 *      a machine cannot compare, a non-manifest path, an owned path, a manifest edited beyond its ranges.
 *   3. THE DIFF IS THE AUTHORITY over what the pull request carries: `checkEntries` refuses an empty entry over a runtime range, an
 *      entry for a private or untouched package, an entry whose text differs from the derived one, and a missing one.
 *   4. `compile` WRITES NOTHING ON A DRY RUN and names only THIRD-PARTY ranges that moved since the package's last release tag.
 *
 * THE POSITIVE CONTROLS are the paired inputs: every refusal sits beside a one-character-different bump that is accepted, and each
 * empty result sits beside a derivation of the same shape that yields entries.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Derivation } from "../../../scripts/dependency-changeset.ts";
import { withGitSandbox } from "@a11ign/toolchain/lib/git-sandbox";

const changeset = await import("../../../scripts/dependency-changeset.ts");
const { RUNTIME_SECTIONS, refusalFor, entriesFor, deriveDependencyChangeset, renderEntry, parseEntry, checkEntries, compile } = changeset;

type Change = {
  path: string; package: string; private: boolean; section: string; dependency: string; from: string | null; to: string | null;
};

const change = (overrides: Partial<Change> = {}): Change => ({
  path: "packages/lab/package.json", package: "@a11ign/lab", private: false, section: "dependencies", dependency: "yaml",
  from: "2.9.0", to: "2.9.1", ...overrides,
});
const bump = (from: string | null, to: string | null) => change({ from, to });
/** `refusalFor`'s reason where the test expects one: a null here fails the `match` that follows. */
const refusalText = (input: Change) => refusalFor(input) as string;

test("RUNTIME_SECTIONS is exactly what a consumer's install is built from, and excludes devDependencies", () => {
  assert.deepEqual(RUNTIME_SECTIONS, ["dependencies", "peerDependencies", "optionalDependencies"]);
});

test("refusalFor accepts a patch or a minor bump under a stable major, with or without ^ and ~", () => {
  assert.equal(refusalFor(bump("2.9.0", "2.9.1")), null);
  assert.equal(refusalFor(bump("^2.9.0", "^2.10.0")), null);
  assert.equal(refusalFor(bump("~1.2.3", "~1.2.9")), null);
  assert.equal(refusalFor(bump("^0.3.1", "^0.3.2")), null); // 0.x PATCH is not breaking
  assert.equal(refusalFor(bump("^2.9.1", "^2.9.1")), null); // same range: nothing to refuse
});

test("refusalFor names an added or a removed dependency", () => {
  assert.equal(refusalFor(bump(null, "^1.0.0")), "yaml in packages/lab/package.json was added, which is not a version bump");
  assert.equal(refusalFor(bump("^1.0.0", null)), "yaml in packages/lab/package.json was removed, which is not a version bump");
});

test("refusalFor refuses a range a machine cannot compare", () => {
  for (const unplain of ["^1.0", "latest", ">=1.0.0 <2", "workspace:*", "1.0.0-rc.1"]) {
    assert.equal(
      refusalFor(bump("1.0.0", unplain)),
      `yaml in packages/lab/package.json: 1.0.0 -> ${unplain} is not a plain version a machine can compare`,
      unplain,
    );
  }
  assert.match(refusalText(bump("npm:foo@1", "1.0.0")), /npm:foo@1 -> 1\.0\.0 is not a plain version/);
});

test("refusalFor refuses a major bump, up or down, but not a minor", () => {
  assert.match(refusalText(bump("^1.9.0", "^2.0.0")), /\^1\.9\.0 -> \^2\.0\.0 is a MAJOR bump/);
  assert.match(refusalText(bump("^2.0.0", "^1.0.0")), /is a MAJOR bump/);
  assert.equal(refusalFor(bump("^1.9.0", "^1.10.0")), null);
});

test("refusalFor refuses a 0.x minor bump (breaking before 1.0) and a 0.0.x bump", () => {
  assert.match(refusalText(bump("^0.3.0", "^0.4.0")), /is a 0\.x MINOR bump, which before 1\.0 is semver's breaking release/);
  assert.match(refusalText(bump("^0.0.3", "^0.0.4")), /is a 0\.0\.x bump, breaking under a caret range/);
  assert.equal(refusalFor(bump("^0.0.3", "^0.0.3")), null);
});

test("refusalFor refuses a downgrade at any position, and accepts the same move upward", () => {
  assert.match(refusalText(bump("2.9.1", "2.9.0")), /is a downgrade/);
  assert.match(refusalText(bump("2.10.0", "2.9.5")), /is a downgrade/);
  assert.equal(refusalFor(bump("2.9.0", "2.9.1")), null);
  assert.equal(refusalFor(bump("2.9.5", "2.10.0")), null);
});

test("entriesFor writes one patch entry per published package with the diff restated, one line per dependency", () => {
  const entries = entriesFor([
    change(),
    change({ dependency: "zod", from: "^3.0.0", to: "^3.1.0" }),
    change({ package: "@a11ign/guards", section: "peerDependencies", dependency: "typescript", from: "^5.0.0", to: "^5.1.0" }),
  ]);
  assert.deepEqual(entries, [
    {
      package: "@a11ign/lab", bump: "patch",
      text: "Updates the `yaml` dependency range from `2.9.0` to `2.9.1`.\nUpdates the `zod` dependency range from `^3.0.0` to `^3.1.0`.",
    },
    { package: "@a11ign/guards", bump: "patch", text: "Updates the `typescript` peer dependency range from `^5.0.0` to `^5.1.0`." },
  ]);
});

test("entriesFor labels an optional dependency, and writes nothing for devDependencies or a private package", () => {
  assert.equal(entriesFor([change({ section: "optionalDependencies" })])[0].text, "Updates the `yaml` optional dependency range from `2.9.0` to `2.9.1`.");
  assert.deepEqual(entriesFor([change({ section: "devDependencies" })]), []);
  assert.deepEqual(entriesFor([change({ private: true })]), []);
  assert.deepEqual(entriesFor([]), []);
});

const manifest = (overrides: Record<string, unknown> = {}) => ({ name: "@a11ign/lab", version: "1.2.3", dependencies: { yaml: "^2.9.0" }, ...overrides });
const manifestFiles = ["packages/lab/package.json", "pnpm-lock.yaml"];
const moved = (before: Record<string, unknown>, after: Record<string, unknown>, path = "packages/lab/package.json") => ({ [path]: { before, after } });

test("deriveDependencyChangeset: a runtime range bump of a published package yields an entries verdict", () => {
  const derived = deriveDependencyChangeset({
    files: manifestFiles, owned: [],
    manifests: moved(manifest(), manifest({ dependencies: { yaml: "^2.9.1" } })),
  });
  assert.equal(derived.verdict, "entries");
  assert.deepEqual(derived.reasons, []);
  assert.deepEqual(derived.privatePackages, []);
  assert.deepEqual(derived.entries, [
    { package: "@a11ign/lab", bump: "patch" as const, text: "Updates the `yaml` dependency range from `^2.9.0` to `^2.9.1`." },
  ]);
});

test("deriveDependencyChangeset: a devDependencies-only diff is empty (the positive control for the entries case above)", () => {
  const before = manifest({ devDependencies: { tsx: "4.0.0" } });
  const after = manifest({ devDependencies: { tsx: "4.0.1" } });
  const derived = deriveDependencyChangeset({ files: manifestFiles, owned: [], manifests: moved(before, after) });
  assert.deepEqual(derived, { verdict: "empty", entries: [], privatePackages: [], reasons: [] });
});

test("deriveDependencyChangeset: a private package's bump is empty and the package is recorded as private", () => {
  const derived = deriveDependencyChangeset({
    files: ["package.json", "pnpm-lock.yaml"], owned: [],
    manifests: moved(manifest({ private: true }), manifest({ private: true, dependencies: { yaml: "^2.9.1" } }), "package.json"),
  });
  assert.equal(derived.verdict, "empty");
  assert.deepEqual(derived.privatePackages, ["@a11ign/lab"]);
});

test("deriveDependencyChangeset: an empty diff is empty, not refused", () => {
  assert.deepEqual(deriveDependencyChangeset({ files: [], manifests: {}, owned: [] }), { verdict: "empty", entries: [], privatePackages: [], reasons: [] });
});

test("deriveDependencyChangeset refuses a major bump, and returns no entries alongside the refusal", () => {
  const derived = deriveDependencyChangeset({
    files: manifestFiles, owned: [], manifests: moved(manifest(), manifest({ dependencies: { yaml: "^3.0.0" } })),
  });
  assert.equal(derived.verdict, "refused");
  assert.deepEqual(derived.entries, []);
  assert.match(derived.reasons[0], /is a MAJOR bump/);
});

test("deriveDependencyChangeset refuses a file that is not a manifest or the lockfile, and lets an entry file through", () => {
  const manifests = moved(manifest(), manifest({ dependencies: { yaml: "^2.9.1" } }));
  const stray = deriveDependencyChangeset({ files: [...manifestFiles, "src/index.ts"], owned: [], manifests });
  assert.equal(stray.verdict, "refused");
  assert.deepEqual(stray.reasons, ["src/index.ts is not a manifest or the lockfile, so this is not a dependency-only diff"]);

  const withEntry = deriveDependencyChangeset({ files: [...manifestFiles, ".changeset/bump-yaml.md"], owned: [], manifests });
  assert.equal(withEntry.verdict, "entries");
});

test("deriveDependencyChangeset refuses an owned path, and also says it is not a dependency path when it is neither", () => {
  const derived = deriveDependencyChangeset({
    files: ["packages/lab/package.json", "packages/lab/package.json.d"], owned: ["packages/lab/package.json"], manifests: {},
  });
  assert.deepEqual(derived.reasons, [
    "packages/lab/package.json.d is not a manifest or the lockfile, so this is not a dependency-only diff",
    "packages/lab/package.json is an owned path: a human states the capture-cache facts for it (docs/owned-path-facts.json)",
    "packages/lab/package.json.d is an owned path: a human states the capture-cache facts for it (docs/owned-path-facts.json)",
  ]);
});

test("deriveDependencyChangeset refuses a manifest that was added, deleted, or changed beyond its ranges", () => {
  const files = ["packages/lab/package.json"];
  const added = deriveDependencyChangeset({ files, owned: [], manifests: { "packages/lab/package.json": { before: null, after: manifest() } } });
  assert.deepEqual(added.reasons, ["packages/lab/package.json was added, which is not a dependency bump"]);

  const deleted = deriveDependencyChangeset({ files, owned: [], manifests: { "packages/lab/package.json": { before: manifest(), after: null } } });
  assert.deepEqual(deleted.reasons, ["packages/lab/package.json was deleted, which is not a dependency bump"]);

  const renamed = deriveDependencyChangeset({ files, owned: [], manifests: moved(manifest(), manifest({ version: "1.2.4", dependencies: { yaml: "^2.9.1" } })) });
  assert.deepEqual(renamed.reasons, ["packages/lab/package.json changes something other than a dependency range"]);
});

test("deriveDependencyChangeset refuses an added dependency", () => {
  const derived = deriveDependencyChangeset({
    files: manifestFiles, owned: [],
    manifests: moved(manifest(), manifest({ dependencies: { yaml: "^2.9.0", zod: "^3.0.0" } })),
  });
  assert.equal(derived.verdict, "refused");
  assert.deepEqual(derived.reasons, ["zod in packages/lab/package.json was added, which is not a version bump"]);
});

test("renderEntry writes the changeset front matter and the text; parseEntry reads it back", () => {
  const entry = { package: "@a11ign/lab", bump: "patch" as const, text: "Updates the `yaml` dependency range from `2.9.0` to `2.9.1`." };
  const markdown = renderEntry(entry);
  assert.equal(markdown, '---\n"@a11ign/lab": patch\n---\n\nUpdates the `yaml` dependency range from `2.9.0` to `2.9.1`.\n');
  assert.deepEqual(parseEntry(markdown), entry);
});

test("parseEntry: an empty changeset has no package; an unquoted name parses; text that is not a changeset is empty", () => {
  assert.deepEqual(parseEntry("---\n---\n\nnothing here\n"), { package: null, bump: "", text: "nothing here" });
  assert.deepEqual(parseEntry('---\nlab: minor\n---\nbody\n'), { package: "lab", bump: "minor", text: "body" });
  assert.deepEqual(parseEntry("no front matter at all"), { package: null, bump: "", text: "" });
});

const derivedFor = (...changes: Change[]): Derivation => ({
  verdict: "entries", reasons: [], entries: entriesFor(changes),
  privatePackages: [...new Set(changes.filter((c) => c.private).map((c) => c.package))],
});
const carried = (overrides: Record<string, unknown> = {}) => ({ package: "@a11ign/lab", bump: "patch", text: entriesFor([change()])[0].text, ...overrides });

test("checkEntries accepts the entry the diff derives, and nothing when nothing is carried over an empty derivation", () => {
  assert.deepEqual(checkEntries([carried()], derivedFor(change())), []);
  assert.deepEqual(checkEntries([], { verdict: "empty", reasons: [], entries: [], privatePackages: [] }), []);
});

test("checkEntries refuses an empty changeset over a diff that moves a runtime range", () => {
  // The second line is the same fault from the other side: the empty entry names no package, so the derived one is also missing.
  assert.deepEqual(checkEntries([carried({ package: null, bump: "", text: "" })], derivedFor(change())), [
    "an empty changeset over a diff that moves a runtime range: a consumer's install changed",
    "no entry for @a11ign/lab, whose runtime ranges this diff moves",
  ]);
});

test("checkEntries accepts an empty changeset when the diff derives no entry", () => {
  assert.deepEqual(checkEntries([{ package: null, bump: "", text: "" }], { verdict: "empty", reasons: [], entries: [], privatePackages: [] }), []);
});

test("checkEntries refuses an entry for a private package and one for a package the diff does not move", () => {
  const privateDerived = derivedFor(change({ private: true, package: "@a11ign/root" }));
  assert.deepEqual(checkEntries([carried({ package: "@a11ign/root" })], privateDerived), ["an entry for @a11ign/root, a private package: it ships nothing"]);
  assert.deepEqual(checkEntries([carried({ package: "@a11ign/other" })], derivedFor(change())), [
    "an entry for @a11ign/other, whose runtime ranges this diff does not move",
    "no entry for @a11ign/lab, whose runtime ranges this diff moves",
  ]);
});

test("checkEntries refuses an entry whose bump or text is not the derived one (an entry built from the title)", () => {
  const expected = "the entry for @a11ign/lab is not the one the diff derives (entries come from the diff, never from the title)";
  assert.deepEqual(checkEntries([carried({ bump: "minor" })], derivedFor(change())), [expected]);
  assert.deepEqual(checkEntries([carried({ text: "Bump yaml" })], derivedFor(change())), [expected]);
});

test("checkEntries names a derived package the carried entries omit, only when something was carried", () => {
  const derived = derivedFor(change(), change({ package: "@a11ign/guards" }));
  assert.deepEqual(checkEntries([carried()], derived), ["no entry for @a11ign/guards, whose runtime ranges this diff moves"]);
  // Nothing carried at all is "no entry file", which the job reports through its own channel, not this check.
  assert.deepEqual(checkEntries([], derived), []);
});

// ---- compile, against a throwaway repository -----------------------------------------------------------

const writeManifest = (dir: string, name: string, body: Record<string, unknown>) => {
  mkdirSync(join(dir, "packages", name), { recursive: true });
  writeFileSync(join(dir, "packages", name, "package.json"), `${JSON.stringify(body, null, 2)}\n`);
};

/** Runs `compile` with the sandbox as the working directory (it reads `packages/` relative to it) and returns what it printed. */
function compileIn(dir: string, options: { dryRun: boolean }): string {
  const previousCwd = process.cwd();
  const previousLog = console.log;
  const printed: string[] = [];
  console.log = (...parts: unknown[]) => { printed.push(parts.join(" ")); };
  process.chdir(dir);
  try {
    compile(options);
  } finally {
    process.chdir(previousCwd);
    console.log = previousLog;
  }
  return printed.join("\n");
}

const RELEASED = { name: "@a11ign/lab", version: "1.2.3", dependencies: { yaml: "^2.9.0", "@a11ign/guards": "^1.0.0" } };
const GUARDS = { name: "@a11ign/guards", version: "1.0.0" };

/** Releases both packages at their tags, then bumps `yaml` (third party) and `@a11ign/guards` (a workspace sibling) in lab. */
function releaseThenBump(dir: string, git: { run(args: string[]): string; commit(message: string): string }) {
  writeManifest(dir, "lab", RELEASED);
  writeManifest(dir, "guards", GUARDS);
  git.run(["add", "-A"]);
  git.commit("release");
  git.run(["tag", "@a11ign/lab@1.2.3"]);
  git.run(["tag", "@a11ign/guards@1.0.0"]);
  writeManifest(dir, "lab", { ...RELEASED, dependencies: { yaml: "^2.9.1", "@a11ign/guards": "^1.1.0" } });
}

test("compile --dry-run reports the third-party range that moved since the release tag, ignores a workspace sibling, and writes nothing", () => {
  withGitSandbox((git) => {
    mkdirSync(join(git.dir, ".changeset"));
    releaseThenBump(git.dir, git);
    const printed = compileIn(git.dir, { dryRun: true });
    assert.match(printed, /^\.changeset\/dependency-ranges-a11ign-lab\.md\n---\n"@a11ign\/lab": patch\n---\n/);
    assert.match(printed, /Updates the `yaml` dependency range from `\^2\.9\.0` to `\^2\.9\.1`\./);
    assert.doesNotMatch(printed, /guards/);
    assert.equal(existsSync(join(git.dir, ".changeset/dependency-ranges-a11ign-lab.md")), false);
  });
});

test("compile writes the rendered entry file when it is not a dry run", () => {
  withGitSandbox((git) => {
    mkdirSync(join(git.dir, ".changeset"));
    releaseThenBump(git.dir, git);
    compileIn(git.dir, { dryRun: false });
    const written = readFileSync(join(git.dir, ".changeset/dependency-ranges-a11ign-lab.md"), "utf8");
    assert.equal(written, renderEntry({ package: "@a11ign/lab", bump: "patch" as const, text: "Updates the `yaml` dependency range from `^2.9.0` to `^2.9.1`." }));
  });
});

test("compile says so when no third-party range moved since the tag (the positive control is the two tests above)", () => {
  withGitSandbox((git) => {
    mkdirSync(join(git.dir, ".changeset"));
    writeManifest(git.dir, "lab", RELEASED);
    writeManifest(git.dir, "guards", GUARDS);
    git.run(["add", "-A"]);
    git.commit("release");
    git.run(["tag", "@a11ign/lab@1.2.3"]);
    assert.equal(compileIn(git.dir, { dryRun: false }), "no published package's third-party runtime ranges moved since its last release tag");
    assert.equal(existsSync(join(git.dir, ".changeset/dependency-ranges-a11ign-lab.md")), false);
  });
});

test("compile skips a package with no release tag and a private package", () => {
  withGitSandbox((git) => {
    mkdirSync(join(git.dir, ".changeset"));
    writeManifest(git.dir, "lab", { ...RELEASED, dependencies: { yaml: "^2.9.1" } }); // published, but never tagged
    writeManifest(git.dir, "hidden", { name: "@a11ign/hidden", version: "0.0.1", private: true, dependencies: { yaml: "^2.9.1" } });
    git.run(["add", "-A"]);
    git.commit("no tags");
    git.run(["tag", "@a11ign/hidden@0.0.1"]);
    assert.match(compileIn(git.dir, { dryRun: false }), /^no published package's third-party runtime ranges moved/);
  });
});
