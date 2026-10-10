// no-token: none -- builds throwaway local git repositories and runs two pairs of helpers in them; no network, no GitHub.
/**
 * #4719: THE CORE KEEPS TWO MORE OF THE TOOLCHAIN'S HELPERS AS COPIES, `changed-files` AND `changed-packages`, AND THIS IS THE CHECK THAT SAYS WHEN ONE DRIFTED.
 *
 * `packages/guards/src/changed-files.ts` and `changed-packages.ts` are reached by `scripts/ci-changed.ts` (`ci.yml`'s `changed` job, no
 * `pnpm install`) and by `scripts/release-promote.ts` (`release.yml`'s `decide` job, no install), so they cannot import `@a11ign/toolchain`
 * (#4590). A copy with no check is the `cross-repo-copies` defect, so: after install, compare each copy with the toolchain's `lib/<stem>` at
 * the version the root manifest pins. The comparison reads NAMES and BEHAVIOUR, never text, so a copy that differs in a comment is not drift.
 * Sibling of `bootstrap-copies-match-toolchain.test.ts` (#4707), which does the same for `cli-flags`, `git-env` and `npm-cli-executable`.
 *
 * THE FIXTURE: both modules compute the repository they read from their OWN location (`../../../`), so each is copied into a throwaway git
 * repository at the depth it expects and imported from there. Both therefore read the same repository and never this checkout.
 *
 * Positive control: `compare` is fed a copy with a real behavioural alteration (`--no-renames` dropped, #939) and must report it, and a copy
 * altered only in a comment, which must report nothing, so neither an empty comparison nor an always-different one passes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { sandboxGitEnv } from "@a11ign/toolchain/lib/git-sandbox";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const STEMS = ["changed-files", "changed-packages"] as const;
type Stem = (typeof STEMS)[number];
type Module = Record<string, unknown>;
type Outcome = { value: unknown } | { threw: true };
type Probes = Record<string, Array<(module: Module, repo: string) => unknown>>;

const COPY_PATHS: Record<Stem, string> = {
  "changed-files": "packages/guards/src/changed-files.ts",
  "changed-packages": "packages/guards/src/changed-packages.ts",
};
/** What each copy imports at runtime, which the fixture must carry at the same relative place. */
const COPY_SUPPORT = ["packages/guards/src/git-env.ts", "scripts/cli-flags.ts"];
/** The toolchain's modules the two lib files import, copied beside them under `toolchain/dist/lib/`. */
const LIB_FILES = ["changed-files.mjs", "changed-packages.mjs", "git-env.mjs", "cli-flags.mjs"];
const TOOLCHAIN_LIB = `${ROOT}node_modules/@a11ign/toolchain/dist/lib`;
const FIXTURE_LIB = "toolchain/dist/lib";

function pinnedToolchainVersion(): string {
  const manifest = JSON.parse(readFileSync(`${ROOT}package.json`, "utf8"));
  const pin = manifest.dependencies?.["@a11ign/toolchain"] ?? manifest.devDependencies?.["@a11ign/toolchain"];
  assert.match(pin, /^\d+\.\d+\.\d+$/, "the core must pin @a11ign/toolchain to an exact version for this comparison to name one");
  return pin;
}

interface Fixture { dir: string; module: (side: "copy" | "toolchain", stem: Stem) => Promise<Module> }

/**
 * A repository holding both sides at the depth each expects. `origin/main` is the base commit when `withOrigin`, and a branch on top of it
 * changes a package file, adds one in another package, moves a script out of `scripts/` and edits a doc. `alter` rewrites a copy's text.
 */
