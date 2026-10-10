// no-token: none -- builds throwaway local git repositories and runs two pairs of helpers in them; no network, no GitHub.
/**
 * #4591: THE CORE KEEPS TWO MORE OF THE TOOLCHAIN'S HELPERS AS COPIES, `isolation-gate` AND `ci-changed`, AND THIS IS THE CHECK THAT SAYS WHEN ONE DRIFTED.
 *
 * `scripts/ci-changed.ts` is run by `ci.yml`'s `changed` job (no `pnpm install`), and it imports `packedFiles` from
 * `packages/guards/src/isolation-gate.ts`; `scripts/registry-consumer-gate.ts` is run by a job that installs nothing and imports `satisfies` from
 * the same file. Both stems are reached before `node_modules` exists, so neither can become an import of `@a11ign/toolchain` (#4589 made that
 * ruling for `cli-flags`, `git-env` and `npm-cli-executable`). A copy with no check is the `cross-repo-copies` defect, so: after install, compare
 * each copy with the toolchain's `lib/<stem>` at the version the root manifest pins. The comparison reads NAMES and BEHAVIOUR, never text, so a
 * copy that differs in a comment is not drift. Siblings: `bootstrap-copies-match-toolchain.test.ts` (#4707) and
 * `bootstrap-copies-changed-match-toolchain.test.ts` (#4719).
 *
 * THE FIXTURE: `isolation-gate` reads the repository it sits in from its OWN location (`../../../` for the copy, `../../` for the toolchain's
 * file), so each side is placed at the depth that makes both resolve to the same throwaway repository, which holds packages, a `layers.json`
 * and tracked test files for the probes to read.
 *
 * NOT PROBED, and why: `checkIsolation` is probed only down to its two refusals before any pack or install, because a full run packs and installs
 * from the registry; the real consumer install is `packages/guards/nightly/isolation-gate-real-consumer.test.ts`'s. The copy's command-line entry
 * is behind an `import.meta.url` guard, so importing either side runs nothing.
 *
 * Positive control: `compare` is fed a copy with a real behavioural alteration (the caret's `0.x` narrowing dropped; the `dist/` prefix match
 * dropped) and must report it, and a copy altered only in a comment, which must report nothing, so neither an empty comparison nor an
 * always-different one passes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { sandboxGitEnv } from "@a11ign/toolchain/lib/git-sandbox";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const STEMS = ["isolation-gate", "ci-changed"] as const;
type Stem = (typeof STEMS)[number];
type Module = Record<string, unknown>;
type Outcome = { value: unknown } | { threw: string };
type Probes = Record<string, Array<(module: Module, repo: string) => unknown>>;

const COPY_PATHS: Record<Stem, string> = {
  "isolation-gate": "packages/guards/src/isolation-gate.ts",
  "ci-changed": "scripts/ci-changed.ts",
};
/** What the two copies import at runtime, which the fixture must carry at the same relative place. */
const COPY_SUPPORT = [
  "packages/guards/src/git-env.ts", "packages/guards/src/changed-files.ts", "packages/guards/src/changed-packages.ts",
  "scripts/cli-flags.ts", "scripts/npm-cli-executable.ts",
];
const TOOLCHAIN_LIB = `${ROOT}node_modules/@a11ign/toolchain/dist/lib`;
/** Two levels below the fixture root, so the toolchain file's `../../` is the root the copy reaches with `../../../`. */
const FIXTURE_LIB = "toolchain-dist/lib";

function pinnedToolchainVersion(): string {
  const manifest = JSON.parse(readFileSync(`${ROOT}package.json`, "utf8"));
  const pin = manifest.dependencies?.["@a11ign/toolchain"] ?? manifest.devDependencies?.["@a11ign/toolchain"];
  assert.match(pin, /^\d+\.\d+\.\d+$/, "the core must pin @a11ign/toolchain to an exact version for this comparison to name one");
  return pin;
}

interface Fixture { dir: string; module: (side: "copy" | "toolchain", stem: Stem) => Promise<Module> }

