// no-token: none -- reads two package manifests and runs three pairs of pure helpers; no network, no GitHub.
/**
 * #4707: THE CORE KEEPS THREE OF THE TOOLCHAIN'S HELPERS AS COPIES, AND THIS IS THE CHECK THAT SAYS WHEN A COPY DRIFTED.
 *
 * `scripts/cli-flags.ts`, `packages/guards/src/git-env.ts` and `scripts/npm-cli-executable.ts` are imported by scripts that run
 * BEFORE `node_modules` exists (the root `preinstall` among them), so they cannot import `@a11ign/toolchain`. #4589 measured
 * that and kept the three. A copy with no check is the `cross-repo-copies` defect, so: after install, compare each copy with the
 * toolchain's `lib/<stem>` at the version the root manifest pins. The comparison reads NAMES and BEHAVIOUR, never text, so a
 * copy that differs in a comment is not drift.
 *
 * Positive control: `compare` is fed a deliberately altered copy and must report a difference, and fed a copy altered to match
 * must report none, so neither an empty comparison nor an always-different one passes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const STEMS = ["cli-flags", "git-env", "npm-cli-executable"] as const;
type Stem = (typeof STEMS)[number];
type Module = Record<string, unknown>;
type Outcome = { value: unknown } | { threw: string };
type Probes = Record<string, Array<(module: Module) => unknown>>;

const COPY_PATHS: Record<Stem, string> = {
  "cli-flags": "scripts/cli-flags.ts",
  "git-env": "packages/guards/src/git-env.ts",
  "npm-cli-executable": "scripts/npm-cli-executable.ts",
};

function outcomeOf(run: () => unknown): Outcome {
  try {
    return { value: run() };
  } catch (error) {
    return { threw: error instanceof Error ? error.message : String(error) };
  }
}

/** Runs `run` with `process.env`, `process.argv` and `PATH` replaced, and puts them back. */
function inProcess<T>(setup: { env: Record<string, string>; argv?: string[] }, run: () => T): T {
  const savedEnv = process.env;
  const savedArgv = process.argv;
  process.env = { ...setup.env };
  if (setup.argv) process.argv = setup.argv;
  try {
    return run();
  } finally {
    process.env = savedEnv;
    process.argv = savedArgv;
  }
}

/** `refuseUnknownFlags` exits the process on refusal: capture the exit code and stderr instead of dying. */
function refusal(module: Module, known: string[], argv: string[], entryMatches: boolean) {
  const realExit = process.exit;
  const realError = console.error;
  const lines: string[] = [];
  let exitCode: unknown = "no exit";
  const script = realpathSync(process.argv[1] ?? fileURLToPath(import.meta.url));
  const entry = entryMatches ? pathToFileURL(script).href : "file:///not-this-script";
  process.exit = ((code?: number) => { exitCode = code; throw new Error("exit"); }) as typeof process.exit;
  console.error = (...parts: unknown[]) => { lines.push(parts.join(" ")); };
  try {
    (module.refuseUnknownFlags as (...a: unknown[]) => unknown)(known, { entry, argv, command: "probe" });
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "exit") throw error;
  } finally {
    process.exit = realExit;
    console.error = realError;
  }
  return { exitCode, lines };
}

const call = (module: Module, name: string, ...args: unknown[]) => (module[name] as (...a: unknown[]) => unknown)(...args);

function npmFixture(): { dir: string; bin: string } {
  const dir = mkdtempSync(join(tmpdir(), "bootstrap-copies-"));
  const bin = join(dir, "bin");
  mkdirSync(bin);
  for (const name of ["npm", "npx", "pnpm", "corepack"]) writeFileSync(join(bin, name), "");
  writeFileSync(join(dir, "pnpm.cjs"), "");
  return { dir, bin };
}

