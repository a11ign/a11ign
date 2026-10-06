/**
 * `gate:isolation` does not pack a layer's CHECKOUT (#3830).
 *
 * On the lab `/opt/a11y/packages/nvda-worker` is the layer's clone, so it holds a `package.json`, and the gate packed it:
 * its `prepack` runs `pnpm`, which the lab does not have by design (#3141), so stage 5 of `release:gate` failed and the
 * nine stages behind it were never read. A layer publishes from its own repository (ADR 0040), so the core's gate has no
 * business packing it. `layers.json` already says which directories those are; discovery now asks it, and says how many it left out.
 *
 * THE POSITIVE CONTROLS ARE IN THIS FILE, by name. An emptiness assertion over "the layer is not packed" passes when
 * discovery finds nothing at all, so:
 *   - an ORDINARY package beside the layer is asserted still packed, and
 *   - the same fixture read with NO layers declared is asserted to pack the layer, which is the defect, so the filter is
 *     what keeps it out and not an accident of the fixture.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { LAYERS_JSON, allPackages, countPrivatePackages, leftOutLayerCheckouts } from "./isolation-gate.mjs";

const LAYER = "packages/some-layer";
const REMOTE = "https://example.invalid/some-layer.git";

type Layers = Record<string, { path: string, remote?: string }>;

/** A repository holding `packages/ordinary`, `packages/private-one` and `packages/some-layer`, with `layers` as its `layers.json`. */
function fixtureRepository(layers: Layers) {
  const repo = mkdtempSync(join(tmpdir(), "a11y-iso-layers-"));
  const manifests: Record<string, object> = {
    "packages/ordinary": { name: "@fixture/ordinary" },
    "packages/private-one": { name: "@fixture/private-one", private: true },
    [LAYER]: { name: "@fixture/some-layer", scripts: { prepack: "pnpm run build" } },
  };
  for (const [dir, manifest] of Object.entries(manifests)) {
    mkdirSync(join(repo, dir), { recursive: true });
    writeFileSync(join(repo, dir, "package.json"), JSON.stringify(manifest));
  }
  mkdirSync(dirname(join(repo, LAYERS_JSON)), { recursive: true });
  writeFileSync(join(repo, LAYERS_JSON), JSON.stringify({ layers }));
  return { repoRoot: repo };
}

/** Runs `check` against a fixture repository and removes it, whatever `check` does. */
function withFixture<T>(layers: Layers, check: (where: { repoRoot: string }) => T): T {
  const where = fixtureRepository(layers);
  try {
    return check(where);
  } finally {
    rmSync(where.repoRoot, { recursive: true, force: true });
  }
}

const names = (dirs: string[]) => dirs.map((dir) => basename(dir)).sort();

test("a declared layer's checkout is NOT packed, and an ordinary package beside it still is", () => {
  withFixture({ "some-layer": { path: LAYER, remote: REMOTE } }, (where) => {
    assert.deepEqual(names(allPackages(where)), ["ordinary"]);
  });
});

test("POSITIVE CONTROL: with no layer declared the same fixture packs the layer, so the filter is what keeps it out", () => {
  withFixture({}, (where) => assert.deepEqual(names(allPackages(where)), ["ordinary", "some-layer"]));
  // No `remote`: it lives INSIDE the core's checkout and the core does publish it, so it stays in.
  withFixture({ "some-layer": { path: LAYER } }, (where) => {
    assert.deepEqual(names(allPackages(where)), ["ordinary", "some-layer"]);
  });
});

test("the gate says what it left out, and the private count is not disturbed by the layer", () => {
  withFixture({ "some-layer": { path: LAYER, remote: REMOTE } }, (where) => {
    assert.deepEqual(leftOutLayerCheckouts(where), ["some-layer"]);
    assert.equal(countPrivatePackages(where), 1);
  });
  withFixture({}, (where) => {
    assert.deepEqual(leftOutLayerCheckouts(where), [], "nothing declared, nothing left out: the report is not a constant");
  });
});

test("a layer declared but not checked out is left out of nothing, and does not throw", () => {
  withFixture({ "some-layer": { path: LAYER, remote: REMOTE } }, (where) => {
    rmSync(join(where.repoRoot, LAYER), { recursive: true });
    assert.deepEqual(names(allPackages(where)), ["ordinary"]);
    assert.deepEqual(leftOutLayerCheckouts(where), []);
  });
});

test("an unreadable layers.json THROWS naming the file: answering `no layers` would pack them again, silently", () => {
  withFixture({}, (where) => {
    rmSync(join(where.repoRoot, LAYERS_JSON));
    assert.throws(() => allPackages(where), /cannot read .*layers\.json/);
  });
});

test("the real layers.json declares nvda-worker with a remote, so the default filter is not empty", () => {
  const real = JSON.parse(readFileSync(join(fileURLToPath(new URL("../../../", import.meta.url)), LAYERS_JSON), "utf8"));
  assert.ok(real.layers["nvda-worker"]?.remote, "POSITIVE CONTROL: the default discovery has a layer to leave out");
});
