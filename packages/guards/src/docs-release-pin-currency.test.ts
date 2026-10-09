/**
 * A DOC THAT PINS AN a11ign RELEASE MORE THAN ONE MINOR BEHIND THE NEWEST TAG FAILS (#4508, chairman direction on #2568, class
 * `release-docs-drift`).
 *
 * The tester guide pinned `0.3.0` while the newest release was `0.5.3`, two minors behind, and nothing said so. Per-merge release means
 * `packages/cli/package.json` on `main` lags the last tag, so the TAGS are the state read: `a11ign@<x.y.z>`, the name `release.yml`'s
 * `promote-action-tag` writes. No network: a pin's commit is resolved by the local tag list.
 *
 * WHAT IS A PIN, AND WHAT IS HISTORY. A pin is something a reader copies and runs, so it is recognised by its FORM, never by the words
 * around it:
 *   - a `uses: a11ign/a11ign@<40-hex>` line: the SHA is the pin. The `# ... a11ign@0.5.3` comment beside it is a label for a human and
 *     is NOT read as a second pin (a stale label on a fresh SHA is a different defect, and this guard would call the SHA right);
 *   - an install command (`npx`, `pnpm dlx`, `npm i` ...) naming `a11ign@<x.y.z>`.
 * Prose naming `a11ign@0.1.0` ("`a11ign@0.1.0` depends on ...", an ADR's account of a first publish) matches neither form, so history
 * stays writable. A guard that failed on history would be switched off.
 *
 * Positive controls: the real-tree test asserts that it found pins (an emptiness assertion passes when the docs stop carrying any), and
 * the named cases below run `pinFaults` on fixtures through the same injected reader the real test uses.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { sandboxGitEnv } from "./git-env.mjs";

const REPO = fileURLToPath(new URL("../../..", import.meta.url));

/** How many minors a pin may trail the newest tag by. One: a release in flight is not drift, two is. */
const MINORS_ALLOWED_BEHIND = 1;

interface ReleaseTag {
  /** The tag's name, `a11ign@0.5.3`. */
  name: string;
  /** The commit the tag points at (an annotated tag's peeled commit, not the tag object). */
  commit: string;
}
interface Doc {
  path: string;
  text: string;
}
/** The two things the guard reads, injected so a fixture can stand in for the checkout. */
interface Reader {
  tags(): ReleaseTag[];
  docs(): Doc[];
}
interface Pin {
  path: string;
  line: number;
  /** The release the pin names, `0.5.3`, or `undefined` when a SHA resolves to no release tag. */
  version: string | undefined;
  /** What was written: the 40-hex SHA or `a11ign@x.y.z`. */
  written: string;
}

const RELEASE_TAG = /^a11ign@(\d+)\.(\d+)\.(\d+)$/;
const ACTION_PIN = /\buses:\s*a11ign\/a11ign@([0-9a-f]{40})\b/;
/** An install command, then `a11ign@x.y.z` that is not the tail of a scoped name (`@a11ign/...`) or a path. */
const INSTALL_PIN = /\b(?:npx|bunx|pnpm\s+(?:add|dlx|install|i)|npm\s+(?:i|install|exec)|yarn\s+(?:add|dlx))\b[^\n]*?(?<![\w/@.-])a11ign@(\d+\.\d+\.\d+)\b/;

/** The docs the row names: `README.md`, `docs/*.md` and `docs/adr/*.md`, not deeper trees (a corpus fixture is not a guide). */
const GUARDED_DOC = /^(?:README\.md|docs\/[^/]+\.md|docs\/adr\/[^/]+\.md)$/;

const git = (args: string[]) => execFileSync("git", args, { cwd: REPO, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: sandboxGitEnv() });

/** The real reader: local tags (`%(*objectname)` is the peeled commit of an annotated tag, empty for a lightweight one) and tracked docs. */
const checkoutReader: Reader = {
  tags: () =>
    git(["for-each-ref", "refs/tags/a11ign@*", "--format=%(refname:short) %(objectname) %(*objectname)"])
      .split("\n")
      .filter(Boolean)
      .map((row) => {
        const [name, object, peeled] = row.split(" ");
        return { name, commit: peeled || object };
      }),
  docs: () =>
    git(["ls-files", "-z", "README.md", "docs"])
      .split("\0")
      .filter((path) => GUARDED_DOC.test(path))
      .map((path) => ({ path, text: readFileSync(`${REPO}${path}`, "utf8") })),
};

