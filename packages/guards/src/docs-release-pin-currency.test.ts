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
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { GUARDED_DOC, pinFaults, planRepin, repoReader, type Doc, type Promoted, type ReleaseTag, type Reader } from "./docs-release-pin-currency.ts";

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

// ── the restating sentences (#5468): a re-pin moves the sentences it can match and names the ones it cannot; the guard fails on the rest ──

/**
 * A doc whose pin sits on `pin` and whose prose beside it still says `from`: the seven sentences of #5468 (the docs on `main` carry all of
 * them). Lines 2-4 are the three movable wordings, lines 5-7 are the restatements the writer names and never moves, and line 8 is history.
 */
const restatingLines = (pin: string, from: string): string[] => [
  "# Guide",
  usesLine(sha(pin), `# Pinned to the full 40-character commit of release ${from}, so your CI keeps it`),
  `(\`a11ign@${from}\` is the tag the pin above names)`,
  `This pins release \`${from}\` in the Action.`,
  `The commit of release ${from}, the one its tag names, is pinned.`,
  `\`${from}\` does the scan.`,
  `On 2026-10-13 \`npm view a11ign dist-tags\` read \`latest\` \`${from}\`.`,
  "Changed since 0.3.0.",
];
const restatingDoc = (pin: string, from: string) => restatingLines(pin, from).join("\n");

test("a re-pin rewrites the three movable restatements beside the pin, and names by file and line the three it cannot move", () => {
  const plan = planRepin(fixture(restatingDoc("4", "0.4.0")));
  assert.equal(plan.status, "rewrite");
  assert.deepEqual(plan.faults, []);
  assert.deepEqual(plan.unmoved, ["docs/guide.md:5", "docs/guide.md:6", "docs/guide.md:7"], "the three the writer will not guess at, named and left as written");
  const [, pinLine, tagLine, pinsLine, otherWording, doesLine, datedLine, history] = plan.files[0].text.split("\n");
  assert.match(pinLine, /commit of release 0\.5\.4, so your CI keeps it$/);
  assert.equal(tagLine, "(`a11ign@0.5.4` is the tag the pin above names)");
  assert.equal(pinsLine, "This pins release `0.5.4` in the Action.");
  assert.equal(otherWording, "The commit of release 0.4.0, the one its tag names, is pinned.", "another wording of the same claim is named, not moved");
  assert.equal(doesLine, "`0.4.0` does the scan.", "a behavioural claim is true of 0.4.0 and is not rewritten");
  assert.equal(datedLine, "On 2026-10-13 `npm view a11ign dist-tags` read `latest` `0.4.0`.", "a dated read of the registry is true of 0.4.0 and is not rewritten");
  assert.equal(history, "Changed since 0.3.0.");
});

test("the guard names every restatement the writer left, by file and line, and reads the same prose as faults when the pin alone moved", () => {
  const plan = planRepin(fixture(restatingDoc("4", "0.4.0")));
  const verdict = pinFaults(docsReader(plan.files.map((file) => ({ path: file.path, text: file.text }))));
  assert.equal(verdict.pins.length, 1, "the positive control: the pin was found, so the faults are a reading");
  assert.equal(verdict.status, "stale");
  assert.deepEqual(verdict.faults.map((fault) => fault.split(" ")[0]), ["docs/guide.md:5", "docs/guide.md:6", "docs/guide.md:7"]);
  assert.match(verdict.faults[2], /^docs\/guide\.md:7 names release 0\.4\.0 in a sentence that restates the pin, but the pin is on a11ign@0\.5\.4$/);
  // The pin moved, the prose did not: the same fixture the writer had, with every restatement left alone.
  const bare = pinFaults(fixture(restatingDoc("5", "0.4.0")));
  assert.equal(bare.status, "stale");
  assert.deepEqual(bare.faults.map((fault) => fault.split(" ")[0]), ["docs/guide.md:2", "docs/guide.md:3", "docs/guide.md:4", "docs/guide.md:5", "docs/guide.md:6", "docs/guide.md:7"]);
});

test("a dated read of `latest` wrapped across a comment line is one restatement: the guard names its line, and the writer names it too", () => {
  const wrapped = [
    usesLine(sha("4"), "# the commit of the release tagged a11ign@0.4.0"),
    "        # On 2026-10-13 `npm view a11ign dist-tags` read `latest`",
    "        # `0.4.0` on that day, so CI reads the same tag.",
  ].join("\n");
  const plan = planRepin(fixture(wrapped));
  assert.equal(plan.status, "rewrite");
  assert.deepEqual(plan.unmoved, ["docs/guide.md:3"], "the version is on line 3: the wrap is read, and the line that carries the version is named");
  const verdict = pinFaults(fixture(usesLine(sha("5"), "# the commit of the release tagged a11ign@0.5.4") + "\n" + wrapped.split("\n").slice(1).join("\n")));
  assert.equal(verdict.pins.length, 1, "the positive control: the pin was found");
  assert.match(verdict.faults.join("\n"), /^docs\/guide\.md:3 names release 0\.4\.0 in a sentence that restates the pin/m);
});

