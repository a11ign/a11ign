// no-token: none -- imports two modules and runs their pure helpers over a table; no network, no GitHub.
/**
 * #4726: THE CORE KEEPS `walk-scope.ts` AS A COPY OF THE TOOLCHAIN'S ON PURPOSE, AND THIS IS THE CHECK THAT SAYS WHEN IT DRIFTED.
 *
 * The toolchain's `REPO_ROOT` is `new URL("../../", import.meta.url)`, which as installed is the toolchain PACKAGE directory, so as
 * the rstest preload it records no read of this repository and every `declareWalkScope` guard would pass vacuously (#4718 measured
 * `readsSoFar().includes("package.json")`: true for this copy, false for the toolchain's). So the copy stays, and what this file
 * compares is NAMES and BEHAVIOUR, never text: the exported names are the same set and the pure exports agree on a table of inputs.
 *
 * `REPO_ROOT` is the one DECLARED difference, asserted to differ: if it ever ceases to, the toolchain gained a root override and
 * the copy should go, with `scripts/rstest/rstest.config.ts` loading the toolchain's (say so on #4726).
 *
 * Positive control: `compare` is fed a deliberately altered copy and must report a difference, and fed one altered to match must
 * report none, so neither an empty comparison nor an always-different one passes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import * as copyModule from "./walk-scope.ts";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
type Module = Record<string, unknown>;
type Outcome = { value: unknown } | { threw: string };
type Probes = Record<string, Array<(module: Module) => unknown>>;

/** Exports that legitimately differ, each with why. Everything else must be equal. */
const DECLARED_DIFFERENCES: Record<string, string> = {
  REPO_ROOT: "the toolchain's resolves to its own installed package directory; the copy's is this repository (#4718)",
};

const call = (module: Module, name: string, ...args: unknown[]) => (module[name] as (...a: unknown[]) => unknown)(...args);

function outcomeOf(run: () => unknown): Outcome {
  try {
    return { value: run() };
  } catch (error) {
    return { threw: error instanceof Error ? error.message : String(error) };
  }
}

const SCOPES: string[][] = [[], ["docs"], ["docs", "packages/guards"], ["docs/", "scripts/rstest"], ["."]];
const READS = [
  [], ["docs/a.md"], ["packages/guards/src/x.ts", "scripts/y.mjs"], ["package.json"],
  ["(the whole repository) -- git grep"], ["docs", "docsx/a.md", "node_modules/@a11ign/judge/x"],
];
// The last set holds the unbounded marker: it is refused even as "the guard's own file", and only that input shows it.
const OWN = [new Set<string>(), new Set(["scripts/y.mjs"]), new Set(["package.json", "docs/a.md"]), new Set(["(the whole repository) -- git grep"])];

function probes(): Probes {
  return {
    readsOutsideScope: SCOPES.flatMap((scope) => READS.flatMap((reads) => OWN.map((own) =>
      (m: Module) => call(m, "readsOutsideScope", reads, scope, own)))),
    // relative to EACH module's own root: the roots are the declared difference, the arithmetic is not.
    runnerOwnedPaths: ["a/b.test.ts", "packages/guards/src/c.test.ts", "d.test.mjs"].map((rel) =>
      (m: Module) => call(m, "runnerOwnedPaths", join(m.REPO_ROOT as string, rel))),
    inScope: SCOPES.flatMap((scope) => ["docs/a.md", "docsx/a.md", "packages/guards", "x"].map((path) =>
      (m: Module) => call(m, "inScope", path, scope))),
    parseWalkScope: ['export const WALK_SCOPE = ["docs"];', "export const WALK_SCOPE = [];", "nothing declared here"].map((source) =>
      (m: Module) => call(m, "parseWalkScope", source)),
    NOT_WRAPPED: [(m: Module) => m.NOT_WRAPPED],
    ESM_UNSYNCED: [(m: Module) => m.ESM_UNSYNCED],
    DECLARER_BUILTINS: [(m: Module) => m.DECLARER_BUILTINS],
    WHOLE_REPOSITORY: [(m: Module) => m.WHOLE_REPOSITORY],
  };
}

/** Every way `copy` differs from `reference`: the exported names, then each probe's outcome. Empty means no drift. */
function compare(reference: Module, copy: Module, table: Probes): string[] {
  const differences: string[] = [];
  const left = Object.keys(reference).sort();
  const right = Object.keys(copy).sort();
  if (JSON.stringify(left) !== JSON.stringify(right)) differences.push(`exports differ: toolchain [${left}] vs copy [${right}]`);
  for (const name of left) {
    const probed = name in table;
    if (!probed && !(name in DECLARED_DIFFERENCES) && !NOT_PROBED_FUNCTIONS.has(name)) differences.push(`${name} is exported and has no probe`);
  }
  for (const [name, runs] of Object.entries(table)) {
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

/** Functions that act on the live process, so no table of inputs can compare them: names only, checked above. */
const NOT_PROBED_FUNCTIONS = new Set(["declareWalkScope", "isObserved", "readsDuring", "readsSoFar"]);

function pinnedToolchainVersion(): string {
  const manifest = JSON.parse(readFileSync(`${ROOT}package.json`, "utf8"));
  const pin = manifest.dependencies?.["@a11ign/toolchain"] ?? manifest.devDependencies?.["@a11ign/toolchain"];
  assert.match(pin, /^\d+\.\d+\.\d+$/, "the core must pin @a11ign/toolchain to an exact version for this comparison to name one");
  return pin;
}

const copy = copyModule as unknown as Module;
const reference: Module = await import("@a11ign/toolchain/lib/walk-scope");

test("the installed @a11ign/toolchain is the version the core pins", () => {
  const installed = JSON.parse(readFileSync(`${ROOT}node_modules/@a11ign/toolchain/package.json`, "utf8")).version;
  assert.equal(installed, pinnedToolchainVersion());
});

test("packages/guards/src/walk-scope.ts behaves like @a11ign/toolchain/lib/walk-scope at the pinned version", () => {
  const table = probes();
  assert.ok(Object.values(table).flat().length > 0, "a comparison with no probes would pass anything");
  assert.deepEqual(compare(reference, copy, table), [], `walk-scope has drifted from @a11ign/toolchain@${pinnedToolchainVersion()}`);
});

test("REPO_ROOT is the declared difference: the copy's is this repository and the toolchain's is not", () => {
  assert.ok(DECLARED_DIFFERENCES.REPO_ROOT);
  assert.equal(copy.REPO_ROOT, ROOT.replace(/\/$/, ""));
  assert.notEqual(reference.REPO_ROOT, copy.REPO_ROOT,
    "the toolchain's REPO_ROOT now equals the core's: it gained a root override, so the copy can go (say so on #4726)");
});

test("positive control: the comparison reports a deliberately altered copy and passes one altered to match", () => {
  const table = probes();
  const lostExport = Object.fromEntries(Object.entries(reference).filter(([name]) => name !== "inScope"));
  const changedAnswer = { ...reference, readsOutsideScope: () => ["drift"] };
  const changedData = { ...reference, NOT_WRAPPED: { fs: {} } };
  assert.notDeepEqual(compare(reference, { ...reference, extraExport: () => 0 }, table), [], "an extra export must be reported");
  assert.notDeepEqual(compare(reference, lostExport, table), [], "a lost export must be reported");
  assert.notDeepEqual(compare(reference, changedAnswer, table), [], "a changed pure answer must be reported");
  assert.notDeepEqual(compare(reference, changedData, table), [], "changed data must be reported");
  assert.deepEqual(compare(reference, { ...reference }, table), [], "a copy altered to match must report nothing");
});
