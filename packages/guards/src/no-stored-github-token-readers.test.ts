// no-token: gh -- every test below reads this repository's committed workflows and a fixture; the one `gh api` read (`ghApiRead`, in `gh-api-read.ts`)
// is reached only from the live test, which returns before it unless `A11Y_CHECK_STORED_TOKEN_READERS=1`, and the acceptance job sets neither that nor a token.
/**
 * #4203: NO WORKFLOW IN ANY a11ign CODE REPOSITORY READS A STORED ORGANISATION TOKEN, AND A READER ADDED LATER IS RED.
 *
 * The two organisation secrets `A11IGN_BOT_TOKEN` and `ORG_SECRETS_READ_TOKEN` are deleted (and the personal access tokens behind them revoked)
 * only once nothing reads them: a deletion with a reader left turns that workflow red on its next run, in whichever of the nine repositories
 * it lives. This is the standing check that says "nothing reads them" and goes red on the first reader that appears afterwards.
 *
 * WHAT COUNTS AS A READER. A secret named in a workflow's PARSED YAML (a comment that mentions a token is a mention, and parsing is what
 * separates the two): `secrets.NAME`, `secrets['NAME']` or `secrets["NAME"]`, in any case (GitHub treats a secret name as case-insensitive);
 * and the two spellings that hand over EVERY secret and so read these two without naming them: `secrets: inherit` on a reusable-workflow call
 * and `toJSON(secrets)`. A file that does not parse is `CANNOT_TELL`, never zero readers.
 *
 * THE TWO HALVES, as in `branch-protection.test.ts`:
 *   1. this repository's own `.github/workflows/`, always, offline. The readers it holds must equal `KNOWN_GAPS` exactly, so a new one is red
 *      naming it, and CLOSING a gap is red too, saying to take the entry out (the deletion in step 3 of the row waits on that list being empty);
 *   2. the nine repositories `.agent-org/project.json` declares, opt-in under `A11Y_CHECK_STORED_TOKEN_READERS=1` (one repository with
 *      `A11Y_STORED_TOKEN_READERS_REPO=<owner/name>`, which is how the nightly job loops, as it does for the ruleset read). It reads the default
 *      branch's tree, so a repository it cannot read is `CANNOT_TELL` and the counts of the others are still printed.
 *
 * THE POSITIVE CONTROLS ARE FIXTURES, not the tree: the tree's own population is meant to reach zero, and a control that needs it non-empty
 * would then have to be deleted. `scripts/fixtures/workflow-reads-stored-github-token.yml` reads both names and must be caught; each other
 * spelling above is shown caught inline, and the shapes that must NOT count (a comment, an Octo STS step, another secret) are shown not.
 * The live reader takes its reader of a REST path as an argument so its three outcomes (readers found, nothing found, could not look) are driven without a network.
 *
 * THIS FILE DISCOVERS ITSELF NOWHERE: it scans `.github/workflows/` only, and its own names and its fixture sit outside it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { ghApiRead, type GhRead } from "./gh-api-read.ts";

const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const WORKFLOWS = ".github/workflows";
const FIXTURE = "scripts/fixtures/workflow-reads-stored-github-token.yml";
const PROJECT_FILE = ".agent-org/project.json";
const SECRETS = ["A11IGN_BOT_TOKEN", "ORG_SECRETS_READ_TOKEN"] as const;
const LIVE_FLAG = "A11Y_CHECK_STORED_TOKEN_READERS";
const LIVE_REPO = "A11Y_STORED_TOKEN_READERS_REPO";
const WORKFLOW_FILE = /^\.github\/workflows\/[^/]+\.ya?ml$/;
const READS_ONE = new RegExp(`secrets\\s*(?:\\.\\s*|\\[\\s*['"])(${SECRETS.join("|")})\\b`, "gi");
const READS_ALL = /toJSON\(\s*secrets\s*\)/gi;
const INHERIT = "*";
/** A floor, not a count: this repository holds nearly twenty workflows, and a walk that found a handful has read the wrong directory. */
const MIN_WORKFLOWS = 10;

/** A reader: which secret (or `*` for every one) and where in the file, as a dotted path through the parsed document. */
type Reader = { secret: string; path: string };
type Counted = { file: string; secret: string };