const PACKAGES: Record<string, Record<string, unknown>> = {
  alpha: { name: "@a11ign/alpha", version: "1.2.3", files: ["dist", "src/raw.ts"], dependencies: { "@a11ign/beta": "^1.0.0", left: "1.0.0" } },
  beta: { name: "@a11ign/beta", version: "1.0.0", private: true, files: ["index.js"] },
  gamma: {
    name: "@a11ign/gamma", version: "0.1.0", files: ["index.js"],
    dependencies: { "@a11ign/alpha": "workspace:*", "@a11ign/registry-only": "^2.0.0" },
    peerDependencies: { "@a11ign/optional-sibling": "^1.0.0" }, peerDependenciesMeta: { "@a11ign/optional-sibling": { optional: true } },
  },
  broken: { name: "@a11ign/broken", version: "0.0.1", dependencies: { "@a11ign/ghost": "workspace:*" } },
  worker: { name: "@a11ign/worker", version: "3.0.0" },
};

/**
 * A repository holding both sides at the depth each expects, plus the tracked files the `ci-changed` probes read. `alter` rewrites a copy's text.
 */
async function fixtureRepo(options: { alter?: (path: string, text: string) => string } = {}): Promise<Fixture> {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "bootstrap-copies-gate-")));
  const put = (path: string, text: string) => {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  };
  for (const path of [...Object.values(COPY_PATHS), ...COPY_SUPPORT]) {
    const text = readFileSync(`${ROOT}${path}`, "utf8");
    put(path, options.alter ? options.alter(path, text) : text);
  }
  mkdirSync(join(dir, FIXTURE_LIB), { recursive: true });
  for (const file of readdirSync(TOOLCHAIN_LIB).filter((name) => name.endsWith(".mjs"))) copyFileSync(join(TOOLCHAIN_LIB, file), join(dir, FIXTURE_LIB, file));
  for (const [name, manifest] of Object.entries(PACKAGES)) put(`packages/${name}/package.json`, `${JSON.stringify(manifest, null, 2)}\n`);
  put("packages/alpha/isolation-smoke.ts", "// smoke\n");
  put("packages/alpha/dist/index.js", "export {};\n");
  put("packages/alpha/src/raw.ts", "export {};\n");
  put("packages/alpha/src/unshipped.ts", "export {};\n");
  put("packages/layer-only/package.json", `${JSON.stringify({ name: "@a11ign/layer-only", version: "1.0.0" })}\n`);
  put("package.json", `${JSON.stringify({ name: "fixture-root", private: true, workspaces: ["packages/*"] })}\n`);
  put("layers.json", `${JSON.stringify({ layers: { worker: { path: "packages/worker", remote: "https://example.invalid/worker.git" }, local: { path: "packages/alpha" } } })}\n`);
  put("packages/alpha/src/names.test.ts", 'const SITES = [{ file: "README.md" }, { file: \'docs/guide.md\' }];\n');
  put("packages/gamma/src/reads.test.ts", 'readFileSync("docs/guide.md");\n');
  put("packages/gamma/src/plain.test.ts", "assert.equal(1, 1);\n");
  const git = (...args: string[]) => execFileSync("git", ["-c", "user.name=Bootstrap Copies Test", "-c", "user.email=bootstrap-copies@example.invalid", ...args],
    { cwd: dir, env: sandboxGitEnv(), encoding: "utf8" });
  git("init", "-q", "-b", "main");
  git("add", "-A");
  git("commit", "-q", "-m", "base");
  const paths = {
    copy: COPY_PATHS,
    toolchain: Object.fromEntries(STEMS.map((stem) => [stem, `${FIXTURE_LIB}/${stem}.mjs`])),
  } as const;
  return { dir, module: (side, stem) => import(pathToFileURL(join(dir, paths[side][stem])).href) };
}

function outcomeOf(run: () => unknown): Outcome {
  try {
    return { value: run() };
  } catch (error) {
    // A message naming the module's own path would differ by side by construction; both sides read the same fixture, so none does.
    return { threw: error instanceof Error ? error.message : String(error) };
  }
}

const call = (module: Module, name: string, ...args: unknown[]) => (module[name] as (...a: unknown[]) => unknown)(...args);
const pkg = (repo: string, name: string) => join(repo, "packages", name);

const RANGE_CASES: Array<[string, string]> = [
  ["1.2.3", "1.2.3"], ["1.2.4", "1.2.3"], ["1.2.4", "^1.2.3"], ["1.9.0", "^1.2.3"], ["2.0.0", "^1.2.3"], ["0.1.5", "^0.1.2"],
  ["0.2.0", "^0.1.2"], ["0.0.3", "^0.0.3"], ["0.0.4", "^0.0.3"], ["1.2.9", "~1.2.0"], ["1.3.0", "~1.2.0"], ["2.0.0", ">=1.0.0"],
  ["0.9.0", ">=1.0.0"], ["1.0.0", "workspace:*"], ["1.0.0", "*"], ["1.0.0", "latest"], ["1.0.0-beta.1", "^1.0.0"],
];

