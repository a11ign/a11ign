/**
 * A DOC THAT PINS AN a11ign RELEASE MORE THAN ONE MINOR BEHIND THE RELEASE `v0` POINTS AT FAILS (#4508, chairman direction on #2568, class
 * `release-docs-drift`): the NAMED CASES, run on fixtures through the injected reader. The logic and the pin-versus-history rule are in
 * `docs-release-pin-currency.ts`.
 *
 * The case on the real checkout is in `docs-release-pin-currency.real-tree.test.ts`, deliberately another file: the acceptance job's
 * checkout holds no `a11ign@<x.y.z>` tag (they are not reachable from `main`, so `History: full` never fetches them), and the `ts` job's
 * does. Here no tag is needed.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { GUARDED_DOC, pinFaults, planRepin, repoReader, type ReleaseTag, type Reader } from "./docs-release-pin-currency.ts";

// ── fixtures: a tag list, a v0 commit and a doc, through the same reader the real test uses ─────────────────────────────────────────────

/** A full commit SHA length: the Action pin is only valid as one. */
const SHA_LENGTH = 40;
const sha = (digit: string) => digit.repeat(SHA_LENGTH);
const FIXTURE_TAGS: ReleaseTag[] = [
  { name: "a11ign@0.3.0", commit: sha("3") },
  { name: "a11ign@0.4.0", commit: sha("4") },
  { name: "a11ign@0.5.4", commit: sha("5") },
  { name: "a11ign@0.6.0-rc.1", commit: sha("6") },
];
/** `v0` on the 0.5.4 release, which is the newest stable tag of FIXTURE_TAGS unless a case says otherwise. */
const FIXTURE_V0 = sha("5");
const fixture = (text: string, tags: ReleaseTag[] = FIXTURE_TAGS, v0 = FIXTURE_V0): Reader => ({
  tags: () => tags,
  v0Commit: () => v0,
  docs: () => [{ path: "docs/guide.md", text }],
});
const usesLine = (commit: string, comment = "") => `      - uses: a11ign/a11ign@${commit}   ${comment}`.trimEnd();

test("a pin two minors behind v0's release fails, naming file, line, the pinned release and v0's release", () => {
  const verdict = pinFaults(fixture(["# Guide", "", usesLine(sha("3"), "# the commit of the release tagged a11ign@0.3.0")].join("\n")));
  assert.equal(verdict.status, "stale");
  assert.equal(verdict.faults.length, 1);
  assert.match(verdict.faults[0], /^docs\/guide\.md:3 pins release 0\.3\.0 /);
  assert.match(verdict.faults[0], /v0 points at a11ign@0\.5\.4/);
});

test("a pin one minor behind v0's release passes", () => {
  const verdict = pinFaults(fixture(usesLine(sha("4"))));
  assert.deepEqual(verdict.faults, []);
  assert.equal(verdict.pins.length, 1, "the positive control: the pin was found, so the empty fault list is a reading");
  assert.equal(verdict.status, "ok");
});

test("a pin on v0's release passes", () => {
  assert.equal(pinFaults(fixture(usesLine(sha("5")))).status, "ok");
});

test("a pin on v0's release passes while a tag two minors ahead is unpromoted (the 2026-10-11 case)", () => {
  // FIXTURE_TAGS' newest stable tag is 0.5.4; v0 still names 0.3.0, so the pin is on the qualified release and the newer tag is not drift.
  const verdict = pinFaults(fixture(usesLine(sha("3")), FIXTURE_TAGS, sha("3")));
  assert.equal(verdict.v0Release, "0.3.0");
  assert.equal(verdict.pins.length, 1, "the positive control: the pin was found");
  assert.equal(verdict.status, "ok");
});

test("a pin newer than v0 is not a fault", () => {
  assert.equal(pinFaults(fixture(usesLine(sha("5")), FIXTURE_TAGS, sha("3"))).status, "ok");
});

test("a checkout with no a11ign@ release tag says CANNOT TELL, names the remedy, and does not pass", () => {
  const verdict = pinFaults(fixture(usesLine(sha("3")), [{ name: "a11ign@0.6.0-rc.1", commit: sha("6") }]));
  assert.equal(verdict.status, "cannot-tell");
  assert.match(verdict.faults[0], /^CANNOT TELL /);
  assert.match(verdict.faults[0], /History: full/);
  assert.match(verdict.faults[0], /fetch --tags/);
});