const parseVersion = (version: string): [number, number, number] => {
  const [major, minor, patch] = version.split(".").map(Number);
  return [major, minor, patch];
};

/** Tag names that are releases (`a11ign@x.y.z`), as versions; a prerelease or stray tag is not one and is left out. */
function releaseVersions(tags: ReleaseTag[]): string[] {
  return tags.map((tag) => RELEASE_TAG.exec(tag.name)).filter((m): m is RegExpExecArray => m !== null).map((m) => m.slice(1).join("."));
}

const newerFirst = (a: string, b: string) => {
  const [x, y] = [parseVersion(a), parseVersion(b)];
  return y[0] - x[0] || y[1] - x[1] || y[2] - x[2];
};

/** How many minors `pinned` trails `newest` by; a whole major behind is counted as past any allowance. */
function minorsBehind(pinned: string, newest: string): number {
  const [pinMajor, pinMinor] = parseVersion(pinned);
  const [newMajor, newMinor] = parseVersion(newest);
  return pinMajor < newMajor ? Number.POSITIVE_INFINITY : newMinor - pinMinor;
}

/** The pin on one line, if any: the SHA form is checked first and an install form never shares its line. */
function pinOnLine(text: string, tags: ReleaseTag[]): Pick<Pin, "version" | "written"> | undefined {
  const action = ACTION_PIN.exec(text);
  if (action) {
    const tag = tags.find((t) => t.commit === action[1] && RELEASE_TAG.test(t.name));
    return { version: tag?.name.slice("a11ign@".length), written: action[1] };
  }
  const install = INSTALL_PIN.exec(text);
  return install ? { version: install[1], written: `a11ign@${install[1]}` } : undefined;
}

function pinsIn(doc: Doc, tags: ReleaseTag[]): Pin[] {
  return doc.text.split("\n").flatMap((text, index) => {
    const found = pinOnLine(text, tags);
    return found ? [{ path: doc.path, line: index + 1, ...found }] : [];
  });
}

interface Verdict {
  /** `ok`, `cannot-tell` (no release tag to measure against), or `stale` (at least one fault). */
  status: "ok" | "cannot-tell" | "stale";
  newest: string | undefined;
  pins: Pin[];
  faults: string[];
}

const CANNOT_TELL =
  "CANNOT TELL whether any doc's release pin is current: this checkout carries no `a11ign@<x.y.z>` tag. Fetch them " +
  "(`git fetch --tags`; in CI, `actions/checkout` with `fetch-depth: 0`; in a row, `History: full`). This is not a pass.";

function pinFaults(reader: Reader): Verdict {
  const tags = reader.tags();
  const versions = releaseVersions(tags).sort(newerFirst);
  if (versions.length === 0) return { status: "cannot-tell", newest: undefined, pins: [], faults: [CANNOT_TELL] };
  const newest = versions[0];
  const pins = reader.docs().flatMap((doc) => pinsIn(doc, tags));
  const faults = pins.flatMap((pin) => faultOf(pin, newest));
  return { status: faults.length === 0 ? "ok" : "stale", newest, pins, faults };
}

function faultOf(pin: Pin, newest: string): string[] {
  const where = `${pin.path}:${pin.line}`;
  if (pin.version === undefined) {
    return [`${where} pins commit ${pin.written}, which no \`a11ign@<x.y.z>\` tag points at, so its age cannot be told (newest release: ${newest})`];
  }
  if (minorsBehind(pin.version, newest) <= MINORS_ALLOWED_BEHIND) return [];
  return [`${where} pins release ${pin.version} (${pin.written}); the newest tag is a11ign@${newest}, more than ${MINORS_ALLOWED_BEHIND} minor behind`];
}

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

// ── the real tree ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────

test("no tracked doc pins an a11ign release more than one minor behind the newest tag", () => {
  const verdict = pinFaults(checkoutReader);
  assert.notEqual(verdict.status, "cannot-tell", CANNOT_TELL);
  assert.ok(verdict.pins.length > 0, "no `uses: a11ign/a11ign@<sha>` pin found in any doc: the positive control for the assertion below");
  assert.deepEqual(verdict.faults, []);
});