function probesFor(stem: Stem, fixture: { dir: string; bin: string }): Probes {
  const known = ["--role=", "--list", "-v", "--verbose"];
  const argvs = [[], ["--list"], ["--role=x", "-v"], ["--lst"], ["--rolee=x", "-q"], ["--", "--list"], ["a", "-e"]];
  if (stem === "cli-flags") {
    return {
      nameOf: ["--role=x", "--list", "-v", "plain", "--a=b=c", ""].map((arg) => (m: Module) => call(m, "nameOf", arg)),
      flagValue: [[["--role=x"], "--role"], [["--role", "x"], "--role"], [["--list"], "--role"], [["--role="], "--role"]]
        .map(([argv, name]) => (m: Module) => call(m, "flagValue", argv, name)),
      unknownFlags: argvs.map((argv) => (m: Module) => call(m, "unknownFlags", argv, known)),
      didYouMean: ["--lst", "--rolee", "--zzzzzzzzzz", "--verbos", "--listxxxx", "--listxxxxx"].map((flag) => (m: Module) => call(m, "didYouMean", flag, known)),
      refuseUnknownFlags: [
        ...argvs.map((argv) => (m: Module) => refusal(m, known, argv, true)),
        (m: Module) => refusal(m, known, ["--bogus"], false),
        (m: Module) => refusal(m, [], ["--bogus"], true),
      ],
    };
  }
  if (stem === "git-env") {
    const env = { PATH: "/usr/bin", HOME: "/h", GIT_DIR: "/x", GIT_WORK_TREE: "/y", GIT_FUTURE_VAR: "1", NOT_GIT: "2" };
    return {
      KNOWN_GIT_REDIRECT_VARS: [(m: Module) => m.KNOWN_GIT_REDIRECT_VARS],
      sandboxGitEnv: [
        (m: Module) => inProcess({ env }, () => call(m, "sandboxGitEnv")),
        (m: Module) => inProcess({ env }, () => call(m, "sandboxGitEnv", { GIT_AUTHOR_NAME: "a", EXTRA: "b" })),
        (m: Module) => inProcess({ env: {} }, () => call(m, "sandboxGitEnv", {})),
      ],
    };
  }
  const withPath = (path: string, extra: Record<string, string> = {}) => ({ env: { PATH: path, ...extra } });
  const empty = join(fixture.dir, "empty");
  const pnpmScript = join(fixture.dir, "pnpm.cjs");
  const names = ["npm", "npx"] as const;
  return {
    npmCliScriptCandidates: names.flatMap((name) => [
      (m: Module) => inProcess(withPath(fixture.bin), () => call(m, "npmCliScriptCandidates", name)),
      (m: Module) => inProcess(withPath(empty), () => call(m, "npmCliScriptCandidates", name)),
    ]),
    resolveNpmCliScript: names.flatMap((name) => [
      (m: Module) => inProcess(withPath(fixture.bin), () => call(m, "resolveNpmCliScript", name)),
      (m: Module) => inProcess(withPath(empty), () => call(m, "resolveNpmCliScript", name)),
    ]),
    npmCliInvocation: names.map((name) =>
      (m: Module) => inProcess(withPath(empty), () => call(m, "npmCliInvocation", name, ["install", "--x"]))),
    pnpmCliInvocation: [
      (m: Module) => inProcess(withPath(empty, { npm_execpath: pnpmScript }), () => call(m, "pnpmCliInvocation", ["run", "t"])),
      (m: Module) => inProcess(withPath(fixture.bin), () => call(m, "pnpmCliInvocation", ["run", "t"])),
      (m: Module) => inProcess(withPath(empty), () => call(m, "pnpmCliInvocation", ["run", "t"])),
    ],
  };
}

/** Every way `copy` differs from `reference`: the exported names, then each probe's outcome. Empty means no drift. */
function compare(reference: Module, copy: Module, probes: Probes): string[] {
  const differences: string[] = [];
  const left = Object.keys(reference).sort();
  const right = Object.keys(copy).sort();
  if (JSON.stringify(left) !== JSON.stringify(right)) differences.push(`exports differ: toolchain [${left}] vs copy [${right}]`);
  for (const name of left) {
    if (typeof reference[name] === "function" && !(name in probes)) differences.push(`${name} is exported and has no probe`);
  }
  for (const [name, runs] of Object.entries(probes)) {
    runs.forEach((run, index) => {
      const want = outcomeOf(() => run(reference));
      const got = outcomeOf(() => run(copy));
      try {
        assert.deepEqual(got, want);
      } catch {
        differences.push(`${name} probe ${index}: toolchain ${JSON.stringify(want)} vs copy ${JSON.stringify(got)}`);
      }
    });
  }
  return differences;
}

function pinnedToolchainVersion(): string {
  const manifest = JSON.parse(readFileSync(`${ROOT}package.json`, "utf8"));
  const pin = manifest.dependencies?.["@a11ign/toolchain"] ?? manifest.devDependencies?.["@a11ign/toolchain"];
  assert.match(pin, /^\d+\.\d+\.\d+$/, "the core must pin @a11ign/toolchain to an exact version for this comparison to name one");
  return pin;
}

const fixture = npmFixture();
test.after(() => rmSync(fixture.dir, { recursive: true, force: true }));

test("the installed @a11ign/toolchain is the version the core pins", () => {
  const installed = JSON.parse(readFileSync(`${ROOT}node_modules/@a11ign/toolchain/package.json`, "utf8")).version;
  assert.equal(installed, pinnedToolchainVersion());
});

for (const stem of STEMS) {
  test(`${COPY_PATHS[stem]} behaves like @a11ign/toolchain/lib/${stem} at the pinned version`, async () => {
    const copy: Module = await import(`${ROOT}${COPY_PATHS[stem]}`);
    const reference: Module = await import(`@a11ign/toolchain/lib/${stem}`);
    const probes = probesFor(stem, fixture);
    assert.ok(Object.values(probes).flat().length > 0, "a comparison with no probes would pass anything");
    assert.deepEqual(compare(reference, copy, probes), [], `${stem} has drifted from @a11ign/toolchain@${pinnedToolchainVersion()}`);
  });

  test(`positive control: the comparison for ${stem} reports a deliberately altered copy and passes one altered to match`, async () => {
    const reference: Module = await import(`@a11ign/toolchain/lib/${stem}`);
    const probes = probesFor(stem, fixture);
    const [first] = Object.keys(probes);
    const renamed = { ...reference, extraExport: () => 0 };
    const changed = {
      ...reference,
      [first as string]: Array.isArray(reference[first as string]) ? [...(reference[first as string] as string[]), "drift"] : () => "drift",
    };
    assert.notDeepEqual(compare(reference, renamed, probes), [], "an extra export must be reported");
    assert.notDeepEqual(compare(reference, changed, probes), [], "a changed behaviour must be reported");
    assert.deepEqual(compare(reference, { ...reference }, probes), [], "a copy altered to match must report nothing");
  });
}
