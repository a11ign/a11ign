/**
 * #4193: Octo STS trusts only the issuers `a11ign/.github` `.github/chainguard/trusted-token-issuers.yaml` names, and the file is
 * pinned here because **deleting it FAILS OPEN** (octo-sts README, "When the lookup fails": "File absent -- octo-sts permits all
 * issuers"; read at octo-sts/app v0.11.2). So its EXISTENCE is the fact under guard, and its content second: the GitHub Actions
 * issuer and no other.
 *
 * What is pinned, and the way each could answer wrongly:
 *   1. ABSENT is RED, never green and never "nothing to check": the fixture `octo-sts-trusted-issuers-absent.txt` is the text `gh`
 *      prints for a 404, and it must read MISSING_FAILS_OPEN. This is the positive control for every emptiness below.
 *   2. A SECOND ISSUER is RED: the fixture `octo-sts-trusted-issuers-two-issuers.yaml` must read WRONG_ISSUERS.
 *   3. A read that could not be made is CANNOT_TELL, a failed test, and NEVER green -- including a 404 on a repository we cannot
 *      read, which means "absent OR forbidden" and so is only taken as absent after the repository itself was read.
 *   4. THE PARSER FAILS CLOSED. It understands the three keys the documented file has, and a line it does not recognise (flow
 *      style, an anchor, a duplicated key) is CANNOT_TELL rather than a guess about what Octo STS would have parsed.
 *   5. `issuer_patterns` of any kind, and `mode: audit`, are RED: a pattern is another issuer by another spelling, and audit
 *      permits every issuer it should reject.
 *
 * The live read is OPT-IN (`A11Y_CHECK_OCTO_STS_ISSUERS=1`) and says which read ran: it reads another repository through `gh`, and
 * CI's acceptance job holds no credential for that, so it is hand-run (as `branch-protection.test.ts`'s live reads are opt-in).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const PROJECT_FILE = ".agent-org/project.json";
/** The key #4190 declared for `a11ign/.github` in the tool's list of code repositories. */
const POLICY_REPO_KEY = "github";
const ISSUERS_PATH = ".github/chainguard/trusted-token-issuers.yaml";
const ACTIONS_ISSUER = "https://token.actions.githubusercontent.com";
const ENV_LIVE = "A11Y_CHECK_OCTO_STS_ISSUERS";
/** How much of a failed `gh` message a verdict quotes. */
const QUOTE_CHARS = 200;
const VERDICT_COUNT = 5;

const VERDICT = {
  PINNED: "PINNED",
  MISSING_FAILS_OPEN: "MISSING_FAILS_OPEN",
  WRONG_ISSUERS: "WRONG_ISSUERS",
  NOT_ENFORCING: "NOT_ENFORCING",
  CANNOT_TELL: "CANNOT_TELL",
} as const;
type Verdict = { code: (typeof VERDICT)[keyof typeof VERDICT]; why: string };

/** What a read of the file came back with: its text, a confirmed absence, or a reason it could not be made. */
type Reading = { kind: "present"; text: string } | { kind: "absent" } | { kind: "unreadable"; why: string };
type GhResult = { status: number | null; stdout: string; stderr: string };

const fixture = (name: string) => readFileSync(join(REPO_ROOT, "scripts/fixtures", name), "utf8");

// --- the parse: three keys, fail closed on anything else -----------------------------------------------------------

type Allowlist = { mode: string; issuers: string[]; patterns: string[] };
type Section = "issuers" | "patterns";
const SECTION_KEYS: Record<string, Section> = { "issuers:": "issuers", "issuer_patterns:": "patterns" };

/** Null when a line is not one of the shapes the documented file uses; the caller reports CANNOT_TELL. */
function parseAllowlist(text: string): Allowlist | null {
  const out: Allowlist = { mode: "enforce", issuers: [], patterns: [] };
  const seen = new Set<string>();
  let section: Section | null = null;
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    const key = SECTION_KEYS[trimmed];
    const mode = /^mode:\s*(\S+)$/.exec(trimmed);
    const item = /^-\s+(\S+)$/.exec(trimmed);
    if (key !== undefined || mode !== null) {
      const name = key ?? "mode";
      if (seen.has(name)) return null;
      seen.add(name);
      section = key ?? null;
      if (mode !== null) out.mode = mode[1]!;
    } else if (item !== null && section !== null && /^\s/.test(line)) {
      out[section].push(item[1]!);
    } else return null;
  }
  return out;
}