/**
 * The readers this tree has not removed. EACH ENTRY IS A NAMED GAP with its row, and the list only ever gets shorter: the exact comparison below
 * is red when a reader is not listed AND when a listed one is gone. `nightly.yml`'s settings table reads contents, trees, environments,
 * deployment-branch policies and a team's repositories, which the `metadata: read` organisation policy does not carry (#4195, #4330;
 * `nightly-reads-octo-sts.test.ts` pins the same read from the workflow's side). Widening that policy is `ceo`'s crossing, so it is
 * recorded here and not worked round.
 */
const KNOWN_GAPS: Counted[] = [{ file: `${WORKFLOWS}/nightly.yml`, secret: "A11IGN_BOT_TOKEN" }];

/** Every string value of a parsed document, with its dotted path; a mapping key `secrets` with the value `inherit` is reported as a string too. */
function* strings(node: unknown, path: string): Generator<{ path: string; text: string }> {
  if (typeof node === "string") yield { path, text: node };
  else if (Array.isArray(node)) for (const [i, child] of node.entries()) yield* strings(child, `${path}.${i}`);
  else if (node !== null && typeof node === "object") {
    for (const [key, child] of Object.entries(node)) {
      if (key === "secrets" && typeof child === "string" && child.trim() === "inherit") yield { path: `${path}.${key}`, text: "secrets: inherit" };
      else yield* strings(child, path === "" ? key : `${path}.${key}`);
    }
  }
}

/** The readers in one workflow's text. A text that does not parse THROWS, so a caller cannot read an unparsed file as clean. */
function readersIn(text: string): Reader[] {
  const readers: Reader[] = [];
  for (const { path, text: value } of strings(parseYaml(text), "")) {
    for (const match of value.matchAll(READS_ONE)) readers.push({ secret: match[1].toUpperCase(), path });
    readers.push(...Array.from(value.matchAll(READS_ALL), () => ({ secret: INHERIT, path })));
    if (value === "secrets: inherit") readers.push({ secret: INHERIT, path });
  }
  return readers;
}

const countedKey = ({ file, secret }: Counted) => `${file} reads ${secret === INHERIT ? "every secret" : secret}`;

function ownReaders(): Counted[] {
  return readdirSync(join(REPO_ROOT, WORKFLOWS)).filter((name) => /\.ya?ml$/.test(name)).sort().flatMap((name) => {
    const file = `${WORKFLOWS}/${name}`;
    return readersIn(readFileSync(join(REPO_ROOT, file), "utf8")).map(({ secret }) => ({ file, secret }));
  });
}

/** What differs between the readers found and the readers allowed: `unlisted` are red as new, `closed` are red as gaps that no longer exist. */
function compareToGaps(found: Counted[], gaps: Counted[]): { unlisted: string[]; closed: string[] } {
  const tally = (list: Counted[]) => list.map(countedKey).reduce((counts, key) => counts.set(key, (counts.get(key) ?? 0) + 1), new Map<string, number>());
  const have = tally(found);
  const allowed = tally(gaps);
  const surplus = (a: Map<string, number>, b: Map<string, number>) => [...a].flatMap(([key, n]) => (n > (b.get(key) ?? 0) ? [key] : []));
  return { unlisted: surplus(have, allowed), closed: surplus(allowed, have) };
}

type Verdict = { repo: string; readers: Counted[] } | { repo: string; cannotTell: string };
type PathReader = (path: string) => GhRead;
type Tree = { tree?: { path: string; type: string }[]; truncated?: boolean };

/** One repository's readers off its default branch's tree; every way of not seeing the tree is `cannotTell`, never an empty list. */
function liveReaders(repo: string, readPath: PathReader): Verdict {
  const tree = readPath(`repos/${repo}/git/trees/HEAD?recursive=1`);
  if (tree.kind !== "ok") return { repo, cannotTell: tree.kind === "refused" ? "the tree answered 403/404 (absent or forbidden)" : tree.why };
  const { tree: entries, truncated } = tree.value as Tree;
  if (entries === undefined || truncated === true) return { repo, cannotTell: "the tree came back truncated or without entries" };
  const readers: Counted[] = [];
  for (const entry of entries.filter((e) => e.type === "blob" && WORKFLOW_FILE.test(e.path))) {
    const file = readPath(`repos/${repo}/contents/${entry.path}`);
    if (file.kind !== "ok") return { repo, cannotTell: `${entry.path} could not be read` };
    const text = Buffer.from(String((file.value as { content?: string }).content ?? ""), "base64").toString("utf8");
    try {
      readers.push(...readersIn(text).map(({ secret }) => ({ file: entry.path, secret })));
    } catch (cause) {
      return { repo, cannotTell: `${entry.path} does not parse as YAML: ${String(cause).split("\n")[0]}` };
    }
  }
  return { repo, readers };
}