async function fixtureRepo(options: { withOrigin: boolean; alter?: (path: string, text: string) => string }): Promise<Fixture> {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "bootstrap-copies-changed-")));
  const put = (path: string, text: string) => {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  };
  const git = (...args: string[]) => execFileSync("git", ["-c", "user.name=Bootstrap Copies Test", "-c", "user.email=bootstrap-copies@example.invalid", ...args],
    { cwd: dir, env: sandboxGitEnv(), encoding: "utf8" });
  for (const path of [...Object.values(COPY_PATHS), ...COPY_SUPPORT]) put(path, options.alter ? options.alter(path, readFileSync(`${ROOT}${path}`, "utf8")) : readFileSync(`${ROOT}${path}`, "utf8"));
  for (const file of LIB_FILES) {
    mkdirSync(join(dir, FIXTURE_LIB), { recursive: true });
    copyFileSync(join(TOOLCHAIN_LIB, file), join(dir, FIXTURE_LIB, file));
  }
  put("packages/judge/src/a.ts", "a\n");
  put("packages/cli/src/b.ts", "b\n");
  put("scripts/move-me.mjs", "move\n");
  put("docs/guide.md", "guide\n");
  git("init", "-q", "-b", "main");
  git("add", "-A");
  git("commit", "-q", "-m", "base");
  if (options.withOrigin) git("update-ref", "refs/remotes/origin/main", "HEAD");
  git("checkout", "-q", "-b", "feature");
  put("packages/judge/src/a.ts", "a changed\n");
  put("packages/evidence/src/new.ts", "new\n");
  put("docs/guide.md", "guide changed\n");
  mkdirSync(join(dir, "tools"), { recursive: true });
  renameSync(join(dir, "scripts/move-me.mjs"), join(dir, "tools/move-me.mjs"));
  git("add", "-A");
  git("commit", "-q", "-m", "feature");
  const paths = { copy: COPY_PATHS, toolchain: Object.fromEntries(STEMS.map((stem) => [stem, `${FIXTURE_LIB}/${stem}.mjs`])) } as const;
  return {
    dir,
    module: (side, stem) => import(pathToFileURL(join(dir, paths[side][stem])).href),
  };
}

function outcomeOf(run: () => unknown): Outcome {
  try {
    return { value: run() };
  } catch {
    // The message names the module's own path, which differs by side by construction; THAT it threw is the behaviour.
    return { threw: true };
  }
}

const call = (module: Module, name: string, ...args: unknown[]) => (module[name] as (...a: unknown[]) => unknown)(...args);

const DIFF_TEXTS = [
  "", "README.md\n.github/workflows/ci.yml\n", "packages/a/x", "packages/judge/src/a.ts\npackages/cli/src/b.ts\npackages/judge/src/c.ts",
  "docs/packages/y.md\npackages/loose-file.json\npackages/\n  packages/evidence/src/z.ts  \npackages/guards/src/a.mjs\r",
];

function probesFor(stem: Stem): Probes {
  if (stem === "changed-files") {
    return {
      changedFiles: [
        (m, repo) => call(m, "changedFiles", ["origin/main...HEAD"], { repoRoot: repo }),
        (m, repo) => call(m, "changedFiles", ["origin/main", "HEAD"], { repoRoot: repo }),
        (m, repo) => call(m, "changedFiles", ["HEAD~1", "HEAD"], { repoRoot: repo }),
        (m, repo) => call(m, "changedFiles", ["HEAD~1", "HEAD"], { repoRoot: repo, pathspec: ["packages"] }),
        (m, repo) => call(m, "changedFiles", ["HEAD~1", "HEAD"], { repoRoot: repo, pathspec: ["scripts", "tools"] }),
        (m, repo) => call(m, "changedFiles", ["HEAD", "HEAD"], { repoRoot: repo }),
        (m, repo) => call(m, "changedFiles", ["no-such-ref...HEAD"], { repoRoot: repo }),
      ],
    };
  }
  return {
    changedPackages: DIFF_TEXTS.map((text) => (m: Module) => call(m, "changedPackages", text)),
    filesChangedAgainstOrigin: [(m) => call(m, "filesChangedAgainstOrigin")],
    changedPackagesAgainstOrigin: [(m) => call(m, "changedPackagesAgainstOrigin")],
  };
}

