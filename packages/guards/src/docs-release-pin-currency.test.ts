/**
 * A DOC THAT PINS AN a11ign RELEASE MORE THAN ONE MINOR BEHIND THE NEWEST TAG FAILS (#4508, chairman direction on #2568, class
 * `release-docs-drift`): the NAMED CASES, run on fixtures through the injected reader. The logic and the pin-versus-history rule are in
 * `docs-release-pin-currency.ts`.
 *
 * The case on the real checkout is in `docs-release-pin-currency.real-tree.test.ts`, deliberately another file: the acceptance job's
 * checkout holds no `a11ign@<x.y.z>` tag (they are not reachable from `main`, so `History: full` never fetches them), and the `ts` job's
 * does. Here no tag is needed.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { GUARDED_DOC, pinFaults, type ReleaseTag, type Reader } from "./docs-release-pin-currency.ts";

// ── fixtures: a tag list and a doc, through the same reader the real test uses ─────────────────────────────────────────────────────────

/** A full commit SHA length: the Action pin is only valid as one. */
const SHA_LENGTH = 40;
const sha = (digit: string) => digit.repeat(SHA_LENGTH);
const FIXTURE_TAGS: ReleaseTag[] = [
  { name: "a11ign@0.3.0", commit: sha("3") },
  { name: "a11ign@0.4.0", commit: sha("4") },
  { name: "a11ign@0.5.4", commit: sha("5") },
  { name: "a11ign@0.6.0-rc.1", commit: sha("6") },
];
const fixture = (text: string, tags: ReleaseTag[] = FIXTURE_TAGS): Reader => ({ tags: () => tags, docs: () => [{ path: "docs/guide.md", text }] });
const usesLine = (commit: string, comment = "") => `      - uses: a11ign/a11ign@${commit}   ${comment}`.trimEnd();

test("a pin two minors behind the newest tag fails, naming file, line, the pinned release and the newest", () => {
  const verdict = pinFaults(fixture(["# Guide", "", usesLine(sha("3"), "# the commit of the release tagged a11ign@0.3.0")].join("\n")));
  assert.equal(verdict.status, "stale");
  assert.equal(verdict.faults.length, 1);
  assert.match(verdict.faults[0], /^docs\/guide\.md:3 pins release 0\.3\.0 /);
  assert.match(verdict.faults[0], /the newest tag is a11ign@0\.5\.4/);
});

test("a pin one minor behind the newest tag passes", () => {
  const verdict = pinFaults(fixture(usesLine(sha("4"))));
  assert.deepEqual(verdict.faults, []);
  assert.equal(verdict.pins.length, 1, "the positive control: the pin was found, so the empty fault list is a reading");
  assert.equal(verdict.status, "ok");
});

test("a pin on the newest tag passes", () => {
  assert.equal(pinFaults(fixture(usesLine(sha("5")))).status, "ok");
});

test("a checkout with no a11ign@ release tag says CANNOT TELL, names the remedy, and does not pass", () => {
  const verdict = pinFaults(fixture(usesLine(sha("3")), [{ name: "a11ign@0.6.0-rc.1", commit: sha("6") }]));
  assert.equal(verdict.status, "cannot-tell");
  assert.match(verdict.faults[0], /^CANNOT TELL /);
  assert.match(verdict.faults[0], /History: full/);
  assert.match(verdict.faults[0], /fetch --tags/);
});

test("a history mention of an old release, not in a `uses:` line or an install command, is not a pin", () => {
  const history = [
    "`a11ign@0.1.0` depends on `@a11ign/evidence` 0.1.0, so the registry is the artifact mirror.",
    "the published `a11ign@0.3.0` (before `documents` was a dependency) timed 520 ms",
    "| reference: the published a11ign@0.1.0 | 520 |",
  ].join("\n");
  const verdict = pinFaults(fixture(`${history}\n${usesLine(sha("5"))}`));
  assert.equal(verdict.pins.length, 1, "only the `uses:` line is a pin");
  assert.deepEqual(verdict.faults, []);
});

test("the version in a `uses:` line's comment is a label, not a second pin: the SHA decides", () => {
  const verdict = pinFaults(fixture(usesLine(sha("5"), "# the commit of the release tagged a11ign@0.1.0")));
  assert.equal(verdict.pins.length, 1);
  assert.deepEqual(verdict.faults, []);
});

test("an install command pinning an old version is a pin and fails; a scoped package of the same version is not", () => {
  const stale = pinFaults(fixture("```\nnpx a11ign@0.3.0 audit https://example.com\n```"));
  assert.equal(stale.status, "stale");
  assert.match(stale.faults[0], /^docs\/guide\.md:2 pins release 0\.3\.0 \(a11ign@0\.3\.0\)/);
  const scoped = pinFaults(fixture("npm i @a11ign/evidence@0.1.0\nnpx a11ign@0.5.4 audit"));
  assert.equal(scoped.pins.length, 1);
  assert.equal(scoped.status, "ok");
});

test("a `uses:` SHA that no release tag points at fails: its age cannot be told", () => {
  const verdict = pinFaults(fixture(usesLine(sha("9"))));
  assert.equal(verdict.status, "stale");
  assert.match(verdict.faults[0], /no `a11ign@<x\.y\.z>` tag points at/);
});

test("a whole major behind is past any allowance", () => {
  const tags = [{ name: "a11ign@1.0.0", commit: sha("1") }, { name: "a11ign@0.9.0", commit: sha("a") }];
  assert.equal(pinFaults(fixture(usesLine(sha("a")), tags)).status, "stale");
});

test("the guard is pointed at the right docs: README, docs/*.md and docs/adr/*.md, and nothing deeper", () => {
  for (const path of ["README.md", "docs/try-it.md", "docs/adr/0040-x.md"]) assert.ok(GUARDED_DOC.test(path), path);
  for (const path of ["docs/nested/deep.md", "packages/cli/README.md", "docs/img.png"]) assert.ok(!GUARDED_DOC.test(path), path);
});
