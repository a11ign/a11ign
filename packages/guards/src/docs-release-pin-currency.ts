/**
 * The logic behind the release-pin currency guard (#4508): what a pin is, how old it is, and the verdict over a tag list and a set of docs.
 * No test lives here; `docs-release-pin-currency.test.ts` runs it on fixtures (the Acceptance file) and
 * `docs-release-pin-currency.real-tree.test.ts` runs it on the checkout. Both read the pin-versus-history rule below.
 *
 * WHAT IS A PIN, AND WHAT IS HISTORY. A pin is something a reader copies and runs, so it is recognised by its FORM, never by the words
 * around it:
 *   - a `uses: a11ign/a11ign@<40-hex>` line: the SHA is the pin. The `# ... a11ign@0.5.3` comment beside it is a label for a human and
 *     is NOT read as a second pin (a stale label on a fresh SHA is a different defect, and this guard would call the SHA right);
 *   - an install command (`npx`, `pnpm dlx`, `npm i` ...) naming `a11ign@<x.y.z>`.
 * Prose naming `a11ign@0.1.0` ("`a11ign@0.1.0` depends on ...", an ADR's account of a first publish) matches neither form, so history
 * stays writable. A guard that failed on history would be switched off.
 */
/** How many minors a pin may trail the newest tag by. One: a release in flight is not drift, two is. */
export const MINORS_ALLOWED_BEHIND = 1;