/** Every way `copy` differs from `reference`: the exported names, then each probe's outcome. Empty means no drift. */
function compare(reference: Module, copy: Module, probes: Probes, repo: string): string[] {
  const differences: string[] = [];
  const left = Object.keys(reference).sort();
  const right = Object.keys(copy).sort();
  if (JSON.stringify(left) !== JSON.stringify(right)) differences.push(`exports differ: toolchain [${left}] vs copy [${right}]`);
  for (const name of left) {
    if (typeof reference[name] === "function" && !(name in probes)) differences.push(`${name} is exported and has no probe`);
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
async function track(options: Parameters<typeof fixtureRepo>[0]): Promise<Fixture> {
  const fixture = await fixtureRepo(options);
  tidy.push(fixture.dir);
  return fixture;
}

test("the installed @a11ign/toolchain is the version the core pins", () => {
  const installed = JSON.parse(readFileSync(`${ROOT}node_modules/@a11ign/toolchain/package.json`, "utf8")).version;
  assert.equal(installed, pinnedToolchainVersion());
});

for (const stem of STEMS) {
  for (const withOrigin of [true, false]) {
    test(`${COPY_PATHS[stem]} behaves like @a11ign/toolchain/lib/${stem} at the pinned version (${withOrigin ? "origin/main present" : "no origin/main"})`, async () => {
      const fixture = await track({ withOrigin });
      const probes = probesFor(stem);
      assert.ok(Object.values(probes).flat().length > 0, "a comparison with no probes would pass anything");
      const differences = compare(await fixture.module("toolchain", stem), await fixture.module("copy", stem), probes, fixture.dir);
      assert.deepEqual(differences, [], `${stem} has drifted from @a11ign/toolchain@${pinnedToolchainVersion()}`);
    });
  }
}

test("the fixture's branch is observable: the comparisons above do not pass on two empty answers", async () => {
  const fixture = await track({ withOrigin: true });
  const toolchain = await fixture.module("toolchain", "changed-files");
  const files = call(toolchain, "changedFiles", ["origin/main...HEAD"], { repoRoot: fixture.dir }) as string[];
  assert.deepEqual([...files].sort(), ["docs/guide.md", "packages/evidence/src/new.ts", "packages/judge/src/a.ts", "scripts/move-me.mjs", "tools/move-me.mjs"]);
  const packages = await fixture.module("toolchain", "changed-packages");
  assert.deepEqual(call(packages, "changedPackagesAgainstOrigin"), ["evidence", "judge"]);
  const bare = await track({ withOrigin: false });
  assert.deepEqual(call(await bare.module("toolchain", "changed-packages"), "changedPackagesAgainstOrigin"), []);
});

const ALTERATIONS: Record<Stem, { name: string; edit: (text: string) => string }> = {
  "changed-files": { name: "`--no-renames` dropped", edit: (text) => text.replace('"--no-renames", ', "") },
  "changed-packages": { name: "the package pattern widened to any depth", edit: (text) => text.replace("/^packages\\/([^/]+)\\//", "/^packages\\/([^/]+)/") },
};

for (const stem of STEMS) {
  test(`positive control: the comparison for ${stem} reports ${ALTERATIONS[stem].name} and passes a copy altered only in a comment`, async () => {
    const path = COPY_PATHS[stem];
    const original = readFileSync(`${ROOT}${path}`, "utf8");
    assert.notEqual(ALTERATIONS[stem].edit(original), original, "the alteration must change the copy, or this control proves nothing");
    const probes = probesFor(stem);

    const drifted = await track({ withOrigin: true, alter: (at, text) => (at === path ? ALTERATIONS[stem].edit(text) : text) });
    const reported = compare(await drifted.module("toolchain", stem), await drifted.module("copy", stem), probes, drifted.dir);
    assert.notDeepEqual(reported, [], `${stem} with ${ALTERATIONS[stem].name} must be reported as drift`);

    const commented = await track({ withOrigin: true, alter: (at, text) => (at === path ? `${text}\n// a comment only, not drift\n` : text) });
    assert.deepEqual(compare(await commented.module("toolchain", stem), await commented.module("copy", stem), probes, commented.dir), []);
  });
}
