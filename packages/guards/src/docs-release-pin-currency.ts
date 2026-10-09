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
/** The two things the guard reads, injected so a fixture can stand in for the checkout. */
export interface Reader {
  tags(): ReleaseTag[];
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
  /** `ok`, `cannot-tell` (no release tag to measure against), or `stale` (at least one fault). */
  status: "ok" | "cannot-tell" | "stale";
  newest: string | undefined;
  pins: Pin[];
  faults: string[];
}

export const CANNOT_TELL =
  "CANNOT TELL whether any doc's release pin is current: this checkout carries no `a11ign@<x.y.z>` tag. Fetch them " +
  "(`git fetch --tags`; in CI, `actions/checkout` with `fetch-depth: 0`; in a row, `History: full`). This is not a pass.";

export function pinFaults(reader: Reader): Verdict {
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