const codeRepositories = (): string[] => (JSON.parse(readFileSync(join(REPO_ROOT, PROJECT_FILE), "utf8")) as { code: { repo: string }[] }).code.map((c) => c.repo);

// --- the detector, and its positive controls ----------------------------------------------------------------------------------------------

test("CONTROL: the fixture workflow reading both names is caught, once each, and the counts are the fixture's", () => {
  const readers = readersIn(readFileSync(join(REPO_ROOT, FIXTURE), "utf8"));
  assert.deepEqual(readers.map((r) => r.secret).sort(), ["A11IGN_BOT_TOKEN", "ORG_SECRETS_READ_TOKEN"]);
  assert.match(readers[0].path, /^jobs\.reads-both\.steps\.\d\./, "a reader is located by its path through the document");
});

test("every spelling of a read is caught: any case, a space, the double-quoted bracket, every secret at once", () => {
  const spellings = [
    "x: ${{ secrets.a11ign_bot_token }}", 'x: ${{ secrets["ORG_SECRETS_READ_TOKEN"] }}', "x: ${{ secrets . A11IGN_BOT_TOKEN }}",
    "x: ${{ toJSON(secrets) }}", "jobs:\n  call:\n    uses: ./.github/workflows/a.yml\n    secrets: inherit",
  ];
  for (const spelling of spellings) assert.equal(readersIn(spelling).length, 1, `not caught: ${spelling}`);
});

test("what must NOT count: a comment, an Octo STS step, another secret, and a name that only starts with ours", () => {
  const clean = [
    "# env: { T: ${{ secrets.A11IGN_BOT_TOKEN }} }\non: push",
    "steps:\n  - uses: octo-sts/action@v1\n    with: { scope: a11ign, identity: nightly }",
    "x: ${{ secrets.NPM_TOKEN }}",
    "x: ${{ secrets.A11IGN_BOT_TOKEN_OLD }}",
    "jobs:\n  call:\n    uses: ./.github/workflows/a.yml\n    secrets:\n      NPM_TOKEN: ${{ secrets.NPM_TOKEN }}",
  ];
  for (const text of clean) assert.deepEqual(readersIn(text), [], `counted: ${text}`);
});

test("a workflow that does not parse is an error, never zero readers", () => {
  assert.throws(() => readersIn("a: [unclosed"));
});

// --- the standing check on this repository -----------------------------------------------------------------------------------------------

test("this repository's workflows hold exactly the readers KNOWN_GAPS names: a new one is red, and so is a closed gap left in the list", () => {
  const { unlisted, closed } = compareToGaps(ownReaders(), KNOWN_GAPS);
  assert.deepEqual(unlisted, [], "a stored organisation token is read where it must not be: move the read to Octo STS (#4203)");
  assert.deepEqual(closed, [], "a gap in KNOWN_GAPS is closed: take the entry out of the list, and the secret's deletion is one reader nearer");
});

test("CONTROL: the comparison itself goes red both ways, so the test above is not passing on an empty or ignored list", () => {
  const reader: Counted = { file: `${WORKFLOWS}/x.yml`, secret: "A11IGN_BOT_TOKEN" };
  assert.deepEqual(compareToGaps([reader], []), { unlisted: [countedKey(reader)], closed: [] });
  assert.deepEqual(compareToGaps([], [reader]), { unlisted: [], closed: [countedKey(reader)] });
  assert.deepEqual(compareToGaps([reader, reader], [reader]).unlisted, [countedKey(reader)], "a SECOND read in a listed file is new");
  assert.ok(KNOWN_GAPS.length > 0 || ownReaders().length === 0, "an empty list is only true while the tree holds no reader");
});