export interface ReleaseTag {
  /** The tag's name, `a11ign@0.5.3`. */
  name: string;
  /** The commit the tag points at (an annotated tag's peeled commit, not the tag object). */
  commit: string;
}
export interface Doc {
  path: string;
  text: string;
}
/** The things the guard reads, injected so a fixture can stand in for the checkout. */
export interface Reader {
  tags(): ReleaseTag[];
  /** The commit the `v0` tag points at, or `undefined` when this checkout has no `v0`. */
  v0Commit(): string | undefined;
  docs(): Doc[];
}
export interface Pin {
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
export const GUARDED_DOC = /^(?:README\.md|docs\/[^/]+\.md|docs\/adr\/[^/]+\.md)$/;
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

export interface Verdict {
  /** `ok`, `cannot-tell` (no qualified release to measure against), or `stale` (at least one fault). */
  status: "ok" | "cannot-tell" | "stale";
  /** The release `v0` points at, the one pins are measured against; `undefined` when it cannot be told. */
  v0Release: string | undefined;
  pins: Pin[];
  faults: string[];
}

export const CANNOT_TELL =
  "CANNOT TELL whether any doc's release pin is current: this checkout carries no `a11ign@<x.y.z>` tag. Fetch them " +
  "(`git fetch --tags --force`; in CI, `actions/checkout` with `fetch-depth: 0`; in a row, `History: full`). This is not a pass.";
export const CANNOT_TELL_V0 =
  "CANNOT TELL whether any doc's release pin is current: the `v0` tag is missing from this checkout, or names no " +
  "`a11ign@<x.y.z>` release. Fetch the tags (`git fetch --tags --force`: `v0` moves, and a plain fetch refuses to move a tag " +
  "it already has; in CI, `actions/checkout` with `fetch-depth: 0`). This is not a pass.";

/**
 * The release `v0` points at: the newest `a11ign@<x.y.z>` tag on the commit `v0` names. `v0` follows the newest QUALIFIED release, and
 * a tag can run ahead of it while the release is still in flight, so measuring against the newest tag fails a correct pin.
 */
function releaseV0Points(v0Commit: string | undefined, tags: ReleaseTag[]): string | undefined {
  if (v0Commit === undefined) return undefined;
  return releaseVersions(tags.filter((tag) => tag.commit === v0Commit)).sort(newerFirst)[0];
}

export function pinFaults(reader: Reader): Verdict {
  const tags = reader.tags();
  if (releaseVersions(tags).length === 0) return { status: "cannot-tell", v0Release: undefined, pins: [], faults: [CANNOT_TELL] };
  const v0Release = releaseV0Points(reader.v0Commit(), tags);
  if (v0Release === undefined) return { status: "cannot-tell", v0Release, pins: [], faults: [CANNOT_TELL_V0] };
  const docs = reader.docs().map((doc) => {
    const pins = pinsIn(doc, tags);
    return { pins, faults: [...pins.flatMap((pin) => faultOf(pin, v0Release)), ...restatementFaults(doc, pins)] };
  });
  const faults = docs.flatMap((doc) => doc.faults);
  return { status: faults.length === 0 ? "ok" : "stale", v0Release, pins: docs.flatMap((doc) => doc.pins), faults };
}

function faultOf(pin: Pin, v0Release: string): string[] {
  const where = `${pin.path}:${pin.line}`;
  if (pin.version === undefined) {
    return [`${where} pins commit ${pin.written}, which no \`a11ign@<x.y.z>\` tag points at, so its age cannot be told (v0's release: ${v0Release})`];
  }
  if (minorsBehind(pin.version, v0Release) <= MINORS_ALLOWED_BEHIND) return [];
  return [`${where} pins release ${pin.version} (${pin.written}); v0 points at a11ign@${v0Release}, more than ${MINORS_ALLOWED_BEHIND} minor behind`];
}

/**
 * THE SENTENCES THAT RESTATE A PIN'S RELEASE IN WORDS, each matching only the version (group 0), so a rewrite moves that and nothing else.
 * `movable`: the exact wordings the re-pin writer knows, so it may move them. The two of #5291 are the comment under a pin, `# Pinned to the
 * full 40-character commit of release X, so your CI ...`, and `(\`a11ign@X\` is the tag the pin above names)`. Not movable: the same claim
 * in a wording the writer does not know, a dated parenthetical (`\`latest\` read X on <date>`) or a behavioural one (`as \`X\` does`). Those are
 * true of the release they name, and a rewrite would falsify them, so the guard fails on them and the writer names them (#5468).
 */
const RESTATEMENTS: Array<{ movable: boolean; re: RegExp }> = [
  { movable: true, re: /(?<=commit\s+of\s+release\s+)\d+\.\d+\.\d+(?!\d)(?=,\s+so your CI)/g },
  { movable: true, re: /(?<=`a11ign@)\d+\.\d+\.\d+(?!\d)(?=`\s+is\s+the\s+tag\s+the\s+pin\s+above\s+names)/g },
  { movable: true, re: /(?<=pins\s+release\s+`)\d+\.\d+\.\d+(?!\d)(?=`)/g },
  { movable: false, re: /(?<=commit\s+of\s+release\s+(?:a11ign@)?)\d+\.\d+\.\d+(?!\d)(?!,\s+so your CI)/g },
  { movable: false, re: /(?<=`)\d+\.\d+\.\d+(?!\d)(?=`\s+does\b)/g },
  { movable: false, re: /(?<=`latest`\s+(?:read\s+)?`?)\d+\.\d+\.\d+(?!\d)/g },
];

interface Restatement {
  /** One-based, as the guard names lines. */
  line: number;
  version: string;
  movable: boolean;
}

/** A comment or quote marker at the start of a line, dropped so a sentence wrapped across one still reads as one sentence. */
const LINE_MARKER = /^\s*(?:#|>)\s?/;

/**
 * Every restatement in `text`, read over the whole doc with the line markers dropped: a sentence wrapped across a comment line is one
 * sentence (`read \`latest\`` on one line, `\`0.10.3\` on 2026-10-13` on the next), and a per-line match would miss it (#5474's verdict).
 */
function restatementsIn(text: string): Restatement[] {
  const flat = text.split("\n").map((line) => line.replace(LINE_MARKER, "")).join("\n");
  return RESTATEMENTS.flatMap(({ movable, re }) =>
    [...flat.matchAll(re)].map((match) => ({ line: flat.slice(0, match.index ?? 0).split("\n").length, version: match[0], movable })),
  ).sort((a, b) => a.line - b.line);
}

/**
 * A sentence that restates the pin's release and names another release: the pin moved and the prose beside it did not (#5468). Only a doc
 * with a readable pin is checked, because a sentence with no pin beside it to restate is history until a pin says otherwise.
 */
function restatementFaults(doc: Doc, pins: Pin[]): string[] {
  const pinned = [...new Set(pins.flatMap((pin) => (pin.version === undefined ? [] : [pin.version])))];
  if (pinned.length === 0) return [];
  return restatementsIn(doc.text)
    .filter((restatement) => !pinned.includes(restatement.version))
    .map((restatement) => `${doc.path}:${restatement.line} names release ${restatement.version} in a sentence that restates the pin, but the pin is on ${pinned.map((version) => `a11ign@${version}`).join(", ")}`);
}

// ── the re-pin (#5224, #5121 option A) ─────────────────────────────────────────────────────────────────────────────────────────────────

/** The release `v0` was promoted to, the one every guarded doc's pin is moved to: its version and the commit its tag names. */
export interface Promoted {
  version: string;
  commit: string;
}
export interface RepinPlan {
  /** `current`: no guarded pin trails the promoted release. `rewrite`: `files` change. `refused`: `faults` say why nothing may be written. */
  status: "current" | "rewrite" | "refused";
  /** What the docs are moved to; `undefined` only when `v0` could not be read. */
  promoted: Promoted | undefined;
  /** ONLY the docs that change, with their rewritten text; empty unless `status` is `rewrite`. */
  files: Doc[];
  faults: string[];
  /**
   * Sentences that still name a release the re-pin did not move, `file:line`: the writer will not guess at their wording, so the guard fails
   * on them and the pull request names them. Empty when every restatement now names the pinned release.
   */
  unmoved: string[];
}

const isOlder = (version: string, than: string) => newerFirst(version, than) > 0;
const COMMIT = /^[0-9a-f]{40}$/;

/** `a11ign@<from>` as a label or an install pin, never the tail of a scoped name or a path, and not the prefix of a longer version. */
function versionLabel(from: string): RegExp {
  return new RegExp(`(?<![\\w/@.-])a11ign@${from.replace(/\./g, "\\.")}(?!\\d)`, "g");
}

/**
 * One line, moved to `promoted` when it carries a pin to an OLDER release. Only the pin's own commit and the `a11ign@<its version>` label
 * on that line move here: the prose beside a pin is `moveRestatements`', and only the movable sentences it names (#5291, #5470).
 * A pin newer than `promoted`, or already on it, is left alone (the re-pin never moves a doc backwards).
 */
function repinLine(line: string, tags: ReleaseTag[], promoted: Promoted): { line: string; from?: string; fault?: string } {
  const found = pinOnLine(line, tags);
  if (!found) return { line };
  if (found.version === undefined) {
    const fault = `pins commit ${found.written}, which no \`a11ign@<x.y.z>\` tag points at, so the rewrite cannot tell which release it is and moved nothing (v0's release: ${promoted.version})`;
    return { line, fault };
  }
  if (found.written === promoted.commit || !isOlder(found.version, promoted.version)) return { line };
  const commitMoved = COMMIT.test(found.written) ? line.replace(found.written, promoted.commit) : line;
  return { line: commitMoved.replace(versionLabel(found.version), `a11ign@${promoted.version}`), from: found.version };
}

/**
 * THE MOVABLE SENTENCES THAT RESTATE A PIN'S RELEASE IN WORDS (#5291, `ceo` on #5283's review; #5470 adds `pins release X`): the comment
 * under a pin, `# Pinned to the full 40-character commit of release X, so your CI ...`, and the one after the Quickstart fence, `(\`a11ign@X\`
 * is the tag the pin above names)`. #5283 re-pinned README to 0.10.2 and both still said 0.9.0 until a reviewer caught it. EXACT TEMPLATES,
 * and only for a release a pin in the same doc moved away from. A doc also says "`latest` read 0.9.0 on 2026-10-11" or "the 0.9.0 source
 * accepts": dated or behavioural claims that are TRUE of 0.9.0 and that a rewrite would falsify. Those stay as written, and `unmoved` names them.
 */
function moveRestatements(text: string, from: string, to: string): string {
  return RESTATEMENTS.filter(({ movable }) => movable).reduce(
    (acc, { re }) => acc.replace(re, (version) => (version === from ? to : version)),
    text,
  );
}

/**
 * The restatements the writer could not move, `file:line`: every sentence still naming a release other than the promoted one. Only a doc
 * with a pin is read, the same condition `restatementFaults` uses, so the writer names exactly the lines the guard would fail on.
 */
function unmovedIn(doc: Doc, text: string, tags: ReleaseTag[], promoted: Promoted): string[] {
  if (pinsIn({ path: doc.path, text }, tags).length === 0) return [];
  const named = restatementsIn(text)
    .filter((restatement) => restatement.version !== promoted.version)
    .map((restatement) => `${doc.path}:${restatement.line}`);
  return [...new Set(named)];
}

function repinDoc(doc: Doc, tags: ReleaseTag[], promoted: Promoted): { doc: Doc; changed: boolean; faults: string[]; unmoved: string[] } {
  const moved = doc.text.split("\n").map((text, index) => ({ ...repinLine(text, tags, promoted), where: `${doc.path}:${index + 1}` }));
  const movedFrom = new Set(moved.flatMap((m) => (m.from === undefined ? [] : [m.from])));
  const joined = moved.map((m) => m.line).join("\n");
  const text = [...movedFrom].reduce((acc, from) => moveRestatements(acc, from, promoted.version), joined);
  const faults = moved.flatMap((m) => (m.fault === undefined ? [] : [`${m.where} ${m.fault}`]));
  return { doc: { path: doc.path, text }, changed: text !== doc.text, faults, unmoved: unmovedIn(doc, text, tags, promoted) };
}

/**
 * THE DOCS' PINS, MOVED TO THE RELEASE `v0` POINTS AT, for the pull request `docs-pin-write.yml` opens after a promotion. The same reader as
 * `pinFaults`, so a fixture drives both, and the same `GUARDED_DOC` population. ALL OR NOTHING: a pin the rewrite cannot match (a commit no
 * release tag names) refuses the whole plan and names the file and line, because a half-moved set is a state a reviewer could approve and
 * the guard would still fail on. `CANNOT TELL` is a refusal too, never a `current`.
 */
export function planRepin(reader: Reader): RepinPlan {
  const tags = reader.tags();
  const refused = (fault: string, promoted?: Promoted): RepinPlan => ({ status: "refused", promoted, files: [], faults: [fault], unmoved: [] });
  if (releaseVersions(tags).length === 0) return refused(CANNOT_TELL);
  const commit = reader.v0Commit();
  const version = releaseV0Points(commit, tags);
  if (commit === undefined || version === undefined) return refused(CANNOT_TELL_V0);
  const promoted = { version, commit };
  const docs = reader.docs().filter((doc) => GUARDED_DOC.test(doc.path)).map((doc) => repinDoc(doc, tags, promoted));
  const faults = docs.flatMap((d) => d.faults);
  if (faults.length > 0) return { status: "refused", promoted, files: [], faults, unmoved: [] };
  const files = docs.filter((d) => d.changed).map((d) => d.doc);
  const unmoved = docs.flatMap((d) => d.unmoved);
  return { status: files.length === 0 ? "current" : "rewrite", promoted, files, faults: [], unmoved };
}

/**
 * The reader over a git checkout, for the workflow that has one. `git` runs one command and returns its stdout; `read` returns a tracked
 * file's text. Neither is `node:child_process` nor `node:fs` here, so a fixture stands in for both. `for-each-ref` answers an absent `v0`
 * with nothing, which is the `CANNOT TELL` verdict and not an exception; `%(*objectname)` is the peeled commit of an annotated tag.
 */
export function repoReader(git: (args: string[]) => string, read: (path: string) => string): Reader {
  return {
    tags: () =>
      git(["for-each-ref", "refs/tags/a11ign@*", "--format=%(refname:short) %(objectname) %(*objectname)"])
        .split("\n")
        .filter(Boolean)
        .map((row) => {
          const [name, object, peeled] = row.split(" ");
          return { name, commit: peeled || object };
        }),
    v0Commit: () => {
      const [object, peeled] = git(["for-each-ref", "refs/tags/v0", "--format=%(objectname) %(*objectname)"]).trim().split(" ");
      return peeled || object || undefined;
    },
    docs: () =>
      git(["ls-files"])
        .split("\n")
        .filter((path) => GUARDED_DOC.test(path))
        .map((path) => ({ path, text: read(path) })),
  };
}