test("history is not a fault: a changelog and a `since` sentence beside a current pin stay, and a re-pin leaves them as written", () => {
  const history = ["Changed since 0.3.0.", "- 0.4.0: first public release", "The `a11ign@0.3.0` label is history.",
    // #5474's second verdict: a `latest` label named beside a release, with no dated read of the registry, is history too.
    "The `latest` `0.4.0` label is historical.", "Read `latest` `0.4.0` in the old changelog."].join("\n");
  const text = `${history}\n${usesLine(sha("5"))}`;
  const verdict = pinFaults(fixture(text));
  assert.equal(verdict.pins.length, 1, "the positive control: the current pin was found");
  assert.equal(verdict.status, "ok", "history naming older releases is not a restatement of the pin");
  const plan = planRepin(fixture(text));
  assert.equal(plan.status, "current");
  assert.deepEqual(plan.unmoved, []);
  // The same history beside a pin that does move: the pin moves, the history is not touched.
  const moving = planRepin(fixture(`${history}\n${usesLine(sha("4"))}`));
  assert.equal(moving.status, "rewrite");
  assert.deepEqual(moving.unmoved, []);
  const historyLines = history.split("\n").length;
  assert.equal(moving.files[0].text.split("\n").slice(0, historyLines).join("\n"), history);
});

// ── the re-pin of the real docs, and the writer's shape check over it (#5553) ──────────────────────────────────────────────────────────

/** The sentence after a pin, `The release is tagged \`a11ign@X\` and the commit is the one the tag names`, moves with the pin: the writer refused it. */
test("a sentence that says the pin's tag and commit moves with the re-pin, so the guard reads no old release in it (#5553)", () => {
  const text = ["# Guide", "", usesLine(sha("3"), "# the commit of the release tagged a11ign@0.3.0"), "", "> The release is tagged `a11ign@0.3.0` and the commit is the one the tag names; a note."].join("\n");
  const plan = planRepin(fixture(text));
  assert.equal(plan.status, "rewrite", "the positive control: the pin is two minors behind v0, so the doc is rewritten");
  assert.match(plan.files[0].text, /^> The release is tagged `a11ign@0\.5\.4` and the commit is the one the tag names; a note\.$/m);
  assert.deepEqual(pinFaults(fixture(plan.files[0].text)).faults, []);
});

const REPO = fileURLToPath(new URL("../../..", import.meta.url));
const markdownIn = (dir: string): string[] => readdirSync(join(REPO, dir)).filter((name) => name.endsWith(".md")).map((name) => `${dir}/${name}`);
/** The guarded docs of this checkout, read from disk: the population `repoReader` hands the guard. */
const realDocs = (): Doc[] =>
  ["README.md", ...markdownIn("docs"), ...markdownIn("docs/adr")]
    .filter((path) => GUARDED_DOC.test(path))
    .map((path) => ({ path, text: readFileSync(join(REPO, path), "utf8") }));
/** Every `uses:` pin of a doc with the release its comment names, so the one pin the re-pin moves is read off the docs themselves. */
const PIN_IN_DOCS = /uses:\s*a11ign\/a11ign@([0-9a-f]{40})\b[^\n]*?a11ign@(\d+\.\d+\.\d+)/g;
const nextPatch = (version: string): string => {
  const [major, minor, patch] = version.split(".").map(Number);
  return `${major}.${minor}.${patch + 1}`;
};

interface ChangedLine {
  /** `path:line`, one-based, the way the guard names lines. */
  where: string;
  text: string;
}
/** The lines a re-pin changed in one doc. The planner moves text within lines, so the line counts are the same and the index lines up. */
const changedLines = (path: string, before: string, after: string): ChangedLine[] => {
  const was = before.split("\n");
  return after.split("\n").flatMap((text, index) => (text === was[index] ? [] : [{ where: `${path}:${index + 1}`, text }]));
};
/** Why the writer's shape check (`docs-pin-write.yml`) refuses a changed line, or `undefined` when it accepts it: an action pin must name the promoted commit, any other line the promoted release. */
const refusalOf = ({ where, text }: ChangedLine, promoted: Promoted): string | undefined => {
  const pin = /uses:\s*a11ign\/a11ign@([0-9a-f]{40})/.exec(text);
  if (pin) return pin[1] === promoted.commit ? undefined : `${where} pins ${pin[1]}, not the promoted commit`;
  const names = text.includes(`a11ign@${promoted.version}`) || text.includes(`commit of release ${promoted.version}`);
  return names ? undefined : `${where} is neither an action pin nor names a11ign@${promoted.version}: ${text}`;
};

