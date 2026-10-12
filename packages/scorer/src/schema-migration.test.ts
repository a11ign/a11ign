/**
 * The declaration must be capable of REFUSING, or it is a skip with a nicer name.
 *
 * This exists because the thing it replaces — `A11Y_SKIP_VERIFY=1` — was routinely used and disabled every
 * other check in the pre-push hook as a side effect. Swapping one silent bypass for another would be no gain,
 * so the two failure modes that matter are pinned here: an OPEN migration must block release, and a verdict
 * function that cannot say no must not pass for one.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { migrationVerdict, MIGRATION_FILE } from "../../../scripts/check-schema-migration.ts";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));

test("no declaration means nothing is blocking release", () => {
  const verdict = migrationVerdict(null);
  assert.equal(verdict.ok, true);
});

test("an open migration BLOCKS, and names both schemas so the reader can act", () => {
  const verdict = migrationVerdict({
    pendingSchema: "screenreader-structured-v99",
    shippedSchema: "screenreader-structured-v98",
    openedAt: "2026-01-01",
    why: "a reason",
  });
  assert.equal(verdict.ok, false, "an open migration that does not block is decoration");
  assert.match(verdict.message, /screenreader-structured-v98 -> screenreader-structured-v99/,
    "the message must name both schemas, so the reader knows what must change");
  assert.match(verdict.message, /a reason/, "the declared reason must reach the person who is blocked");
});

test("the declaration in this tree, if present, is one the release gate can evaluate", () => {
  // Not "is it open" — that is a normal branch state. Whether it is WELL FORMED, because a malformed one
  // would throw inside the gate and a thrown gate reads as a broken tool rather than a refusal.
  const path = new URL("../models/schema-migration.json", import.meta.url);
  if (!existsSync(path)) return;
  const declaration = JSON.parse(readFileSync(path, "utf8"));
  for (const field of ["pendingSchema", "shippedSchema", "openedAt", "why"]) {
    assert.ok(String(declaration[field] ?? "").trim(), `${MIGRATION_FILE} is missing \`${field}\``);
  }
  assert.notEqual(declaration.pendingSchema, declaration.shippedSchema,
    "a migration from a version to itself is not a migration");
  assert.ok(repoRoot.length > 0);
});

test("EVALUATING a candidate is allowed while a migration is open; RELEASING is not", () => {
  // The circularity this closes, which I built and then hit: an open migration blocks `release:gate`, and
  // the migration closes only AT promotion — so the gate that would qualify a promotion refused to run
  // because the promotion had not happened. Nothing could be promoted through the front door, which is why
  // nothing had been.
  //
  // Same shape as `score.py`'s eligibility guard: a fresh candidate is ineligible BECAUSE its gates have
  // not run, and the guard then refuses the very run that would qualify it. Same fix, same word.
  const scripts = JSON.parse(readFileSync(
    fileURLToPath(new URL("../../../package.json", import.meta.url)), "utf8")).scripts;

  assert.match(scripts["release:gate"], /scorer:migration(?! -- --evaluating)/,
    "release:gate must run the migration check in its BLOCKING mode, or a half-migrated tree can ship");
  assert.match(scripts["candidate:gate"], /scorer:migration -- --evaluating/,
    "candidate:gate must pass --evaluating, or qualifying a candidate is impossible while a migration is open");
  assert.ok(!scripts["candidate:gate"].includes("eval:gate"),
    "candidate:gate must not chain the judge-quality gate: it needs the venv and a fixture corpus, and a "
    + "gate that cannot run is one nobody runs");
});

test("a chain that cannot run a stage names it and refuses, rather than leaving it out; the core has no promotion script", () => {
  // ADR 0045 cut 9 (#5087): `promote:model` and the lab-held gates left this package.json with the lab's scripts, and the chains that called them dangled
  // (`ERR_PNPM_NO_SCRIPT` at the first missing stage). A chain that DROPPED them would be a gate that passes without them: so each ends in `gate:lab-held`,
  // which exits 1 naming them. Promotion itself is the lab's, so `promote:gated` has nothing left to gate; "testing the code and the weights TOGETHER" (ADR 0007)
  // is the lab's chain to hold, and a root script naming `promote:model` here would be the dangling call again.
  const scripts = JSON.parse(readFileSync(
    fileURLToPath(new URL("../../../package.json", import.meta.url)), "utf8")).scripts;
  for (const chain of ["release:gate:ci", "release:gate", "candidate:gate"]) {
    assert.match(scripts[chain], /run gate:lab-held -- \S/, `${chain} must end in the stage that refuses what this repository cannot run`);
  }
  assert.equal(scripts["promote:gated"], undefined, "promote:gated would have to name promote:model, which is the lab's");
  assert.equal(scripts["promote:model"], undefined, "promote:model is the lab's script");
});