test("v0 absent from the checkout says CANNOT TELL, names the remedy, and does not pass", () => {
  const verdict = pinFaults({ ...fixture(usesLine(sha("3"))), v0Commit: () => undefined });
  assert.equal(verdict.status, "cannot-tell");
  assert.equal(verdict.v0Release, undefined);
  assert.match(verdict.faults[0], /^CANNOT TELL /);
  assert.match(verdict.faults[0], /`v0` tag is missing/);
  assert.match(verdict.faults[0], /fetch --tags --force/);
});

test("v0 at a commit no a11ign@<x.y.z> tag names says CANNOT TELL, for an untagged commit and for a prerelease alike", () => {
  const untagged = pinFaults(fixture(usesLine(sha("3")), FIXTURE_TAGS, sha("9")));
  assert.equal(untagged.status, "cannot-tell");
  assert.match(untagged.faults[0], /names no `a11ign@<x\.y\.z>` release/);
  const prerelease = pinFaults(fixture(usesLine(sha("3")), FIXTURE_TAGS, sha("6")));
  assert.equal(prerelease.status, "cannot-tell", "the 0.6.0-rc.1 tag is a prerelease, not a qualified release");
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

test("a whole major behind v0 is past any allowance", () => {
  const tags = [{ name: "a11ign@1.0.0", commit: sha("1") }, { name: "a11ign@0.9.0", commit: sha("a") }];
  assert.equal(pinFaults(fixture(usesLine(sha("a")), tags, sha("1"))).status, "stale");
});

test("the guard is pointed at the right docs: README, docs/*.md and docs/adr/*.md, and nothing deeper", () => {
  for (const path of ["README.md", "docs/try-it.md", "docs/adr/0040-x.md"]) assert.ok(GUARDED_DOC.test(path), path);
  for (const path of ["docs/nested/deep.md", "packages/cli/README.md", "docs/img.png"]) assert.ok(!GUARDED_DOC.test(path), path);
});

// ── the re-pin (#5224): `planRepin` moves what the guard reads, and says by name what it cannot ─────────────────────────────────────────

const docsReader = (docs: Array<{ path: string; text: string }>, tags: ReleaseTag[] = FIXTURE_TAGS, v0 = FIXTURE_V0): Reader => ({
  tags: () => tags,
  v0Commit: () => v0,
  docs: () => docs,
});

test("docs pinning the release before are rewritten to the promoted release and commit, label included", () => {
  const plan = planRepin(fixture(["# Guide", usesLine(sha("4"), "# the commit of the release tagged a11ign@0.4.0")].join("\n")));
  assert.equal(plan.status, "rewrite");
  assert.deepEqual(plan.promoted, { version: "0.5.4", commit: sha("5") });
  assert.deepEqual(plan.faults, []);
  assert.equal(plan.files.length, 1);
  assert.equal(plan.files[0].path, "docs/guide.md");
  assert.equal(plan.files[0].text, ["# Guide", usesLine(sha("5"), "# the commit of the release tagged a11ign@0.5.4")].join("\n"));
});

test("the rewrite closes the loop: the guard reads its output as ok, and a second plan has nothing to move", () => {
  const stale = [usesLine(sha("3"), "# the commit of the release tagged a11ign@0.3.0"), "npx a11ign@0.4.0 audit https://example.com"].join("\n");
  const first = planRepin(fixture(stale));
  assert.equal(first.status, "rewrite");
  const rewritten = first.files.map((file) => ({ path: file.path, text: file.text }));
  const verdict = pinFaults(docsReader(rewritten));
  assert.equal(verdict.pins.length, 2, "the positive control: both pins were found, so ok is a reading");
  assert.equal(verdict.status, "ok");
  assert.deepEqual(verdict.pins.map((pin) => pin.version), ["0.5.4", "0.5.4"]);
  const second = planRepin(docsReader(rewritten));
  assert.equal(second.status, "current");
  assert.deepEqual(second.files, []);
});

test("only the pin's own commit and its own version label move: history, other releases and the rest of the line stay", () => {
  const line = `${usesLine(sha("3"))}   # a full commit SHA: the commit of release a11ign@0.3.0; v0.1.0 predates the login flow (not a11ign@0.3.10)`;
  const history = "the published `a11ign@0.3.0` timed 520 ms, and `@a11ign/evidence@0.3.0` is a package";
  const plan = planRepin(fixture([history, line].join("\n")));
  assert.equal(plan.status, "rewrite");
  const [kept, moved] = plan.files[0].text.split("\n");
  assert.equal(kept, history, "a history line is not a pin and is not touched");
  assert.equal(
    moved,
    `${usesLine(sha("5"))}   # a full commit SHA: the commit of release a11ign@0.5.4; v0.1.0 predates the login flow (not a11ign@0.3.10)`,
  );
});

test("an install-command pin is moved to the promoted version, and a scoped package of the same version is not", () => {
  const plan = planRepin(fixture("npx a11ign@0.3.0 audit https://example.com\nnpm i @a11ign/evidence@0.3.0"));
  assert.equal(plan.status, "rewrite");
  assert.equal(plan.files[0].text, "npx a11ign@0.5.4 audit https://example.com\nnpm i @a11ign/evidence@0.3.0");
});

test("a pin already on the promoted release, or newer than it, moves nothing and is not a fault", () => {
  const onIt = planRepin(fixture(usesLine(sha("5"))));
  assert.equal(onIt.status, "current");
  assert.deepEqual(onIt.files, []);
  const newer = planRepin(fixture(usesLine(sha("5")), FIXTURE_TAGS, sha("3")));
  assert.equal(newer.status, "current", "v0 still names 0.3.0 and the doc is ahead of it: the re-pin never moves a doc backwards");
  assert.deepEqual(newer.faults, []);
});

test("a pin the rewrite cannot match is a named failure, and it holds back the pins that could have moved", () => {
  const plan = planRepin(fixture(["# Guide", usesLine(sha("3")), usesLine(sha("9"), "# a commit no tag names")].join("\n")));
  assert.equal(plan.status, "refused");
  assert.deepEqual(plan.files, [], "all or nothing: a half-moved set is not written");
  assert.equal(plan.faults.length, 1);
  assert.match(plan.faults[0], /^docs\/guide\.md:3 pins commit 9{40}, which no `a11ign@<x\.y\.z>` tag points at/);
  assert.match(plan.faults[0], /moved nothing/);
});

test("a prerelease tag's commit is no release: the rewrite names it rather than guess", () => {
  const plan = planRepin(fixture(usesLine(sha("6"))));
  assert.equal(plan.status, "refused");
  assert.match(plan.faults[0], /^docs\/guide\.md:1 pins commit 6{40}/);
});

test("no tags and no v0 are refusals that say CANNOT TELL, never `current`", () => {
  const noTags = planRepin(fixture(usesLine(sha("3")), []));
  assert.equal(noTags.status, "refused");
  assert.match(noTags.faults[0], /^CANNOT TELL /);
  const noV0 = planRepin({ ...fixture(usesLine(sha("3"))), v0Commit: () => undefined });
  assert.equal(noV0.status, "refused");
  assert.equal(noV0.promoted, undefined);
  assert.match(noV0.faults[0], /`v0` tag is missing/);
});

test("a path outside the guarded docs is never rewritten, whatever it pins", () => {
  const stale = usesLine(sha("3"));
  const plan = planRepin(docsReader([
    { path: "docs/nested/deep.md", text: stale },
    { path: "packages/cli/README.md", text: stale },
    { path: "docs/guide.md", text: stale },
  ]));
  assert.deepEqual(plan.files.map((file) => file.path), ["docs/guide.md"]);
});

test("repoReader reads tags (annotated tags peeled), v0 and the guarded tracked docs through git, and an absent v0 is undefined", () => {
  const rows = `a11ign@0.3.0 ${"a".repeat(SHA_LENGTH)} ${sha("3")}\na11ign@0.4.0 ${sha("4")} \n`;
  const answers: Record<string, string> = {
    "for-each-ref refs/tags/a11ign@*": rows,
    "for-each-ref refs/tags/v0": `${"b".repeat(SHA_LENGTH)} ${sha("4")}\n`,
    "ls-files": "README.md\ndocs/guide.md\ndocs/nested/deep.md\nsrc/index.ts\n",
  };
  const git = (args: string[]) => answers[args.slice(0, 2).join(" ")] ?? answers[args[0]] ?? "";
  const reader = repoReader(git, (path) => `text of ${path}`);
  assert.deepEqual(reader.tags(), [{ name: "a11ign@0.3.0", commit: sha("3") }, { name: "a11ign@0.4.0", commit: sha("4") }]);
  assert.equal(reader.v0Commit(), sha("4"));
  assert.deepEqual(reader.docs(), [{ path: "README.md", text: "text of README.md" }, { path: "docs/guide.md", text: "text of docs/guide.md" }]);
  assert.equal(repoReader(() => "", () => "").v0Commit(), undefined);
});
