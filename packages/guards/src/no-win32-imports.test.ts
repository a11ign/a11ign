/**
 * Nothing in core may load the capture driver at import time.
 *
 * `@guidepup/guidepup`'s index constructs a `ScreenReader` at module scope, and that constructor throws
 * `No available supported screen readers` on a host with no screen reader. A static import of the package from
 * any core module would crash every Linux job that loads the file at import time, and a developer's Mac would
 * hide it, because macOS resolves VoiceOver and the constructor succeeds there.
 *
 * So the guard is STATIC: a property of the import graph, not of running the modules. Running them would
 * exercise the same flaw the check exists to find, on the same host, with the same blindness.
 *
 * Core holds no driver of its own (the win32 worker lives in the layer checkout), so the rule is that nothing
 * reaches guidepup statically. A dynamic `await import()` inside the function that needs it is the remedy and is
 * not flagged: the module then loads anywhere and only pays for the driver where it is called.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { filesUnder } from "./files-under.ts";

const REPO = fileURLToPath(new URL("../../../", import.meta.url));

/** The module whose mere import throws where there is no screen reader. */
const POISON = "@guidepup/guidepup";

/** Measured on 2026-10-13. Six below it, so a moved layout fails here rather than shrinking the walk quietly. */
const PORTABLE_FLOOR = 245;

const packageSourceRoots = readdirSync(join(REPO, "packages"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .flatMap((entry) => [`packages/${entry.name}/src`, `packages/${entry.name}/scripts`]);

/** Every source tree in core. All of it runs on the Linux lab, so all of it is portable. */
const PORTABLE_TREES = ["scripts", ...packageSourceRoots].filter((dir) => existsSync(join(REPO, dir)));

const isSource = (path: string) => /\.(mjs|ts)$/.test(path) && !/\.test\.(ts|mjs)$/.test(path)
  && !/\.d\.ts$/.test(path);

/** Every source file under the repo-relative `dir`, as repo-relative paths. */
function sourcesIn(dir: string): string[] {
  return filesUnder(join(REPO, dir), {
    skipDirectory: (name) => name === "node_modules" || name === "dist",
    keepFile: isSource,
  }).map((full) => full.slice(REPO.length)).sort();
}

/** STATIC imports only: `import x from "y"`, `export … from "y"`, and bare `import "y"`. */
function staticImports(file: string): string[] {
  const text = readFileSync(file, "utf8");
  const specifiers: string[] = [];
  for (const match of text.matchAll(/^\s*(?:import|export)\b[^;\n]*?from\s*["']([^"']+)["']/gm)) {
    specifiers.push(match[1]);
  }
  for (const match of text.matchAll(/^\s*import\s+["']([^"']+)["']/gm)) specifiers.push(match[1]);
  return specifiers;
}

/**
 * Resolve a RELATIVE specifier to an absolute source file, or null. Bare specifiers are other packages, and
 * they are the other package's concern, not this walk's.
 */
function resolveLocal(fromFile: string, specifier: string): string | null {
  if (!specifier.startsWith(".")) return null;
  const base = resolve(dirname(fromFile), specifier);
  for (const candidate of [base, `${base}.ts`, `${base}.mjs`, join(base, "index.ts"), join(base, "index.mjs")]) {
    // `.js` in a TypeScript import means the `.ts` beside it.
    for (const attempt of [candidate, candidate.replace(/\.js$/, ".ts")]) {
      if (existsSync(attempt) && statSync(attempt).isFile()) return attempt;
    }
  }
  return null;
}

/** The chain from `entry` (relative to `root`) to the driver, or null when it never gets there. */
function pathToDriver(entry: string, root: string): string[] | null {
  const seen = new Set<string>();
  const queue = [{ file: join(root, entry), chain: [entry] }];
  while (queue.length) {
    const { file, chain } = queue.shift()!;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const specifier of staticImports(file)) {
      if (specifier === POISON) return [...chain, POISON];
      const next = resolveLocal(file, specifier);
      if (next && !seen.has(next)) queue.push({ file: next, chain: [...chain, relative(root, next)] });
    }
  }
  return null;
}

const PORTABLE = PORTABLE_TREES.flatMap(sourcesIn);

test("the trees being examined are real, so this guard cannot pass having read nothing", () => {
  assert.ok(PORTABLE.length >= PORTABLE_FLOOR, `only ${PORTABLE.length} portable source files found; the layout moved`);
  for (const tree of PORTABLE_TREES) {
    assert.ok(sourcesIn(tree).length > 0, `${tree} yielded no source files`);
  }
});

test("the poison really is reachable through a static import, or this guard proves nothing", () => {
  // The real tree has no static path to the driver, so the emptiness test below cannot show the walker works.
  // This fixture is the positive control: a static import must be found, and a dynamic one must not be.
  // The temp directory is removed in `finally`: rstest's test context has no `after` hook, and a leftover entry
  // is reported as a failure of the run.
  const root = mkdtempSync(join(tmpdir(), "no-win32-"));
  try {
    writeFileSync(join(root, "entry.ts"), 'import { x } from "./middle.ts";\n');
    writeFileSync(join(root, "middle.ts"), `export { y as x } from "${POISON}";\n`);
    writeFileSync(join(root, "lazy.ts"), `export const load = async () => (await import("${POISON}")).default;\n`);
    assert.deepEqual(pathToDriver("entry.ts", root), ["entry.ts", "middle.ts", POISON]);
    assert.equal(pathToDriver("lazy.ts", root), null, "a dynamic import is the remedy, and must not be flagged");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("no core module statically reaches the capture driver", () => {
  const offenders = PORTABLE
    .map((file) => ({ file, chain: pathToDriver(file, REPO) }))
    .filter((found) => found.chain);

  assert.deepEqual(offenders.map((o) => o.chain!.join("\n      -> ")), [],
    `A module that runs on the Linux lab loads ${POISON} at import time, which throws `
    + "`No available supported screen readers` there. macOS resolves VoiceOver, so every local check passes and "
    + "only the lab fails.\n"
    + "Reach the driver through a dynamic `await import()` inside the function that needs it, so the module loads "
    + "anywhere and only pays for the driver where it is called.");
});