const MANIFEST_SETS = [
  [],
  [{ name: "@a11ign/a", version: "1.0.0", dependencies: { "@a11ign/b": "workspace:*" } }, { name: "@a11ign/b", version: "1.0.0" }],
  [{ name: "@a11ign/a", version: "1.0.0", dependencies: { "@a11ign/b": "^2.0.0", "@a11ign/c": "latest", react: "workspace:*" } },
    { name: "@a11ign/b", version: "1.0.0" }, { name: "@a11ign/c", version: "1.0.0" }],
  [{ name: "@a11ign/a", version: "1.0.0", peerDependencies: { "@a11ign/b": "~1.0.0" }, optionalDependencies: { "@a11ign/c": "1.0.0" } },
    { name: "@a11ign/b", version: "1.0.5" }, { name: "@a11ign/c", version: "1.0.0" }],
];

const BIN_MANIFESTS = [
  { name: "@a11ign/scoped", bin: "./cli.mjs" }, { name: "plain", bin: "./cli.mjs" }, { name: "@a11ign/two", bin: { one: "./1.mjs", two: "./2.mjs" } },
  { name: "@a11ign/none" }, { bin: "./cli.mjs" }, {},
];

const FILE_LISTS = [
  [], ["README.md"], ["packages/alpha/dist/index.js"], ["packages/alpha/src/raw.ts"], ["packages/alpha/src/unshipped.ts"],
  ["packages/alpha/src/names.test.ts"], ["packages/beta/index.js"], ["packages/ghost/index.js"], ["docs/board/reported.json"],
  ["docs/board/summaries/day.md", "docs/board/reported.json"], ["docs/guide.md"], ["CLAUDE.md", "docs/board/reported.json"], ["package.json"],
  ["scripts/ci-changed.ts"], ["layers.json"], ["packages/judge/src/a.ts", "packages/scorer/requirements.txt"], ["packages/gamma/python/x.py"],
  ["packages/alpha/src/unshipped.ts", "packages/gamma/index.js"],
];

const PR_BODIES = [
  "", "no-release: docs only", "text\nno-release: <reason>\n", "  no-release:   spaced reason  \r\nmore", "no-release:\nno-release: second", "No-Release: wrong case",
];

/** `classify` with each of the three injectable reads left at its real default, over the tracked fixture, and with them stubbed. */
function classifyProbes(): Array<(m: Module, repo: string) => unknown> {
  const packages = ["alpha", "beta", "gamma", "broken", "worker", "layer-only"];
  const packedAlpha = (_repo: string, name: string) => new Set(name === "alpha" ? ["dist/index.js", "src/raw.ts", "package.json"] : ["index.js"]);
  return FILE_LISTS.flatMap((files) => [
    (m: Module, repo: string) => call(m, "classify", files, packages, { repoRoot: repo, getPackedFiles: packedAlpha }),
    (m: Module, repo: string) => call(m, "classify", files, packages, {
      repoRoot: repo,
      getPackedFiles: () => new Set(),
      getTestDependencyMap: () => new Map([["README.md", new Set(["alpha"])], ["docs/board/reported.json", new Set(["gamma", "beta"])]]),
      getDocsReadingTests: () => ["packages/gamma/src/reads.test.ts"],
    }),
    (m: Module, repo: string) => call(m, "classify", files, packages, { repoRoot: repo, getPackedFiles: packedAlpha, getDocsReadingTests: () => [] }),
    (m: Module, repo: string) => call(m, "jobsFor", files, repo),
  ]);
}

