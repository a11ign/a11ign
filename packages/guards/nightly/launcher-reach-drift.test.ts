/**
 * #3758: THE STAND-IN IS A COPY OF THE LAYER'S FILE, AND THIS IS WHAT COMPARES THE COPIES.
 *
 * `scripts/test-support/launcher-reach.stand-in.cmd` carries the three `set` lines of the layer's own
 * `launcher-reach.cmd` (a11ign/screenreader-worker), because the layer's package does not publish the file
 * (#3447). `stamp-files.ts` reads the stand-in, so if the layer's file moves the stamp tests keep passing
 * against stale lines, and the stamp is what a deployed worker is compared with.
 *
 * **WHY NIGHTLY, AND WHY NO SWITCH (`ceo`, #3758).** A layer checkout on every pull request would spend a clone
 * to guard three lines, and with no sha in `layers.json` it would tie a core PR to the layer's `main`: a layer
 * change would red a PR that touched neither. This directory is outside the PR glob, so it is nightly by
 * construction; it is a named tenant of `packages/guards/nightly/tenants.ts`.
 *
 * **WHAT IT READS.** `https://raw.githubusercontent.com/a11ign/screenreader-worker/main/src/launcher-reach.cmd`,
 * unauthenticated (the layer is public; no token, no `secrets.*`). Not the contents API: that is limited to 60
 * an hour per address on a shared runner, and the raw host is not.
 *
 * **A RED HERE MEANS "THE LAYER'S FILE MOVED"**: the answer is a core row that updates the stand-in's lines, not
 * a hold on anything. A read that FAILS is a failure naming the URL and the status, never a skip.
 *
 * **THE POSITIVE CONTROL LIVES HERE**, in the tests that feed `reachDrift` strings: a stand-in with one `set`
 * line changed is refused naming both files and the line, so a pass of the live read proves something.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { declaredReach, reachFile } from "../../../scripts/test-support/stamp-files.ts";

const LAYER_REACH_URL = "https://raw.githubusercontent.com/a11ign/screenreader-worker/main/src/launcher-reach.cmd";
const LAYER_FILE = "a11ign/screenreader-worker src/launcher-reach.cmd";
const STAND_IN_FILE = "scripts/test-support/launcher-reach.stand-in.cmd";
/** The `set "NAME=value"` lines the stand-in carries; `stamp-files.ts` reads FLT, the other two are the declaration's. */
const REACH_NAMES = ["CHECKOUT_ROOT", "FLT", "CAPTURE_CHECK"];
const READ_TIMEOUT_MS = 30_000;
const HTTP_OK = 200;

/** One refusal per name on which the two declarations differ, each naming BOTH files and the line. */
function reachDrift(layer: string, standIn: string): string[] {
  return REACH_NAMES.flatMap((name) => {
    const theirs = declaredReach(layer, name);
    const ours = declaredReach(standIn, name);
    if (theirs !== undefined && theirs === ours) return [];
    return [`set "${name}=": ${LAYER_FILE} says ${JSON.stringify(theirs)}, ${STAND_IN_FILE} says ${JSON.stringify(ours)}`];
  });
}

/** The layer's file as its `main` serves it; any other answer, or none, throws naming the URL. */
async function readLayerReach(url = LAYER_REACH_URL, get: typeof fetch = fetch): Promise<string> {
  const response = await get(url, { signal: AbortSignal.timeout(READ_TIMEOUT_MS) }).catch((cause: unknown) => {
    throw new Error(`could not read ${url}`, { cause });
  });
  if (response.status !== HTTP_OK) throw new Error(`reading ${url} answered HTTP ${response.status}, not ${HTTP_OK}`);
  return response.text();
}

const standIn = () => readFileSync(reachFile(), "utf8");

test("launcher-reach-drift CONTROL: a stand-in with ONE set line changed is refused, naming both files and the line", () => {
  const layer = standIn();
  const drifted = layer.replace(/^set "FLT=.*$/m, 'set "FLT=packages\\somewhere\\else.ps1"');
  assert.notEqual(drifted, layer, "the control did not change a line, so it proves nothing");
  const refusals = reachDrift(layer, drifted);
  assert.equal(refusals.length, 1, refusals.join("\n"));
  assert.match(refusals[0], /set "FLT="/);
  assert.ok(refusals[0].includes(LAYER_FILE) && refusals[0].includes(STAND_IN_FILE), refusals[0]);
});

test("launcher-reach-drift CONTROL: a layer file that no longer declares a name is refused, not read as agreeing with itself", () => {
  const layer = standIn().replace(/^set "CAPTURE_CHECK=.*\r?\n?/m, "");
  assert.equal(declaredReach(layer, "CAPTURE_CHECK"), undefined, "the control did not remove the line");
  assert.equal(reachDrift(layer, standIn()).length, 1);
  assert.equal(reachDrift(layer, layer).length, 1, "two files that BOTH lack a line must not agree");
});

test("launcher-reach-drift CONTROL: identical declarations agree, and the stand-in declares every name (the comparison is not vacuous)", () => {
  for (const name of REACH_NAMES) assert.ok(declaredReach(standIn(), name), `the stand-in does not declare ${name}`);
  assert.deepEqual(reachDrift(standIn(), standIn()), []);
});

test("launcher-reach-drift CONTROL: a read that fails is a failure naming the URL and the status, never a skip", async () => {
  const notFound = (async () => new Response("", { status: 404 })) as typeof fetch;
  await assert.rejects(readLayerReach("https://example.invalid/x.cmd", notFound), /example\.invalid\/x\.cmd.*HTTP 404/);
  const unreachable = (async () => { throw new TypeError("fetch failed"); }) as typeof fetch;
  await assert.rejects(readLayerReach("https://example.invalid/x.cmd", unreachable), /could not read https:\/\/example\.invalid\/x\.cmd/);
});

test(`launcher-reach-drift LIVE: the layer's main (${LAYER_REACH_URL}) and the stand-in declare the same reach`, async () => {
  const layer = await readLayerReach();
  assert.deepEqual(reachDrift(layer, standIn()), []);
});
