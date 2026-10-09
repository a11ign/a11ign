// no-token: gh -- builds throwaway directories; no `gh` or network is reached
/**
 * #4404: `verify` finds the tool's suite-slot module whichever spelling the checkout holds (`.mjs` or `.ts`), after agent-org renamed it.
 * POSITIVE CONTROLS: the two holding cases each find the file; the empty directory is the refusal, so "found nothing" is not the only outcome.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { suiteSlotsFile } from "../../../scripts/verify.ts";

function inCheckout(files: string[], body: (dir: string) => void) {
  const dir = mkdtempSync(join(tmpdir(), "suite-slots-file-"));
  try {
    mkdirSync(join(dir, "src"));
    for (const file of files) writeFileSync(join(dir, file), "export {};\n");
    body(dir);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

for (const held of ["src/suite-slots.mjs", "src/suite-slots.ts"]) {
  test(`a checkout holding ${held} is found`, () => inCheckout([held], (dir) => assert.equal(suiteSlotsFile(dir), join(dir, held))));
}

test("a checkout holding neither is not found", () => inCheckout([], (dir) => assert.equal(suiteSlotsFile(dir), undefined)));