function probesFor(stem: Stem): Probes {
  if (stem === "isolation-gate") {
    return {
      SMOKE: [(m) => m.SMOKE],
      satisfies: RANGE_CASES.map(([version, range]) => (m: Module) => call(m, "satisfies", version, range)),
      packedRangeProblems: MANIFEST_SETS.map((manifests) => (m: Module) => call(m, "packedRangeProblems", manifests)),
      declaredBins: BIN_MANIFESTS.map((manifest) => (m: Module) => call(m, "declaredBins", manifest)),
      missingBinShims: BIN_MANIFESTS.map((manifest) => (m: Module, repo: string) => {
        const bins = join(repo, "consumer", "node_modules", ".bin");
        mkdirSync(bins, { recursive: true });
        writeFileSync(join(bins, "cli"), "#!/bin/sh\n");
        writeFileSync(join(bins, "one"), "#!/bin/sh\n");
        rmSync(join(bins, "two"), { force: true });
        symlinkSync(join(repo, "nowhere"), join(bins, "two"));
        return call(m, "missingBinShims", join(repo, "consumer"), manifest);
      }),
      internalDependencies: ["alpha", "beta", "gamma", "broken", "worker"].map((name) => (m: Module, repo: string) => call(m, "internalDependencies", pkg(repo, name))),
      checkIsolation: [
        (m, repo) => call(m, "checkIsolation", join(repo, "packages", "no-such-package")),
        (m, repo) => call(m, "checkIsolation", pkg(repo, "gamma")),
      ],
      allPackages: [(m) => call(m, "allPackages")],
      leftOutLayerCheckouts: [(m) => call(m, "leftOutLayerCheckouts")],
      packedFiles: [(m, repo) => [...(call(m, "packedFiles", pkg(repo, "alpha")) as Set<string>)].sort()],
    };
  }
  return {
    DOC_ROOT_FILES: [(m) => [...(m.DOC_ROOT_FILES as Set<string>)].sort()],
    knownPackages: [(m, repo) => call(m, "knownPackages", repo)],
    boardOnly: FILE_LISTS.map((files) => (m: Module) => call(m, "boardOnly", files)),
    candidatePackedPaths: ["src/a.ts", "src/deep/b.tsx", "src/c", "dist/d.js", "package.json", "src/e.test.ts", "src/.hidden"]
      .map((path) => (m: Module) => call(m, "candidatePackedPaths", path)),
    reachesPacked: [
      (m) => call(m, "reachesPacked", new Set(["dist/a.js"]), ["src/a.ts", "dist/a."]),
      (m) => call(m, "reachesPacked", new Set(["dist/ab.js"]), ["dist/a."]),
      (m) => call(m, "reachesPacked", new Set(["package.json"]), ["package.json"]),
      (m) => call(m, "reachesPacked", new Set(), ["package.json", "dist/a."]),
      (m) => call(m, "reachesPacked", { has: () => true }, ["dist/a."]),
    ],
    feedsBuiltOutput: [
      (m) => call(m, "feedsBuiltOutput", new Set(["dist/cli.mjs"]), "src/action/run.ts"),
      (m) => call(m, "feedsBuiltOutput", new Set(["dist/cli.mjs"]), "src/action/run.test.ts"),
      (m) => call(m, "feedsBuiltOutput", new Set(["dist/cli.mjs"]), "README.md"),
      (m) => call(m, "feedsBuiltOutput", new Set(["index.js"]), "src/run.ts"),
      (m) => call(m, "feedsBuiltOutput", new Set(), "src/run.ts"),
    ],
    noReleaseReason: PR_BODIES.map((body) => (m: Module) => call(m, "noReleaseReason", body)),
    testDependencyMap: [(m, repo) => [...(call(m, "testDependencyMap", repo) as Map<string, Set<string>>)].map(([file, owners]) => [file, [...owners].sort()]).sort()],
    docsReadingTests: [(m, repo) => call(m, "docsReadingTests", repo)],
    classify: classifyProbes(),
    jobsFor: [],
    packedFiles: [(m, repo) => [...(call(m, "packedFiles", repo, "alpha") as Set<string>)].sort()],
  };
}

/** Every way `copy` differs from `reference`: the exported names, then each probe's outcome. Empty means no drift. */
function compare(reference: Module, copy: Module, probes: Probes, repo: string): string[] {
  const differences: string[] = [];
  const left = Object.keys(reference).sort();
  const right = Object.keys(copy).sort();
  if (JSON.stringify(left) !== JSON.stringify(right)) differences.push(`exports differ: toolchain [${left}] vs copy [${right}]`);
  for (const name of left) {
    if (!(name in probes)) differences.push(`${name} is exported and has no probe`);
  }
  for (const [name, runs] of Object.entries(probes)) {
    runs.forEach((run, index) => {
      const want = outcomeOf(() => run(reference, repo));
      const got = outcomeOf(() => run(copy, repo));
      try {
        assert.deepEqual(got, want);
      } catch {
        differences.push(`${name} probe ${index}: toolchain ${JSON.stringify(want)} vs copy ${JSON.stringify(got)}`);
      }
    });
  }
  return differences;
}