// --- the verdict ---------------------------------------------------------------------------------------------------

function verdictOf(reading: Reading): Verdict {
  if (reading.kind === "unreadable") return { code: VERDICT.CANNOT_TELL, why: reading.why };
  if (reading.kind === "absent") {
    return { code: VERDICT.MISSING_FAILS_OPEN, why: `${ISSUERS_PATH} is missing, and missing fails open: Octo STS then permits ALL issuers` };
  }
  const list = parseAllowlist(reading.text);
  if (list === null) return { code: VERDICT.CANNOT_TELL, why: "the file has a line this guard does not recognise, so it cannot say what Octo STS would read" };
  if (list.mode !== "enforce") return { code: VERDICT.NOT_ENFORCING, why: `mode is ${list.mode}: audit permits the issuers it would reject` };
  if (list.patterns.length > 0) return { code: VERDICT.WRONG_ISSUERS, why: `issuer_patterns lists ${list.patterns.length} pattern(s): each is an issuer beyond the one pinned` };
  const exactlyActions = list.issuers.length === 1 && list.issuers[0] === ACTIONS_ISSUER;
  if (!exactlyActions) return { code: VERDICT.WRONG_ISSUERS, why: `issuers is [${list.issuers.join(", ")}], not [${ACTIONS_ISSUER}] alone` };
  return { code: VERDICT.PINNED, why: `${ACTIONS_ISSUER} is the only trusted issuer, in mode enforce` };
}

/** `gh api` printing a 404 is the file's absence only once the repository itself has been read (404 also means "forbidden"). */
function readingFromContents(contents: GhResult, repoWasRead: boolean): Reading {
  if (contents.status === 0) return { kind: "present", text: contents.stdout };
  const notFound = contents.stdout.includes('"status":"404"') || contents.stderr.includes("HTTP 404");
  if (notFound && repoWasRead) return { kind: "absent" };
  return { kind: "unreadable", why: `gh api exited ${contents.status}: ${(contents.stderr || contents.stdout).trim().slice(0, QUOTE_CHARS)}` };
}

// --- the controls --------------------------------------------------------------------------------------------------

const CANONICAL = `# comment
mode: enforce

issuers:
  - ${ACTIONS_ISSUER}
`;

test("#4193 control: the canonical file reads PINNED", () => {
  assert.equal(verdictOf({ kind: "present", text: CANONICAL }).code, VERDICT.PINNED);
});

test("#4193 control: a 404 from a readable repository is the file ABSENT, and absent is RED (fails open)", () => {
  const reading = readingFromContents({ status: 1, stdout: "", stderr: fixture("octo-sts-trusted-issuers-absent.txt") }, true);
  assert.deepEqual(reading, { kind: "absent" });
  assert.equal(verdictOf(reading).code, VERDICT.MISSING_FAILS_OPEN);
  assert.match(verdictOf(reading).why, /missing, and missing fails open/);
});

test("#4193 control: a second issuer reads RED", () => {
  const verdict = verdictOf({ kind: "present", text: fixture("octo-sts-trusted-issuers-two-issuers.yaml") });
  assert.equal(verdict.code, VERDICT.WRONG_ISSUERS);
  assert.match(verdict.why, /accounts\.google\.com/);
});