test("the writer's shape check refuses a changed line that names another release, and accepts a pin of the promoted commit and a line naming the promoted release", () => {
  const promoted: Promoted = { version: "0.10.8", commit: sha("b") };
  const at = (text: string): ChangedLine => ({ where: "docs/x.md:3", text });
  assert.match(refusalOf(at("x `a11ign@0.10.3` beside a re-pin"), promoted) ?? "", /docs\/x\.md:3 is neither/);
  assert.match(refusalOf(at(usesLine(sha("3"))), promoted) ?? "", /pins .* not the promoted commit/);
  assert.equal(refusalOf(at("The release is tagged `a11ign@0.10.8` and the commit is the one the tag names"), promoted), undefined);
  assert.equal(refusalOf(at(usesLine(sha("b"))), promoted), undefined);
});

test("the re-pin of the real docs moves the sentence at docs/github-action.md:49, and every changed line passes the writer's shape check (#5553)", () => {
  const docs = realDocs();
  const pins = new Set(docs.flatMap((doc) => [...doc.text.matchAll(PIN_IN_DOCS)].map((match) => `${match[1]} ${match[2]}`)));
  assert.equal(pins.size, 1, `the positive control: the real docs carry one pin, found ${[...pins].join(", ") || "none"}`);
  const [pinSha, pinVersion] = [...pins][0].split(" ");
  const promoted: Promoted = { version: nextPatch(pinVersion), commit: sha("b") };
  const tags: ReleaseTag[] = [{ name: `a11ign@${pinVersion}`, commit: pinSha }, { name: `a11ign@${promoted.version}`, commit: promoted.commit }];
  const readerOf = (moved: Doc[]): Reader => ({ tags: () => tags, v0Commit: () => promoted.commit, docs: () => moved });

  const plan = planRepin(readerOf(docs));
  assert.equal(plan.status, "rewrite", plan.faults.join("\n"));
  assert.deepEqual(plan.promoted, promoted);
  assert.ok(plan.files.some((file) => file.path === "docs/github-action.md"), "the positive control: the doc with line 49 is among the changed files");

  // Line 49 is the sentence the writer refused: at origin/main the planner leaves it naming the old release and lists it as unmoved.
  assert.ok(!plan.unmoved.includes("docs/github-action.md:49"), "docs/github-action.md:49 is still unmoved: its sentence still names the old release");

  const before = new Map(docs.map((doc) => [doc.path, doc.text]));
  const changed = plan.files.flatMap((file) => {
    const was = before.get(file.path) ?? "";
    assert.equal(file.text.split("\n").length, was.split("\n").length, `${file.path}: the re-pin added or removed a line`);
    return changedLines(file.path, was, file.text);
  });
  assert.ok(changed.some((line) => line.where === "docs/github-action.md:49"), "docs/github-action.md:49 is not among the changed lines");
  assert.deepEqual(changed.map((line) => refusalOf(line, promoted)).filter((refusal) => refusal !== undefined), []);
});

test("a re-pin of the real docs to a later release leaves no sentence naming the old release, so the next re-pin's guard passes without a hand edit (#5567)", () => {
  const docs = realDocs();
  const pins = new Set(docs.flatMap((doc) => [...doc.text.matchAll(PIN_IN_DOCS)].map((match) => `${match[1]} ${match[2]}`)));
  assert.equal(pins.size, 1, `the positive control: the real docs carry one pin, found ${[...pins].join(", ") || "none"}`);
  const [pinSha, pinVersion] = [...pins][0].split(" ");
  const promoted: Promoted = { version: nextPatch(pinVersion), commit: sha("c") };
  const tags: ReleaseTag[] = [{ name: `a11ign@${pinVersion}`, commit: pinSha }, { name: `a11ign@${promoted.version}`, commit: promoted.commit }];
  const readerOf = (moved: Doc[]): Reader => ({ tags: () => tags, v0Commit: () => promoted.commit, docs: () => moved });

  const plan = planRepin(readerOf(docs));
  assert.equal(plan.status, "rewrite", plan.faults.join("\n"));
  // The planner moves only the wordings it knows. A dated read or a behavioural sentence it cannot move is named here, and a
  // re-pin that merges with one of these leaves the guard red on the next release (the #5567 defect: the old release's commit left behind).
  assert.deepEqual(plan.unmoved, [], "these sentences still name the old release and the planner cannot move them: reword them so they name no release");

  const rewritten = docs.map((doc) => plan.files.find((file) => file.path === doc.path) ?? doc);
  assert.deepEqual(pinFaults(readerOf(rewritten)).faults, [], "the guard reads the re-pinned docs and finds a sentence naming a release other than the pin's");
});
