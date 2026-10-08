// no-token: gh -- every test below drives a pure checker over fixtures, a temp directory, and this repository's own `.github/chainguard/`;
// the `gh api` reads (`ghApiRead`, in `gh-api-read.mjs`) are reached only from the live test, which returns before it unless
// `A11Y_CHECK_OCTO_STS_POLICIES=1`, and the acceptance job sets neither that nor a token.
/**
 * #4192: NO OCTO STS POLICY MAY NAME OR GRANT ON `corpus-backups` OR `auth-capture-check`.
 *
 * The Octo STS GitHub App is installed on those two repositories as well as on the code repositories, and only a POLICY grants anything.
 * So "the app can never reach those two" is a property of every `.sts.yaml`, and it is written here BEFORE the first policy exists
 * (`ceo`, row 4 of the Octo STS order).
 *
 * THE POLICY SYNTAX IS OCTO STS v0.11.2's (`octo-sts/app`, released 2026-10-06; read from its README, its `octosts.TrustPolicy.json` and
 * `octosts.OrgTrustPolicy.json` schemas and `pkg/octosts/octosts.go`'s `lookupInstallAndTrustPolicy`, 2026-10-08). What that source says:
 *
 *   - A policy is `.github/chainguard/<identity>.sts.yaml`, in the repository the token is scoped to, or in the organisation's policy
 *     repository (`a11ign/.github`) for an ORGANISATION-LEVEL policy.
 *   - A REPOSITORY policy cannot widen itself: the server forces `Repositories = [that repository]`, and the repository schema has
 *     `additionalProperties: false` with no `repositories` key. It reaches exactly the repository it sits in.
 *   - An ORGANISATION policy carries `repositories:`, a list of repository NAMES. The schema's own words: "If not provided, all
 *     repositories available to the GitHub App within the organization are included." THAT IS THE WILDCARD FORM: an organisation policy
 *     with no `repositories:` (absent, null or `[]`) grants on every repository the app is installed on, these two included.
 *   - v0.11.2 documents no glob inside `repositories:`. An entry carrying `*`, `?` or `[` is treated as a wildcard here anyway, because
 *     a checker that waits for the server to document a pattern before refusing it has guarded nothing.
 *
 * "NAMES" is textual and deliberately broad (the row): either forbidden name anywhere in the file, in a repository list, a subject, a
 * file name's content or a COMMENT, case-insensitively (GitHub repository names are). "GRANTS" is the wildcard form above, which depends
 * on where the file lives, so the checker is told its home. A file it cannot parse as an organisation policy is assumed to grant on all.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { ghApiRead } from "./gh-api-read.mjs";

const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const FIXTURES = "scripts/fixtures";
const POLICY_DIRECTORY = ".github/chainguard";
const POLICY_SUFFIX = ".sts.yaml";
const ORG_POLICY_REPO = "a11ign/.github";

const FORBIDDEN = ["corpus-backups", "auth-capture-check"] as const;
type Forbidden = (typeof FORBIDDEN)[number];

/** Where a policy file lives decides what an absent `repositories:` means: one repository, or the whole installation. */
type PolicyHome = "repository" | "organisation";