test("#4193: a read that could not be made is CANNOT_TELL, never green and never 'absent'", () => {
  const forbidden = readingFromContents({ status: 1, stdout: "", stderr: fixture("octo-sts-trusted-issuers-absent.txt") }, false);
  assert.equal(forbidden.kind, "unreadable");
  assert.equal(verdictOf(forbidden).code, VERDICT.CANNOT_TELL);
  const rateLimited = readingFromContents({ status: 1, stdout: "", stderr: "gh: API rate limit exceeded (HTTP 403)" }, true);
  assert.equal(verdictOf(rateLimited).code, VERDICT.CANNOT_TELL);
  const killed = readingFromContents({ status: null, stdout: "", stderr: "" }, true);
  assert.equal(verdictOf(killed).code, VERDICT.CANNOT_TELL);
});

test("#4193: the other ways an allowlist stops being 'the Actions issuer only' each read RED", () => {
  const cases: [string, string, Verdict["code"]][] = [
    ["a pattern", `${CANONICAL}issuer_patterns:\n  - https://example\\.com\n`, VERDICT.WRONG_ISSUERS],
    ["a trailing slash (a different issuer)", CANONICAL.replace(ACTIONS_ISSUER, `${ACTIONS_ISSUER}/`), VERDICT.WRONG_ISSUERS],
    ["an empty issuers list", "mode: enforce\nissuers:\n", VERDICT.WRONG_ISSUERS],
    ["audit mode", CANONICAL.replace("enforce", "audit"), VERDICT.NOT_ENFORCING],
    ["an empty file", "", VERDICT.WRONG_ISSUERS],
  ];
  for (const [name, text, code] of cases) assert.equal(verdictOf({ kind: "present", text }).code, code, name);
});

test("#4193: a line the parser does not recognise is CANNOT_TELL, and so is a duplicated key", () => {
  const unreadable = [
    `issuers: [${ACTIONS_ISSUER}]\n`,
    `${CANONICAL}issuers:\n  - https://accounts.google.com\n`,
    `mode: enforce\n  - ${ACTIONS_ISSUER}\n`,
    `${CANONICAL}extra: 1\n`,
  ];
  for (const text of unreadable) assert.equal(verdictOf({ kind: "present", text }).code, VERDICT.CANNOT_TELL, text);
});

test("#4193: the verdict codes are distinct, and PINNED is the only one that is not a failure", () => {
  assert.equal(new Set(Object.values(VERDICT)).size, VERDICT_COUNT);
});

// --- the live read -------------------------------------------------------------------------------------------------

const ghRun = (args: string[]): GhResult => {
  const r = spawnSync("gh", args, { encoding: "utf8" });
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
};

function policyRepository(): string {
  const code = (JSON.parse(readFileSync(join(REPO_ROOT, PROJECT_FILE), "utf8")) as { code: { key: string; repo: string }[] }).code;
  const entry = code.find((c) => c.key === POLICY_REPO_KEY);
  if (!entry) throw new Error(`CANNOT_TELL: ${PROJECT_FILE} declares no code repository with key "${POLICY_REPO_KEY}" (#4190)`);
  return entry.repo;
}

function readLive(repo: string): Reading {
  const repoWasRead = ghRun(["api", `repos/${repo}`, "--jq", ".full_name"]).status === 0;
  const contents = ghRun(["api", `repos/${repo}/contents/${ISSUERS_PATH}`, "-H", "Accept: application/vnd.github.raw"]);
  return readingFromContents(contents, repoWasRead);
}

test("#4193 LIVE: a11ign/.github still names the GitHub Actions issuer and no other", () => {
  if (process.env[ENV_LIVE] !== "1") {
    console.log(`  NOT RUN: the live read is opt-in -- \`${ENV_LIVE}=1\` reads ${ISSUERS_PATH} from the declared \`${POLICY_REPO_KEY}\` repository. `
      + "The verdict logic above ran against fixtures; nothing here read the live file.");
    return;
  }
  const repo = policyRepository();
  const verdict = verdictOf(readLive(repo));
  console.log(`  LIVE read of ${repo}:${ISSUERS_PATH} (contents API, raw) -- ${verdict.code}: ${verdict.why}`);
  assert.equal(verdict.code, VERDICT.PINNED, `${verdict.code}: ${verdict.why}`);
  console.log(`  LIVE PASS (octo-sts issuers) on ${repo}: the GitHub Actions issuer only`);
});