const tidy: string[] = [];
test.after(() => { for (const dir of tidy) rmSync(dir, { recursive: true, force: true }); });
async function track(options: Parameters<typeof fixtureRepo>[0] = {}): Promise<Fixture> {
  const fixture = await fixtureRepo(options);
  tidy.push(fixture.dir);
  return fixture;
}

test("the installed @a11ign/toolchain is the version the core pins", () => {
  const installed = JSON.parse(readFileSync(`${ROOT}node_modules/@a11ign/toolchain/package.json`, "utf8")).version;
  assert.equal(installed, pinnedToolchainVersion());
});

for (const stem of STEMS) {
  test(`${COPY_PATHS[stem]} behaves like @a11ign/toolchain/lib/${stem} at the pinned version`, async () => {
    const fixture = await track();
    const probes = probesFor(stem);
    assert.ok(Object.values(probes).flat().length > 0, "a comparison with no probes would pass anything");
    const differences = compare(await fixture.module("toolchain", stem), await fixture.module("copy", stem), probes, fixture.dir);
    assert.deepEqual(differences, [], `${stem} has drifted from @a11ign/toolchain@${pinnedToolchainVersion()}`);
  });
}

test("the fixture is observable: the comparisons above do not pass on two empty answers", async () => {
  const fixture = await track();
  const gate = await fixture.module("toolchain", "isolation-gate");
  assert.deepEqual((call(gate, "allPackages") as string[]).map((dir) => dir.split("/").pop()).sort(), ["alpha", "broken", "gamma", "layer-only"]);
  assert.deepEqual(call(gate, "leftOutLayerCheckouts"), ["worker"]);
  assert.equal(call(gate, "satisfies", "0.2.0", "^0.1.2"), false);
  assert.deepEqual(call(gate, "internalDependencies", pkg(fixture.dir, "alpha")), [pkg(fixture.dir, "beta")]);
  const packed = [...(call(gate, "packedFiles", pkg(fixture.dir, "alpha")) as Set<string>)];
  assert.ok(packed.includes("dist/index.js"), `pnpm pack listed ${JSON.stringify(packed)}: without it the packedFiles probe compares two failures`);
  const changed = await fixture.module("toolchain", "ci-changed");
  assert.deepEqual(call(changed, "knownPackages", fixture.dir), ["alpha", "beta", "broken", "gamma", "guards", "layer-only", "worker"]);
  assert.equal(call(changed, "noReleaseReason", "no-release: docs only"), "docs only");
});

const ALTERATIONS: Record<Stem, { name: string; edit: (text: string) => string }> = {
  "isolation-gate": { name: "the caret's 0.x narrowing dropped", edit: (text) => text.replace("bound.findIndex((part) => part !== 0) + 1 || bound.length", "1") },
  "ci-changed": { name: "the dist/ prefix match dropped", edit: (text) => text.replace("if (!c.endsWith(\".\")) return false;", "return false;") },
};

for (const stem of STEMS) {
  test(`positive control: the comparison for ${stem} reports ${ALTERATIONS[stem].name} and passes a copy altered only in a comment`, async () => {
    const path = COPY_PATHS[stem];
    const original = readFileSync(`${ROOT}${path}`, "utf8");
    assert.notEqual(ALTERATIONS[stem].edit(original), original, "the alteration must change the copy, or this control proves nothing");
    const probes = probesFor(stem);

    const drifted = await track({ alter: (at, text) => (at === path ? ALTERATIONS[stem].edit(text) : text) });
    const reported = compare(await drifted.module("toolchain", stem), await drifted.module("copy", stem), probes, drifted.dir);
    assert.notDeepEqual(reported, [], `${stem} with ${ALTERATIONS[stem].name} must be reported as drift`);

    const commented = await track({ alter: (at, text) => (at === path ? `${text}\n// a comment only, not drift\n` : text) });
    assert.deepEqual(compare(await commented.module("toolchain", stem), await commented.module("copy", stem), probes, commented.dir), []);
  });
}
