/**
 * Every `exports` target of core's own judge package is on disk after the build (a11ign#5345, from control's `doctor.test.ts`, a11ign/control#84).
 *
 * `exports` names the files `a11ign` ships. If Rslib renames an output and `exports` does not follow, the package still builds and publishes
 * with a dead entry point, and only a read of the real `dist` against the real manifest says so: no fixture can. The fleet owns the function
 * (`missingExportTargets`, screenreader-fleet's `doctor.ts`), and core does not import the fleet, so the ~25 lines it needs are here.
 *
 * What is pinned:
 *   1. `missingExportTargets` names exactly the targets whose file is absent, and is empty when every one is on disk.
 *   2. THE POSITIVE CONTROL: a `dist` missing a target reads as missing, naming it, so the clean reading of the live package is not vacuous.
 *   3. THE NULL: an unreadable manifest is null, never coerced to a clean `[]` or to a missing list.
 *   4. LIVE: every exports target of `packages/judge` is on disk. It needs the build, which CI runs before the suite (`pnpm run build`).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const JUDGE_DIR = join(REPO_ROOT, "packages/judge");

/** Every file an `exports` field points at, however deeply the conditions nest. */
function exportTargets(exportsField: unknown): string[] {
  if (typeof exportsField === "string") return [exportsField];
  if (exportsField === null || typeof exportsField !== "object") return [];
  return Object.values(exportsField).flatMap(exportTargets);
}

/** The targets of `packageDir`'s `exports` whose file is absent; null when the manifest is unreadable or declares no target. */
function missingExportTargets(packageDir: string): string[] | null {
  let manifest: { exports?: unknown };
  try {
    manifest = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8"));
  } catch {
    return null;
  }
  const targets = exportTargets(manifest.exports);
  if (targets.length === 0) return null;
  return targets.filter((target) => !existsSync(join(packageDir, target)));
}

function withTempDir(fn: (dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "judge-exports-test-"));
  try {
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** A package directory with `package.json` carrying `exports`, and only the `built` files under it. */
function writePackage(dir: string, { exports, built }: { exports: unknown; built: string[] }): void {
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "fixture", exports }));
  mkdirSync(join(dir, "dist"), { recursive: true });
  for (const file of built) writeFileSync(join(dir, file), "");
}

const FIXTURE_EXPORTS = { ".": { types: "./dist/index.d.ts", default: "./dist/index.mjs" } };

test("missingExportTargets: nothing missing when every target is on disk", () => {
  withTempDir((dir) => {
    writePackage(dir, { exports: FIXTURE_EXPORTS, built: ["dist/index.d.ts", "dist/index.mjs"] });
    assert.deepEqual(missingExportTargets(dir), []);
  });
});

test("POSITIVE CONTROL: a dist missing a target reads as missing, naming it, so the clean reading above is not vacuous", () => {
  withTempDir((dir) => {
    writePackage(dir, { exports: FIXTURE_EXPORTS, built: ["dist/index.d.ts"] });
    assert.deepEqual(missingExportTargets(dir), ["./dist/index.mjs"]);
  });
});

test("MUTATION target: missingExportTargets is NULL when the manifest is unreadable, never a clean or a missing reading", () => {
  withTempDir((dir) => assert.equal(missingExportTargets(dir), null));
});

test("LIVE: every exports target of packages/judge is on disk after the build", () => {
  // Not a fixture: the real manifest and the real `dist`. A null here means the manifest could not be read, which is not a clean reading,
  // so the assertion below fails on it rather than passing it as `[]`.
  assert.deepEqual(missingExportTargets(JUDGE_DIR), [],
    "a target is missing from packages/judge/dist, or the manifest is unreadable: run `pnpm run build` first, then check `exports` against Rslib's output");
});