const GLOB_CHARACTER = /[*?[]/;

/** An organisation policy's `repositories:` reads as the whole installation unless it is a non-empty list of plain names. */
function scopesWholeInstallation(policyText: string): boolean {
  let parsed: unknown;
  try {
    parsed = parseYaml(policyText);
  } catch {
    return true; // unparseable: assume the worst, never green (the catch IS the diagnostic: this verdict names the file as reaching)
  }
  const repositories = (parsed as { repositories?: unknown } | null)?.repositories;
  if (!Array.isArray(repositories) || repositories.length === 0) return true;
  return repositories.some((entry) => typeof entry !== "string" || GLOB_CHARACTER.test(entry));
}

/** The forbidden repositories this policy file reaches, by name or by grant; empty means it reaches neither. */
function policyReachesForbidden(policyText: string, home: PolicyHome): Forbidden[] {
  const lowered = policyText.toLowerCase();
  const named = FORBIDDEN.filter((name) => lowered.includes(name));
  const grantsOnAll = home === "organisation" && scopesWholeInstallation(policyText);
  return grantsOnAll ? [...FORBIDDEN] : named;
}

const readFixture = (name: string) => readFileSync(join(REPO_ROOT, FIXTURES, name), "utf8");

// --- the checker, and its positive controls ----------------------------------------------------------------

test("#4192 POSITIVE CONTROLS: each forbidden fixture is CAUGHT and the ordinary one is silent", () => {
  // The three CAUGHT cases are the controls for every emptiness assertion below: `reaches === []` passes just as well over a checker
  // that returns nothing for every input, and these fail on it.
  assert.deepEqual(policyReachesForbidden(readFixture("octo-sts-policy-names-corpus-backups.sts.yaml"), "organisation"), ["corpus-backups"]);
  assert.deepEqual(policyReachesForbidden(readFixture("octo-sts-policy-names-auth-capture-check.sts.yaml"), "organisation"), ["auth-capture-check"]);
  assert.deepEqual(policyReachesForbidden(readFixture("octo-sts-policy-whole-organisation.sts.yaml"), "organisation"), [...FORBIDDEN]);
  assert.deepEqual(policyReachesForbidden(readFixture("octo-sts-policy-ordinary.sts.yaml"), "organisation"), []);
});

test("#4192: naming is caught in a repository policy too, and the ordinary fixture is silent in both homes", () => {
  assert.deepEqual(policyReachesForbidden(readFixture("octo-sts-policy-names-corpus-backups.sts.yaml"), "repository"), ["corpus-backups"]);
  assert.deepEqual(policyReachesForbidden(readFixture("octo-sts-policy-names-auth-capture-check.sts.yaml"), "repository"), ["auth-capture-check"]);
  assert.deepEqual(policyReachesForbidden(readFixture("octo-sts-policy-ordinary.sts.yaml"), "repository"), []);
});

test("#4192: the whole-organisation grant is a property of the HOME: a repository policy reaches only its own repository", () => {
  const wholeOrganisation = readFixture("octo-sts-policy-whole-organisation.sts.yaml");
  assert.deepEqual(policyReachesForbidden(wholeOrganisation, "repository"), [], "a repository policy with no `repositories:` is scoped to its own repository by the server");
  assert.deepEqual(policyReachesForbidden(wholeOrganisation, "organisation"), [...FORBIDDEN]);
});

test("#4192: every spelling of the wildcard form, and a name hidden in a comment or in another case, is caught", () => {
  const head = "issuer: https://token.actions.githubusercontent.com\nsubject: repo:a11ign/a11ign:ref:refs/heads/main\npermissions:\n  contents: read\n";
  const wildcardForms = {
    "no repositories key": head,
    "repositories: null": `${head}repositories:\n`,
    "repositories: []": `${head}repositories: []\n`,
    "repositories: a string": `${head}repositories: "*"\n`,
    "a star entry": `${head}repositories: ["*"]\n`,
    "a glob entry": `${head}repositories: [a11ign, "corpus-*"]\n`,
    "a non-string entry": `${head}repositories: [a11ign, 7]\n`,
    "unparseable": `${head}repositories: [unclosed\n`,
  };
  for (const [label, text] of Object.entries(wildcardForms)) {
    assert.deepEqual(policyReachesForbidden(text, "organisation"), [...FORBIDDEN], `the wildcard form "${label}" slipped through`);
  }
  assert.deepEqual(policyReachesForbidden(`# covers Corpus-Backups too\n${head}repositories: [a11ign]\n`, "organisation"), ["corpus-backups"]);
  assert.deepEqual(policyReachesForbidden(`${head}# also AUTH-CAPTURE-CHECK\n`, "repository"), ["auth-capture-check"]);
  assert.deepEqual(policyReachesForbidden(`${head}repositories: [a11ign, screenreader-worker]\n`, "organisation"), []);
});

// --- population 1: this repository's `.github/chainguard/` -------------------------------------------------

type PolicyFile = { name: string; text: string };

/** Every `*.sts.yaml` directly under `directory`; a directory that does not exist holds none (the case today), anything else unreadable throws. */
function readPolicyDirectory(directory: string): PolicyFile[] {
  let names: string[];
  try {
    names = readdirSync(directory);
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw new Error(`could not list ${directory}`, { cause });
  }
  return names.filter((n) => n.endsWith(POLICY_SUFFIX)).sort().map((name) => ({ name, text: readFileSync(join(directory, name), "utf8") }));
}

const offenders = (files: PolicyFile[], home: PolicyHome) =>
  files.map((f) => ({ file: f.name, reaches: policyReachesForbidden(f.text, home) })).filter((o) => o.reaches.length > 0);

test("#4192 POSITIVE CONTROL for the directory scan: a policy naming a forbidden repository, put where the scan looks, is found", () => {
  // The scan returning [] over THIS repository's directory is only evidence if the scan can find a bad file at all; here it is shown to,
  // and to leave an ordinary file alone. This is where the emptiness assertion below points.
  const dir = join(mkdtempSync(join(tmpdir(), "octo-sts-policies-")), "chainguard");
  mkdirSync(dir);
  writeFileSync(join(dir, "bad.sts.yaml"), readFixture("octo-sts-policy-names-corpus-backups.sts.yaml"));
  writeFileSync(join(dir, "fine.sts.yaml"), readFixture("octo-sts-policy-ordinary.sts.yaml"));
  writeFileSync(join(dir, "ignored.md"), "corpus-backups");
  const files = readPolicyDirectory(dir);
  assert.deepEqual(files.map((f) => f.name), ["bad.sts.yaml", "fine.sts.yaml"]);
  assert.deepEqual(offenders(files, "repository"), [{ file: "bad.sts.yaml", reaches: ["corpus-backups"] }]);
  assert.deepEqual(readPolicyDirectory(join(dir, "does-not-exist")), []);
});

test("#4192: no policy in this repository's .github/chainguard/ names or grants on corpus-backups or auth-capture-check", () => {
  const files = readPolicyDirectory(join(REPO_ROOT, POLICY_DIRECTORY));
  console.log(`  READ ${files.length} policy file(s) in ${POLICY_DIRECTORY}/ of this repository${files.length ? `: ${files.map((f) => f.name).join(", ")}` : " (none yet: the controls above are what keep this from being vacuous)"}`);
  assert.deepEqual(offenders(files, "repository"), [], "a policy reaches a repository the Octo STS app must never reach");
});

// --- population 2: `a11ign/.github`'s `.github/chainguard/`, read through the contents API -------------------

const LIVE_SWITCH = "A11Y_CHECK_OCTO_STS_POLICIES";

type DirectoryEntry = { name: string; type: string };
type LiveRead = { state: "READ"; files: PolicyFile[] } | { state: "CANNOT_TELL"; why: string };

/**
 * `ghApiRead` reports 403 and 404 alike as `refused`, so a refused listing is "no such directory" OR "you may not look", and only the first
 * is an empty population. Told apart by walking down from the repository root, which is listable whenever the repository is: the
 * directory is absent only when some listing on the way shows its next segment missing. A listing that is itself refused, or that shows
 * the whole path present (so the refusal was a 403), is CANNOT_TELL.
 */
function directoryAbsence(read: typeof ghApiRead): LiveRead {
  let path = "";
  for (const segment of POLICY_DIRECTORY.split("/")) {
    const listing = read(`repos/${ORG_POLICY_REPO}/contents${path === "" ? "" : `/${path}`}`);
    if (listing.kind !== "ok" || !Array.isArray(listing.value)) {
      return { state: "CANNOT_TELL", why: `the policy directory listing was refused and ${path || "the repository root"} could not be listed to tell absent from forbidden` };
    }
    if (!(listing.value as DirectoryEntry[]).some((e) => e.name === segment)) return { state: "READ", files: [] };
    path = path === "" ? segment : `${path}/${segment}`;
  }
  return { state: "CANNOT_TELL", why: "the policy directory exists but its listing was refused (403): policies may be there that were not read" };
}

/** Lists the org policy repository's policy directory and fetches every policy; any read that failed makes the whole population CANNOT_TELL. */
function readOrgPolicies(read: typeof ghApiRead): LiveRead {
  const repo = read(`repos/${ORG_POLICY_REPO}`);
  if (repo.kind !== "ok") return { state: "CANNOT_TELL", why: `${ORG_POLICY_REPO} itself could not be read (${repo.kind === "refused" ? "403/404: absent or forbidden" : repo.why})` };
  const listing = read(`repos/${ORG_POLICY_REPO}/contents/${POLICY_DIRECTORY}`);
  if (listing.kind === "refused") return directoryAbsence(read);
  if (listing.kind !== "ok" || !Array.isArray(listing.value)) return { state: "CANNOT_TELL", why: `the policy directory listing was unreadable${listing.kind === "unreadable" ? `: ${listing.why}` : ""}` };
  const files: PolicyFile[] = [];
  for (const entry of (listing.value as DirectoryEntry[]).filter((e) => e.type === "file" && e.name.endsWith(POLICY_SUFFIX))) {
    const body = read(`repos/${ORG_POLICY_REPO}/contents/${POLICY_DIRECTORY}/${entry.name}`);
    const content = body.kind === "ok" ? (body.value as { content?: unknown }).content : undefined;
    if (typeof content !== "string") return { state: "CANNOT_TELL", why: `${entry.name} could not be fetched, so it is not known whether it reaches a forbidden repository` };
    files.push({ name: entry.name, text: Buffer.from(content, "base64").toString("utf8") });
  }
  return { state: "READ", files };
}

test("#4192 POSITIVE CONTROL for the live read: an unreadable policy is CANNOT_TELL, never an empty population", () => {
  const listing = { kind: "ok", value: [{ name: "x.sts.yaml", type: "file" }] } as const;
  const repo = { kind: "ok", value: {} } as const;
  const asked = (answers: Record<string, ReturnType<typeof ghApiRead>>) => (path: string) => answers[path] ?? { kind: "unreadable" as const, why: "no stub" };
  const dir = `repos/${ORG_POLICY_REPO}/contents/${POLICY_DIRECTORY}`;
  assert.equal(readOrgPolicies(asked({ [`repos/${ORG_POLICY_REPO}`]: repo, [dir]: listing })).state, "CANNOT_TELL");
  assert.equal(readOrgPolicies(asked({ [`repos/${ORG_POLICY_REPO}`]: { kind: "refused" }, [dir]: { kind: "refused" } })).state, "CANNOT_TELL");
  assert.equal(readOrgPolicies(asked({})).state, "CANNOT_TELL");
  const body = Buffer.from(readFixture("octo-sts-policy-names-corpus-backups.sts.yaml")).toString("base64");
  const read = readOrgPolicies(asked({ [`repos/${ORG_POLICY_REPO}`]: repo, [dir]: listing, [`${dir}/x.sts.yaml`]: { kind: "ok", value: { content: body } } }));
  assert.equal(read.state, "READ");
  assert.deepEqual(read.state === "READ" && offenders(read.files, "organisation"), [{ file: "x.sts.yaml", reaches: ["corpus-backups"] }]);
  const root = `repos/${ORG_POLICY_REPO}/contents`;
  const refusedListing = { [`repos/${ORG_POLICY_REPO}`]: repo, [dir]: { kind: "refused" } } as const;
  const entries = (...names: string[]) => ({ kind: "ok", value: names.map((name) => ({ name, type: "dir" })) }) as const;
  // absent: the root has no `.github`, or `.github` has no `chainguard` (404)
  assert.deepEqual(readOrgPolicies(asked({ ...refusedListing, [root]: entries("README.md") })), { state: "READ", files: [] });
  assert.deepEqual(readOrgPolicies(asked({ ...refusedListing, [root]: entries(".github"), [`${root}/.github`]: entries("workflows") })), { state: "READ", files: [] });
  // forbidden (403): every segment is listed as present, so the refusal was not "absent"
  assert.equal(readOrgPolicies(asked({ ...refusedListing, [root]: entries(".github"), [`${root}/.github`]: entries("chainguard") })).state, "CANNOT_TELL");
  // a listing on the way is refused too: cannot tell absent from forbidden
  assert.equal(readOrgPolicies(asked({ ...refusedListing, [root]: { kind: "refused" } })).state, "CANNOT_TELL");
  assert.equal(readOrgPolicies(asked({ ...refusedListing, [root]: entries(".github"), [`${root}/.github`]: { kind: "refused" } })).state, "CANNOT_TELL");
  assert.equal(readOrgPolicies(asked(refusedListing)).state, "CANNOT_TELL");
});

test("#4192 LIVE: no policy in a11ign/.github's .github/chainguard/ names or grants on corpus-backups or auth-capture-check", () => {
  if (process.env[LIVE_SWITCH] !== "1") {
    console.log(`  NOT READ: the ${ORG_POLICY_REPO} population is opt-in -- \`${LIVE_SWITCH}=1 npx rstest run --config scripts/rstest/rstest.config.mjs `
      + "--include packages/guards/src/octo-sts-policies.test.ts --disableConsoleIntercept` asks GitHub. That population was NOT read, which is not the same as empty.");
    return;
  }
  const live = readOrgPolicies(ghApiRead);
  if (live.state === "CANNOT_TELL") {
    console.log(`  CANNOT_TELL ${ORG_POLICY_REPO}: ${live.why}`);
    assert.fail(`CANNOT_TELL: ${live.why}`);
  }
  console.log(`  READ ${live.files.length} policy file(s) in ${ORG_POLICY_REPO}'s ${POLICY_DIRECTORY}/ through the contents API${live.files.length ? `: ${live.files.map((f) => f.name).join(", ")}` : ""}`);
  assert.deepEqual(offenders(live.files, "organisation"), [], "an organisation policy reaches a repository the Octo STS app must never reach");
});
