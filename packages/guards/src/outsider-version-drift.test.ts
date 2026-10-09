/**
 * `generate.mjs --version=<v>` WRITES A JOB THAT ITS OWN DRIFT CHECK ACCEPTS (#4421, found by lab#39 / #4372).
 *
 * `--version` REPLACES the trailing comment on README's pinned `uses:` line with `# v<version>` (#4041: README's own comment names README's
 * release and would be false beside a different sha). `refuseDriftFromReadme` masked only a `# v<version>` comment, and only on the workflow's
 * side, so README's fence still carried `# the commit of the release tagged ...` and the job the generator had just written was refused.
 *
 * The mask now covers the pin line's trailing comment on BOTH sides, but only when the workflow's pin line carries a `# v<version>`. Four
 * things are pinned, two of them negative controls, because "the generated job passes" alone is also true of a check that compares nothing:
 *
 *   1. a job generated WITH `--version` from the real README passes;
 *   2. the same job with the pin line's comment changed to `# pinned by hand` is refused;
 *   3. the same job with the pin line's comment dropped is refused;
 *   4. a job generated WITHOUT `--version` still passes (README's own comment, compared as written).
 *
 * Each case first asserts the pin line it edits is the one it means to (the pin line of the real README, with the comment the case expects),
 * so a README whose pin line moves fails the case instead of passing an edit that changed nothing.
 */
import { test } from "@rstest/core";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = fileURLToPath(new URL("../../..", import.meta.url));
const { generateOutsiderJob, refuseDriftFromReadme } = await import(pathToFileURL(`${REPO}scripts/outsider/generate.mjs`).href);

const readme = readFileSync(`${REPO}README.md`, "utf8");

const RELEASE_SHA = "d92e97384b11edb7bf1cdfcf150394af46a9a2f6";
const VERSION = "1.2.3";
const PIN_LINE = new RegExp(`^(\\s*(?:- )?uses:\\s*a11ign/a11ign@${RELEASE_SHA})(.*)$`, "m");

/** The Action's pin line in a generated job, split into the part through the sha and its trailing text. */
function pinLineOf(job: string): { head: string; tail: string } {
  const match = PIN_LINE.exec(job);
  assert.ok(match, "the generated job has no pin line for the sha this test generated it with: the pin line moved");
  return { head: match[1], tail: match[2] };
}

/** The job with the pin line's trailing text replaced; the replaced text is asserted to be what the case expects, so the edit is real. */
function withPinTail(job: string, expectedTail: string, newTail: string): string {
  const { head, tail } = pinLineOf(job);
  assert.equal(tail, expectedTail, "the pin line does not end the way this case expects, so its edit would change nothing");
  return job.replace(PIN_LINE, `${head}${newTail}`);
}

const versioned = generateOutsiderJob(readme, RELEASE_SHA, VERSION);
const unversioned = generateOutsiderJob(readme, RELEASE_SHA, undefined);

test("a job generated with --version from the real README passes refuseDriftFromReadme", () => {
  assert.equal(pinLineOf(versioned).tail, ` # v${VERSION}`, "--version no longer writes the comment this test is about");
  assert.doesNotThrow(() => refuseDriftFromReadme(readme, versioned));
});

test("negative control: the same job with the pin comment changed to `# pinned by hand` is refused", () => {
  const edited = withPinTail(versioned, ` # v${VERSION}`, " # pinned by hand");
  assert.throws(() => refuseDriftFromReadme(readme, edited), /README\.md line \d+ reads/);
});

test("negative control: the same job with the pin comment dropped is refused", () => {
  const edited = withPinTail(versioned, ` # v${VERSION}`, "");
  assert.throws(() => refuseDriftFromReadme(readme, edited), /README\.md line \d+ reads/);
});

test("a job generated without --version still passes, carrying README's own comment", () => {
  assert.match(pinLineOf(unversioned).tail, /^\s+# the commit of the release tagged /, "README's pin comment is no longer what this case expects");
  assert.doesNotThrow(() => refuseDriftFromReadme(readme, unversioned));
});

test("negative control: a job generated without --version whose pin comment was edited is still refused", () => {
  const { tail } = pinLineOf(unversioned);
  assert.throws(() => refuseDriftFromReadme(readme, withPinTail(unversioned, tail, " # pinned by hand")), /README\.md line \d+ reads/);
});
