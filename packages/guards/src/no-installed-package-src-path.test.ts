/**
 * No runnable surface names a path inside an installed package's `src/` tree.
 *
 * A consumer installs the PUBLISHED package, and the published package ships its entry points, not its source
 * tree. A workflow that runs `node_modules/<pkg>/src/...` works in the repository that wrote the path and fails
 * in every consumer, and it fails after the run has already spent its worker: the nightly Auth0 dispatch died at
 * step 12 on a Windows worker, reaching for a script that had moved out of `@a11ign/screenreader-fleet` (#5293).
 *
 * So the guard reads the TEXT of what runs, not the run: a path the published package does not carry is refused
 * where it is written, in seconds, on any host.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { filesUnder } from "./files-under.ts";

const REPO = fileURLToPath(new URL("../../../", import.meta.url));

/**
 * `node_modules/<pkg>/src/` and `node_modules/@scope/<pkg>/src/`, with or without a leading `./` or a quote. The
 * segment after `src/` is not constrained, so a file under the source tree is flagged whatever it is called.
 */
const INSTALLED_SRC = /node_modules\/(?:@[^/\s"'`]+\/)?[^/\s"'`]+\/src\//;

/** Measured on 2026-10-13: `action.yml`, the outsider generator and 20 workflow files. Two below it, so a moved layout fails here. */
const SURFACE_FLOOR = 20;

/** Every surface a workflow or the composite action runs from, as repo-relative paths. */
function runnableSurfaces(): string[] {
  const workflows = filesUnder(join(REPO, ".github/workflows"), {
    keepFile: (name) => /\.ya?ml$/.test(name),
  }).map((full) => full.slice(REPO.length));
  // `generate.ts` writes the workflow templates that consumers receive, so its text runs in consumers too.
  return ["action.yml", "scripts/outsider/generate.ts", ...workflows].sort();
}

/** Every line that names an installed package's `src/` path, as `file:line: text`. */
function installedSrcReferences(file: string): string[] {
  const text = readFileSync(join(REPO, file), "utf8");
  return text.split("\n").flatMap((line, index) =>
    INSTALLED_SRC.test(line) ? [`${file}:${index + 1}: ${line.trim()}`] : []);
}

test("the surfaces being read are real, so this guard cannot pass having read nothing", () => {
  const surfaces = runnableSurfaces();
  assert.ok(surfaces.length >= SURFACE_FLOOR, `only ${surfaces.length} runnable surfaces found; the layout moved`);
  assert.ok(surfaces.includes("action.yml"), "action.yml is the composite action every consumer runs");
});

test("the pattern really catches the fleet path, or this guard proves nothing", () => {
  // The real tree has no such line, so the emptiness test below cannot show the pattern works. These fixtures are
  // the positive control: the path a workflow once ran must be found, and the launcher the package ships must not.
  const fleetCopy = "./node_modules/@a11ign/screenreader-fleet/src/provisioning/apply-foreground-lock-timeout.ps1";
  const unscoped = "run: node node_modules/typescript/src/tsc.js";
  const shippedLauncher = "./node_modules/@a11ign/screenreader-worker/launcher/apply-foreground-lock-timeout.ps1";
  const shippedDist = "node -p \"require('node:fs').realpathSync('node_modules/@a11ign/screenreader-worker/dist/server.mjs')\"";
  const noSrcSegment = "node_modules/@a11ign/screenreader-fleet/package.json";
  assert.ok(INSTALLED_SRC.test(fleetCopy), "the scoped fleet copy must be flagged");
  assert.ok(INSTALLED_SRC.test(unscoped), "an unscoped package's src/ must be flagged");
  assert.ok(!INSTALLED_SRC.test(shippedLauncher), "the launcher the package ships must not be flagged");
  assert.ok(!INSTALLED_SRC.test(shippedDist), "a dist/ entry point must not be flagged");
  assert.ok(!INSTALLED_SRC.test(noSrcSegment), "a file at the package root must not be flagged");
});

test("no runnable surface names an installed package's src/ path", () => {
  const offenders = runnableSurfaces().flatMap(installedSrcReferences);

  assert.deepEqual(offenders, [],
    "A workflow or the action names a path inside an installed package's src/ tree. The published package does "
    + "not ship it, so the consumer's run fails after its worker is spent.\n"
    + "Run the entry point the package publishes instead: `node_modules/<pkg>/<files entry>`, as action.yml does.");
});