test("this repository's own population is non-empty and read: the workflows directory has files, so zero readers would be a finding", () => {
  assert.ok(readdirSync(join(REPO_ROOT, WORKFLOWS)).filter((name) => /\.ya?ml$/.test(name)).length >= MIN_WORKFLOWS, "the walk found almost no workflows: wrong directory");
});

// --- the nine repositories, live and opt-in ----------------------------------------------------------------------------------------------

const blob = (path: string) => ({ path, type: "blob" });
const file = (text: string): GhRead => ({ kind: "ok", value: { content: Buffer.from(text).toString("base64") } });
const fakeReader = (answers: Record<string, GhRead>): PathReader => (path) => answers[path] ?? { kind: "unreadable", why: `no answer for ${path}` };

test("CONTROL: the live reader finds a reader in a fixture repository, finds none in a clean one, and could not tell in the three other cases", () => {
  const fixture = readFileSync(join(REPO_ROOT, FIXTURE), "utf8");
  const tree = (entries: unknown[], truncated = false): GhRead => ({ kind: "ok", value: { tree: entries, truncated } });
  const caught = liveReaders("o/r", fakeReader({
    "repos/o/r/git/trees/HEAD?recursive=1": tree([blob(".github/workflows/a.yml"), blob("README.md")]), "repos/o/r/contents/.github/workflows/a.yml": file(fixture),
  }));
  assert.deepEqual("readers" in caught && caught.readers.map((r) => r.secret).sort(), ["A11IGN_BOT_TOKEN", "ORG_SECRETS_READ_TOKEN"]);
  const clean = liveReaders("o/r", fakeReader({ "repos/o/r/git/trees/HEAD?recursive=1": tree([blob("README.md")]) }));
  assert.deepEqual(clean, { repo: "o/r", readers: [] });
  const hidden = fakeReader({ "repos/o/r/git/trees/HEAD?recursive=1": tree([blob(".github/workflows/a.yml")]) });
  const blind: Verdict[] = [
    liveReaders("o/r", fakeReader({ "repos/o/r/git/trees/HEAD?recursive=1": { kind: "refused" } })),
    liveReaders("o/r", fakeReader({ "repos/o/r/git/trees/HEAD?recursive=1": tree([blob(".github/workflows/a.yml")], true) })),
    liveReaders("o/r", hidden),
    liveReaders("o/r", fakeReader({ "repos/o/r/git/trees/HEAD?recursive=1": tree([blob(".github/workflows/a.yml")]), "repos/o/r/contents/.github/workflows/a.yml": file("a: [unclosed") })),
  ];
  for (const verdict of blind) assert.ok("cannotTell" in verdict, `a read that could not look was taken for a count: ${JSON.stringify(verdict)}`);
});

test("the nine declared repositories: every one is read, the counts are printed, and an unreadable one is CANNOT_TELL (opt-in: A11Y_CHECK_STORED_TOKEN_READERS=1)", () => {
  if (process.env[LIVE_FLAG] !== "1") return;
  const repos = process.env[LIVE_REPO] === undefined ? codeRepositories() : [process.env[LIVE_REPO]];
  assert.ok(repos.length > 0, "CANNOT_TELL: no repository was declared, so nothing was read. An empty list certifies no repository.");
  const verdicts = repos.map((repo) => liveReaders(repo, ghApiRead));
  for (const v of verdicts) console.log(`stored-token readers: ${v.repo} = ${"readers" in v ? v.readers.length : `CANNOT_TELL (${v.cannotTell})`}`);
  assert.ok(verdicts.length > 0, "CANNOT_TELL: no repository produced a verdict, so nothing was read.");
  const blind = verdicts.flatMap((v) => ("cannotTell" in v ? [`${v.repo}: ${v.cannotTell}`] : []));
  assert.deepEqual(blind, [], "CANNOT_TELL: these repositories were not read, so nothing is certified about them. This is not a pass.");
  const own = verdicts.find((v) => v.repo === "a11ign/a11ign");
  const found = verdicts.flatMap((v) => ("readers" in v ? v.readers.filter((r) => v.repo !== "a11ign/a11ign" || !KNOWN_GAPS.some((g) => g.file === r.file && g.secret === r.secret)) : []));
  assert.deepEqual(found.map((r) => `${r.file} ${countedKey(r)}`), [], "a stored organisation token is read in the repositories above");
  assert.ok(own === undefined || "readers" in own, "this repository's live read is its own tree, which the offline test pins");
});
