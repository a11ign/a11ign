// no-token: gh -- every test below drives pure functions or reads two committed files; the one `gh api` read
// (`ghApiRead`, in `gh-api-read.mjs`) is reached only from the live test, which returns before it unless
// `A11Y_CHECK_MAIN_RULESET=1`, and the acceptance job sets neither that nor a token.
/**
 * #3123 (ADR 0039 item 5): EVERY CODE REPOSITORY CARRIES THE REVIEW REQUIREMENT AND THE MERGE QUEUE, AND
 * THAT IS PROVABLE BEFORE ITS FIRST PUSH.
 *
 * `branch-protection.test.ts` read exactly one repository, `a11ign/a11ign`, from five literals. A second
 * code repository could therefore be unprotected -- or empty, as `a11ign/screenreader-worker` was created,
 * with no branch, no rule and no ruleset -- with every check green, and a push to a public repository is
 * published the moment it lands. This file is the part of that guard which is about the SET of repositories
 * rather than about one of them.
 *
 * ONE LIST, NOT TWO. `.agent-org/project.json`'s `code` array is the declared list of code repositories,
 * and the `agent-org` tool owns its schema. It carries `key` and `repo` only, so the two facts this guard
 * needs and the tool does not hold -- a default branch and a required check name -- live in
 * `docs/code-repository-protection.json`, KEYED BY `repo`. The ADR's own `docs/code-repositories.json` is
 * deliberately not created: item 2 landed as the `code` array, and a second list is a second place to
 * forget a repository.
 *
 * WHAT IS ASSERTED, in the order a reader needs it:
 *
 *   1. every repository in the `code` array has an entry here (a REFUSAL, naming the one that has not);
 *   2. the live read, opt-in under `A11Y_CHECK_MAIN_RULESET=1` exactly as in `branch-protection.test.ts`,
 *      reads every entry and names each missing surface. An unreadable repository is CANNOT_TELL, never a
 *      pass: `404` from these endpoints means absent OR forbidden, so only a branch that is READ as absent
 *      may be called absent, and anything else is "could not look".
 *
 * WHAT THE LIVE READ DOES NOT CLAIM. It reads the surfaces a token without admin can read (the ruleset's
 * rules) and TRIES the one it cannot (classic protection, admin-only). `PARTLY_READ` is a named verdict
 * for that case and lists what was not read, because "the rule exists" and "nobody is exempt" are different
 * claims (`.claude/rules/main-review-requirement.md`): the exemption half is `branch-protection.test.ts`'s,
 * whose instrument the creation runbook (`docs/new-code-repository.md`) says to name.
 *
 * THE ONE THING THIS DOES NOT DO is create anything. Making the ruleset and the protection is an admin's
 * act, and the first push is the one unprotected write.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { ghApiRead } from "./gh-api-read.mjs";
import { SECRET_HOLDER } from "./auto-arm-identity.ts";

const REPO_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const PROJECT_FILE = ".agent-org/project.json";
const PROTECTION_FILE = "docs/code-repository-protection.json";
/** The guard that must stop naming a repository: the row's done-when 1, scanned below. */
const GUARD = "packages/lab/src/packaging/branch-protection.test.ts";
/** The one repository whose literal the guard used to carry. */
const FORMER_LITERAL = "a11ign/a11ign";

type Entry = { repo: string; defaultBranch: string; requiredCheck: string; publishes: boolean };
type ProtectionFile = { repositories: Entry[] };
type ProjectFile = { code: { key: string; repo: string }[]; tracker: { repo: string }[] };

const readJson = <T>(path: string): T => JSON.parse(readFileSync(join(REPO_ROOT, path), "utf8")) as T;

// --- the declaration: every listed repository has an entry ------------------------------------------------

const OWNER_NAME = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

/** What is wrong with the entries themselves, one sentence each; empty means every entry is usable. */
function entryProblems(entries: Entry[]): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    if (typeof entry.repo !== "string" || !OWNER_NAME.test(entry.repo)) {
      problems.push(`an entry's \`repo\` is not owner/name: ${JSON.stringify(entry.repo)}`);
      continue;
    }
    if (seen.has(entry.repo)) problems.push(`${entry.repo} has two entries, so which default branch is read is a coin toss`);
    seen.add(entry.repo);
    for (const field of ["defaultBranch", "requiredCheck"] as const) {
      const value: unknown = entry[field];
      if (typeof value !== "string" || value.trim() === "") problems.push(`${entry.repo} has no \`${field}\``);
    }
    if (typeof entry.publishes !== "boolean") problems.push(`${entry.repo} says nowhere whether it publishes: \`publishes\` must be true or false`);
  }
  return problems;
}

/** The declared repositories that no entry covers. A repository nobody can read is not a protected one. */
function uncovered(declared: string[], entries: Entry[]): string[] {
  const covered = new Set(entries.map((e) => e.repo));
  return declared.filter((repo) => !covered.has(repo));
}

const declaredRepositories = (): string[] => readJson<ProjectFile>(PROJECT_FILE).code.map((c) => c.repo);
const protectionEntries = (): Entry[] => readJson<ProtectionFile>(PROTECTION_FILE).repositories;

test("#3123 ANTI-VACUITY: the declared list is non-empty, so the coverage assertion below has something to cover", () => {
  // THE POSITIVE CONTROL for every emptiness assertion in this file: `uncovered(...) === []` passes just as
  // well when the declared list was read as empty. This one fails on that, and so does the fixture below.
  assert.ok(declaredRepositories().length >= 1, `${PROJECT_FILE} declares no code repository, or the read is broken`);
  assert.ok(protectionEntries().length >= 1, `${PROTECTION_FILE} has no entry, or the read is broken`);
});

test("#3123: every code repository in `.agent-org/project.json` has an entry with a default branch and a check", () => {
  const entries = protectionEntries();
  assert.deepEqual(uncovered(declaredRepositories(), entries), [],
    `a code repository has no entry in ${PROTECTION_FILE}: the live read would have nothing to read, and the nightly `
    + "would skip it silently. Add its default branch and its required check name");
  assert.deepEqual(entryProblems(entries), []);
});

/**
 * Repositories that are PROTECTED and have an entry but are not yet in `.agent-org/project.json`'s `code` array,
 * because declaring one is a host act (a `host.json` clone) and not this file's. The coverage assertion above
 * reads only the declared list, so without this one deleting such an entry would stay green (#3176 review).
 * Remove a name from here when `code` declares it: the assertion above covers it from then on.
 */
const protectedBeforeDeclared = ["a11ign/screenreader-worker"];

test("#3176: a repository protected before it is declared still has its entry, with a default branch and a check", () => {
  const entries = protectionEntries();
  assert.deepEqual(uncovered(protectedBeforeDeclared, entries), [],
    `a repository that was seeded and protected has no entry in ${PROTECTION_FILE}: the read-back returns CANNOT_TELL`);
  const covered = entries.filter((e) => protectedBeforeDeclared.includes(e.repo));
  assert.equal(covered.length, protectedBeforeDeclared.length);
  assert.deepEqual(entryProblems(covered), []);
});

test("#3176 POSITIVE CONTROL: the protected-before-declared list is non-empty and is refused against an entry-less file", () => {
  assert.ok(protectedBeforeDeclared.length >= 1, "the list is empty, so the assertion above covers nothing");
  const withoutIt: Entry[] = [{ repo: "a11ign/a11ign", defaultBranch: "main", requiredCheck: "gate", publishes: false }];
  assert.deepEqual(uncovered(protectedBeforeDeclared, withoutIt), protectedBeforeDeclared);
});

test("#3123 POSITIVE CONTROL: a declared repository with no entry is REFUSED, and the refusal names it", () => {
  const fixtureEntries: Entry[] = [{ repo: "a11ign/has-an-entry", defaultBranch: "main", requiredCheck: "gate", publishes: false }];
  const missing = uncovered(["a11ign/has-an-entry", "a11ign/has-none"], fixtureEntries);
  assert.deepEqual(missing, ["a11ign/has-none"]);
  // And the control is not a spelling of the real assertion passing: the real list against the fixture fails.
  assert.notDeepEqual(uncovered(declaredRepositories(), fixtureEntries), []);
});

test("#3123: a malformed or duplicated entry is a problem, each one named", () => {
  const entries = [
    { repo: "a11ign/twice", defaultBranch: "main", requiredCheck: "gate", publishes: false },
    { repo: "a11ign/twice", defaultBranch: "main", requiredCheck: "gate", publishes: false },
    { repo: "a11ign/no-check", defaultBranch: "main", requiredCheck: "", publishes: false },
    { repo: "not-owner-name", defaultBranch: "main", requiredCheck: "gate", publishes: false },
  ] as Entry[];
  const problems = entryProblems(entries);
  assert.equal(problems.length, 3);
  assert.match(problems.join("\n"), /a11ign\/twice has two entries/);
  assert.match(problems.join("\n"), /a11ign\/no-check has no `requiredCheck`/);
  assert.match(problems.join("\n"), /not-owner-name/);
});

// --- done-when 1: the guard names no repository -----------------------------------------------------------

/** The row's own scan: a line that is not a comment line and carries the literal. */
function literalLines(text: string, literal: string): string[] {
  return text.split("\n").filter((line) => line.includes(literal) && !/^\s*(\*|\/\/|\/\*)/.test(line));
}

test("#3123 POSITIVE CONTROL: the literal scan sees a code line and skips a comment line", () => {
  const fixture = [` * prose naming ${FORMER_LITERAL}`, `// ${FORMER_LITERAL}`,
    `  readApi(["api", "repos/${FORMER_LITERAL}/branches/main"]);`].join("\n");
  assert.deepEqual(literalLines(fixture, FORMER_LITERAL), [`  readApi(["api", "repos/${FORMER_LITERAL}/branches/main"]);`]);
});

test("#3123: `branch-protection.test.ts` carries no repository literal on a non-comment line", () => {
  assert.deepEqual(literalLines(readFileSync(join(REPO_ROOT, GUARD), "utf8"), FORMER_LITERAL), [],
    `${GUARD} names ${FORMER_LITERAL} in code again: it must take its repository from ${PROTECTION_FILE}`);
});

// --- the live read: a verdict per repository, naming each missing surface ---------------------------------

/** One endpoint's answer. `refused` is a 403/404, which means absent OR forbidden and decides nothing alone. */
type Read<T> = { kind: "ok"; value: T } | { kind: "refused" } | { kind: "unreadable"; why: string };
type BranchRule = {
  type: string;
  parameters?: { required_approving_review_count?: number; required_status_checks?: { context: string }[] };
};
type ClassicBody = {
  required_pull_request_reviews?: { required_approving_review_count?: number };
  enforce_admins?: { enabled?: boolean };
  required_status_checks?: { contexts?: string[]; checks?: { context: string }[] };
};
type RepoRead = { branch: Read<unknown>; rules: Read<BranchRule[]>; classic: Read<ClassicBody> };

const STATE = { PRESENT: "PRESENT", ABSENT: "ABSENT", NOT_READ: "NOT_READ" } as const;
type State = (typeof STATE)[keyof typeof STATE];
type Surface = { name: string; state: State; detail: string };

/** A separate vocabulary from `branch-protection.test.ts`'s: none of these is `REQUIRED`, which needs admin. */
const REPO_VERDICT = {
  /** Every surface was read and present. */
  PROTECTED: "PROTECTED",
  /** Every readable surface is present and some were not readable by this identity: said, not hidden. */
  PARTLY_READ: "PARTLY_READ",
  /** At least one surface was READ as absent. Each is named. */
  MISSING: "MISSING",
  /** A read failed for a reason other than the documented absence. Never a pass. */
  CANNOT_TELL: "CANNOT_TELL",
} as const;
type RepoVerdictCode = (typeof REPO_VERDICT)[keyof typeof REPO_VERDICT];

const surface = (name: string, state: State, detail: string): Surface => ({ name, state, detail });

function checkNames(read: RepoRead): { rulesetChecks: string[] | null; classicChecks: string[] | null } {
  const rsc = read.rules.kind === "ok" ? read.rules.value.find((r) => r.type === "required_status_checks") : undefined;
  const classic = read.classic.kind === "ok" ? read.classic.value.required_status_checks : undefined;
  return {
    rulesetChecks: rsc ? (rsc.parameters?.required_status_checks ?? []).map((c) => c.context) : null,
    classicChecks: read.classic.kind === "ok"
      ? [...(classic?.contexts ?? []), ...(classic?.checks ?? []).map((c) => c.context)] : null,
  };
}

function rulesetSurfaces(rules: BranchRule[]): Surface[] {
  const pr = rules.find((r) => r.type === "pull_request");
  const approvals = pr?.parameters?.required_approving_review_count ?? 0;
  return [
    surface("ruleset `pull_request` rule", approvals >= 1 ? STATE.PRESENT : STATE.ABSENT,
      pr ? `requires ${approvals} approval(s)` : "no `pull_request` rule applies to the default branch"),
    surface("ruleset `merge_queue` rule", rules.some((r) => r.type === "merge_queue") ? STATE.PRESENT : STATE.ABSENT,
      rules.some((r) => r.type === "merge_queue") ? "applies" : "no `merge_queue` rule applies to the default branch"),
  ];
}

function classicSurface(read: RepoRead): Surface {
  const name = "classic branch protection";
  if (read.branch.kind === "refused") return surface(name, STATE.ABSENT, "the branch does not exist, so there is nothing to attach it to (measured: 404)");
  if (read.classic.kind === "refused") {
    return surface(name, STATE.NOT_READ, "the endpoint answered 403/404 for a branch that exists: ABSENT or FORBIDDEN, and this identity cannot tell which");
  }
  if (read.classic.kind !== "ok") return surface(name, STATE.NOT_READ, "could not be asked");
  const reviews = read.classic.value.required_pull_request_reviews?.required_approving_review_count ?? 0;
  const admins = read.classic.value.enforce_admins?.enabled === true;
  const ok = reviews >= 1 && admins;
  return surface(name, ok ? STATE.PRESENT : STATE.ABSENT,
    `requires ${reviews} approval(s); enforce_admins ${admins ? "on" : "OFF"} (its exemption list is branch-protection.test.ts's read)`);
}

function checkSurface(read: RepoRead, required: string): Surface {
  const name = `required check \`${required}\``;
  const { rulesetChecks, classicChecks } = checkNames(read);
  if ((rulesetChecks ?? []).includes(required) || (classicChecks ?? []).includes(required)) return surface(name, STATE.PRESENT, "named");
  if (rulesetChecks !== null || classicChecks !== null) return surface(name, STATE.ABSENT, "a readable surface lists checks and this is not among them");
  return read.branch.kind === "refused"
    ? surface(name, STATE.ABSENT, "no branch and no rule, so nothing requires it")
    : surface(name, STATE.NOT_READ, "the ruleset carries no required-checks rule and classic protection was not readable");
}

/** The first read that failed for a reason other than absence, or null. `rules` has no benign refusal. */
function firstUnreadable(read: RepoRead): string | null {
  if (read.branch.kind === "unreadable") return `branches/<default>: ${read.branch.why}`;
  if (read.rules.kind !== "ok") return `rules/branches/<default>: ${read.rules.kind === "unreadable" ? read.rules.why : "refused (absent OR forbidden)"}`;
  if (read.classic.kind === "unreadable") return `branches/<default>/protection: ${read.classic.why}`;
  return null;
}

function repoVerdict(read: RepoRead, entry: Entry): { code: RepoVerdictCode; surfaces: Surface[]; why: string } {
  const failed = firstUnreadable(read);
  if (failed !== null || read.rules.kind !== "ok") {
    return { code: REPO_VERDICT.CANNOT_TELL, surfaces: [], why: `${failed ?? "unreadable"} -- not a pass` };
  }
  const surfaces = [...rulesetSurfaces(read.rules.value), classicSurface(read), checkSurface(read, entry.requiredCheck)];
  const missing = surfaces.filter((s) => s.state === STATE.ABSENT).map((s) => s.name);
  const unread = surfaces.filter((s) => s.state === STATE.NOT_READ).map((s) => s.name);
  if (missing.length > 0) return { code: REPO_VERDICT.MISSING, surfaces, why: `MISSING ${missing.join("; ")}` };
  if (unread.length > 0) return { code: REPO_VERDICT.PARTLY_READ, surfaces, why: `present where readable; NOT READ ${unread.join("; ")}` };
  return { code: REPO_VERDICT.PROTECTED, surfaces, why: "every surface read and present" };
}

// --- fixtures: shapes the live endpoints returned, 2026-10-03 -----------------------------------------------

const GATE: Entry = { repo: "a11ign/fixture", defaultBranch: "main", requiredCheck: "gate", publishes: false };
/** `a11ign/screenreader-worker` as created: `branches/main` 404 and `rules/branches/main` an empty list. */
const EMPTY_REPO: RepoRead = { branch: { kind: "refused" }, rules: { kind: "ok", value: [] }, classic: { kind: "refused" } };
/** `rules/branches/main` of `a11ign/a11ign`, parameters elided to what is read. */
const BOTH_RULES: BranchRule[] = [{ type: "merge_queue" }, { type: "pull_request", parameters: { required_approving_review_count: 1 } }];
const FULL_CLASSIC: ClassicBody = { required_pull_request_reviews: { required_approving_review_count: 1 },
  enforce_admins: { enabled: true }, required_status_checks: { contexts: ["gate"] } };
const withClassic = (classic: Read<ClassicBody>): RepoRead => ({ branch: { kind: "ok", value: {} }, rules: { kind: "ok", value: BOTH_RULES }, classic });

test("#3123: a repository created empty reads MISSING, and the verdict names every surface that is not there", () => {
  const v = repoVerdict(EMPTY_REPO, GATE);
  assert.equal(v.code, REPO_VERDICT.MISSING);
  for (const name of ["ruleset `pull_request` rule", "ruleset `merge_queue` rule", "classic branch protection", "required check `gate`"]) {
    assert.match(v.why, new RegExp(name.replace(/[`.]/g, "\\$&")), `the verdict did not name ${name}`);
  }
});

test("#3123: both surfaces and the check present reads PROTECTED -- the verdict can be green", () => {
  const v = repoVerdict(withClassic({ kind: "ok", value: FULL_CLASSIC }), GATE);
  assert.equal(v.code, REPO_VERDICT.PROTECTED, v.why);
});

test("#3123: classic protection not readable by this identity is PARTLY_READ and says what was not read, never PROTECTED", () => {
  const v = repoVerdict(withClassic({ kind: "refused" }), GATE);
  assert.equal(v.code, REPO_VERDICT.PARTLY_READ);
  assert.notEqual(v.code, REPO_VERDICT.PROTECTED, "a 404 on the admin endpoint is absent OR forbidden, so it certifies nothing");
  assert.match(v.why, /NOT READ classic branch protection; required check `gate`/);
});

test("#3123: classic protection READ as weak is MISSING even where the ruleset is fine", () => {
  const weak: ClassicBody = { ...FULL_CLASSIC, enforce_admins: { enabled: false } };
  const v = repoVerdict(withClassic({ kind: "ok", value: weak }), GATE);
  assert.equal(v.code, REPO_VERDICT.MISSING);
  assert.match(v.why, /classic branch protection/);
});

test("#3123: a `pull_request` rule that asks for 0 approvals is not the requirement", () => {
  const rules: BranchRule[] = [{ type: "merge_queue" }, { type: "pull_request", parameters: { required_approving_review_count: 0 } }];
  const v = repoVerdict({ ...withClassic({ kind: "ok", value: FULL_CLASSIC }), rules: { kind: "ok", value: rules } }, GATE);
  assert.equal(v.code, REPO_VERDICT.MISSING);
  assert.match(v.why, /ruleset `pull_request` rule/);
});

test("#3123: the required check is read from the ruleset's own rule where classic is not readable", () => {
  // `a11ign/agent-org` carries `gate` as a `required_status_checks` rule, so a non-admin can confirm it.
  const rules: BranchRule[] = [...BOTH_RULES,
    { type: "required_status_checks", parameters: { required_status_checks: [{ context: "gate" }] } }];
  const read: RepoRead = { ...withClassic({ kind: "refused" }), rules: { kind: "ok", value: rules } };
  assert.match(repoVerdict(read, GATE).why, /NOT READ classic branch protection$/);
  const wrong = repoVerdict(read, { ...GATE, requiredCheck: "some-other-check" });
  assert.equal(wrong.code, REPO_VERDICT.MISSING);
  assert.match(wrong.why, /required check `some-other-check`/);
});

test("#3123: an unreadable repository is CANNOT_TELL -- a 404 on `rules` is absent OR forbidden, never 'no rules'", () => {
  for (const [label, read] of [
    ["rules refused", { ...EMPTY_REPO, rules: { kind: "refused" } }],
    ["rules unreadable", { ...EMPTY_REPO, rules: { kind: "unreadable", why: "HTTP 502" } }],
    ["branch unreadable", { ...EMPTY_REPO, branch: { kind: "unreadable", why: "HTTP 500" } }],
    ["classic unreadable", { ...withClassic({ kind: "unreadable", why: "network" }) }],
  ] as [string, RepoRead][]) {
    const v = repoVerdict(read, GATE);
    assert.equal(v.code, REPO_VERDICT.CANNOT_TELL, `${label} must not read as a verdict about the repository`);
    assert.match(v.why, /not a pass/);
  }
});

test("#3123: the four verdicts are genuinely distinct, and none is a spelling of branch-protection's REQUIRED", () => {
  assert.equal(new Set(Object.values(REPO_VERDICT)).size, 4);
  assert.equal((Object.values(REPO_VERDICT) as string[]).includes("REQUIRED"), false);
});

// --- the live read, over every entry ----------------------------------------------------------------------

const ghRead = <T>(path: string): Read<T> => ghApiRead(path) as Read<T>;

function liveRead({ repo, defaultBranch }: Entry): RepoRead {
  return {
    branch: ghRead(`repos/${repo}/branches/${defaultBranch}`),
    rules: ghRead(`repos/${repo}/rules/branches/${defaultBranch}`),
    classic: ghRead(`repos/${repo}/branches/${defaultBranch}/protection`),
  };
}

/**
 * Every declared entry, or ONE repository when `A11Y_PROTECTION_REPO` names it. A repository with no entry --
 * which is what a repository about to be created is -- needs `A11Y_PROTECTION_BRANCH` as well and reads
 * against the first entry's required check, so the read-back can run BEFORE the declaration exists.
 */
function liveTargets(): Entry[] {
  const entries = protectionEntries();
  const only = process.env.A11Y_PROTECTION_REPO;
  if (!only) return entries.filter((e) => declaredRepositories().includes(e.repo));
  const known = entries.find((e) => e.repo === only);
  if (known) return [known];
  const branch = process.env.A11Y_PROTECTION_BRANCH;
  if (!branch) throw new Error(`CANNOT_TELL: ${only} has no entry in ${PROTECTION_FILE}; set A11Y_PROTECTION_BRANCH to read it anyway`);
  return [{ repo: only, defaultBranch: branch, requiredCheck: (entries[0] as Entry).requiredCheck, publishes: false }];
}

test("#3123 LIVE: every code repository carries the review requirement and the merge queue, asked of GitHub", () => {
  // OPT-IN under the SAME switch as `branch-protection.test.ts`'s no-admin read, for the same reason: a test
  // that spawns `gh` whenever a token happens to be present asks GitHub on every local run.
  if (process.env.A11Y_CHECK_MAIN_RULESET !== "1") {
    console.log("  NOT RUN: the live per-repository read is opt-in -- `A11Y_CHECK_MAIN_RULESET=1 npx rstest run --config "
      + "scripts/rstest/rstest.config.mjs --include packages/lab/src/packaging/layer-repository-protection.test.ts "
      + "--disableConsoleIntercept` asks GitHub about every declared repository. Nothing here read one.");
    return;
  }
  const targets = liveTargets();
  assert.ok(targets.length >= 1, "no repository to read: the declared list was empty, and an empty read certifies nothing");
  const bad: string[] = [];
  for (const entry of targets) {
    const v = repoVerdict(liveRead(entry), entry);
    console.log(`  ${v.code} ${entry.repo}@${entry.defaultBranch}: ${v.why}`);
    for (const s of v.surfaces) console.log(`    ${s.state.padEnd(8)} ${s.name} -- ${s.detail}`);
    if (v.code !== REPO_VERDICT.PROTECTED && v.code !== REPO_VERDICT.PARTLY_READ) bad.push(`${entry.repo}: ${v.why}`);
  }
  assert.deepEqual(bad, [], "a repository without both surfaces, or one that could not be read, is not protected");
  console.log(`  LIVE PASS (per-repository) over ${targets.length} repository(ies): ${targets.map((t) => t.repo).join(", ")}`);
});

// --- #3705: the settings the page's steps 1, 1b and 8 name, one table of a cell per repository per setting -----

/**
 * `layer-repository-protection`'s surfaces decide whether a merge needs review. They do NOT decide whether a
 * repository can be armed and released, and `toolchain`'s first release run (`release` 37356801652, #3578)
 * died on exactly that, after two settings had been found wrong by hand one at a time. So this is ONE reading
 * of every declared repository against `docs/new-code-repository.md`, each cell `OK`, `DRIFT <read vs the
 * page>` or `CANNOT_TELL <why>`, and a cell that is not `OK` fails. A repository with no row fails too.
 *
 * THE TOKEN'S REACH HAS NO READ-ONLY INSTRUMENT FOR ITS SCOPE. The org secret and the PAT's scope need an org
 * admin (403 as `a11ign-ai-leads`, read 2026-10-05). What GitHub does show anyone is a PAST ACT: a pull request
 * in the repository that `SECRET_HOLDER` opened (the version PR) or armed (`auto_merge.enabled_by`). That is
 * evidence the token reached THAT repository once, and it says nothing of the token's current validity or of
 * its scope, so the cell says which act it saw and no act is `CANNOT_TELL`, never `OK`.
 */
type CellState = "OK" | "DRIFT" | "CANNOT_TELL";
type Cell = { state: CellState; detail: string };
type Row = { repo: string; cells: Record<string, Cell> };

const ok = (detail: string): Cell => ({ state: "OK", detail });
const drift = (detail: string): Cell => ({ state: "DRIFT", detail });
const cannotTell = (detail: string): Cell => ({ state: "CANNOT_TELL", detail });

/** Why a read did not answer, in a sentence: a refusal is absent OR forbidden and decides nothing alone. */
const unreadWhy = (read: Read<unknown>): string =>
  read.kind === "unreadable" ? read.why : "refused (403/404: absent OR forbidden)";

type RepoSettings = Partial<Record<"allow_auto_merge" | "allow_merge_commit" | "allow_squash_merge"
  | "allow_rebase_merge" | "delete_branch_on_merge" | "has_issues", boolean>>;

/** Step 1: auto-merge on, merge commits only, delete branch on merge, Issues off (the tracker keeps them on). */
const SETTING_COLUMNS = [
  { column: "auto-merge", field: "allow_auto_merge", wanted: true },
  { column: "merge-commit", field: "allow_merge_commit", wanted: true },
  { column: "squash", field: "allow_squash_merge", wanted: false },
  { column: "rebase", field: "allow_rebase_merge", wanted: false },
  { column: "delete-branch", field: "delete_branch_on_merge", wanted: true },
] as const;

/** One boolean against the page. A field GitHub did not return is CANNOT_TELL, never read as `false`. */
function flagCell(settings: RepoSettings, field: keyof RepoSettings, wanted: boolean): Cell {
  const got = settings[field];
  if (typeof got !== "boolean") return cannotTell(`\`${field}\` is not in the answer`);
  return got === wanted ? ok(`${field} ${got}`) : drift(`${field} is ${got}, the page says ${wanted}`);
}

function settingsCells(read: Read<RepoSettings>, isTracker: boolean): Record<string, Cell> {
  const wanted = [...SETTING_COLUMNS, { column: "issues", field: "has_issues", wanted: isTracker }] as const;
  return Object.fromEntries(wanted.map(({ column, field, wanted: want }) => [column,
    read.kind === "ok" ? flagCell(read.value, field, want) : cannotTell(`repos/<repo>: ${unreadWhy(read)}`)]));
}

function protectionCell(read: RepoRead, entry: Entry): Cell {
  const v = repoVerdict(read, entry);
  if (v.code === REPO_VERDICT.CANNOT_TELL) return cannotTell(v.why);
  if (v.code === REPO_VERDICT.MISSING) return drift(v.why);
  return ok(`${v.code}: ${v.why}`);
}

const PUBLISH_ENV = "npm-publish";
type Environment = { name: string; deployment_branch_policy?: { custom_branch_policies?: boolean } | null };
type EnvironmentList = { environments?: Environment[] };
type PolicyList = { branch_policies?: { name: string; type?: string }[] };

function policyCell(env: Environment, policies: Read<PolicyList> | null, branch: string): Cell {
  const custom = env.deployment_branch_policy?.custom_branch_policies;
  if (custom !== true) return drift(`\`${PUBLISH_ENV}\` is not restricted to selected branches (custom_branch_policies ${String(custom)}); the page says only ${branch}`);
  if (policies === null || policies.kind !== "ok") return cannotTell(`the branch policies: ${policies === null ? "not asked" : unreadWhy(policies)}`);
  const names = (policies.value.branch_policies ?? []).map((p) => `${p.type ?? "branch"}:${p.name}`);
  return names.length === 1 && names[0] === `branch:${branch}`
    ? ok(`restricted to ${branch}`) : drift(`\`${PUBLISH_ENV}\` is restricted to [${names.join(", ")}]; the page says only branch:${branch}`);
}

/** Where a repository publishes, `npm-publish` exists and is restricted to its default branch; elsewhere it does not exist. */
function publishCell(entry: Entry, envs: Read<EnvironmentList>, policies: Read<PolicyList> | null): Cell {
  // The LIST is read, not the one environment: a 404 on `environments/npm-publish` is absent OR forbidden, and a
  // readable list that lacks it is absence.
  if (envs.kind !== "ok") return cannotTell(`environments: ${unreadWhy(envs)}`);
  const env = (envs.value.environments ?? []).find((e) => e.name === PUBLISH_ENV);
  if (!env) {
    return entry.publishes ? drift(`publishes, and no \`${PUBLISH_ENV}\` environment exists (the list was readable)`)
      : ok("does not publish, and no environment exists");
  }
  if (!entry.publishes) return drift(`declared not to publish (\`publishes\` false in ${PROTECTION_FILE}) yet \`${PUBLISH_ENV}\` exists`);
  return policyCell(env, policies, entry.defaultBranch);
}

type TeamRepo = { name: string; role_name?: string; permissions?: { admin?: boolean } };
/** One page of `orgs/a11ign/teams/bots/repos`; a full page may be a truncated one, so its absences are not read. */
const BOTS_PAGE = 100;

/** Step 1b / 7: `bots` is attached at `push` (GitHub's `write`), `admin` false. */
function botsCell(repo: string, read: Read<TeamRepo[]>): Cell {
  if (read.kind !== "ok") return cannotTell(`orgs/a11ign/teams/bots/repos: ${unreadWhy(read)}`);
  const found = read.value.find((t) => `a11ign/${t.name}` === repo);
  if (!found) {
    return read.value.length >= BOTS_PAGE ? cannotTell(`not on the first ${BOTS_PAGE} of the team's repositories, and there may be more`)
      : drift("`bots` is not attached to this repository (step 1b)");
  }
  const level = found.role_name ?? "unknown";
  return level === "write" && found.permissions?.admin === false
    ? ok("bots at write, admin false") : drift(`bots is at ${level}, admin ${String(found.permissions?.admin)}; the page says write, admin false`);
}

type PullSummary = { number: number; user?: { login?: string } | null; auto_merge?: { enabled_by?: { login?: string } | null } | null };
/**
 * How many recent pull requests are asked for, to find one the token ARMED. A pull request is about 20 KB of
 * JSON and `ghApiRead` holds 1 MB, so 100 overflowed it (`ENOBUFS`, measured 2026-10-05); 30 is about 0.6 MB.
 */
const PULLS_WINDOW = 30;
type Authored = { total_count?: number };
const ACT_IS_NOT_SCOPE = "(evidence of an act, not of the token's scope or current validity)";

/**
 * Step 8, as far as a read can go: has the token's identity opened a pull request HERE at any time (the search
 * count covers the whole history), or armed one in the recent window. Either is a past act and nothing more.
 */
function tokenCell(pulls: Read<PullSummary[]>, authored: Read<Authored>): Cell {
  const opened = authored.kind === "ok" ? authored.value.total_count ?? 0 : 0;
  if (opened > 0) return ok(`${SECRET_HOLDER} opened ${opened} pull request(s) here ${ACT_IS_NOT_SCOPE}`);
  const armed = pulls.kind === "ok" ? pulls.value.find((p) => p.auto_merge?.enabled_by?.login === SECRET_HOLDER) : undefined;
  if (armed) return ok(`${SECRET_HOLDER} armed #${armed.number} ${ACT_IS_NOT_SCOPE}`);
  const unread = [["search", authored], ["pulls", pulls]].filter(([, r]) => (r as Read<unknown>).kind !== "ok")
    .map(([name, r]) => `${name as string}: ${unreadWhy(r as Read<unknown>)}`);
  return cannotTell(unread.length > 0 ? `a read failed (${unread.join("; ")}), so no act by ${SECRET_HOLDER} could be ruled out or in`
    : `${SECRET_HOLDER} opened no pull request here and armed none of the last ${PULLS_WINDOW}: `
      + "the token's reach is not evidenced, and its scope is NOT readable without org admin");
}

type RepoReads = {
  settings: Read<RepoSettings>; protection: RepoRead; envs: Read<EnvironmentList>;
  policies: Read<PolicyList> | null; pulls: Read<PullSummary[]>; authored: Read<Authored>;
};
type OrgReads = { bots: Read<TeamRepo[]>; trackers: string[] };

function tableRow(entry: Entry, reads: RepoReads, org: OrgReads): Row {
  return {
    repo: entry.repo,
    cells: {
      ...settingsCells(reads.settings, org.trackers.includes(entry.repo)),
      protection: protectionCell(reads.protection, entry),
      [PUBLISH_ENV]: publishCell(entry, reads.envs, reads.policies),
      bots: botsCell(entry.repo, org.bots),
      token: tokenCell(reads.pulls, reads.authored),
    },
  };
}

/** Every failure, one line each: a declared repository with no row, then every cell that is not `OK`. */
function tableProblems(rows: Row[], declared: string[]): string[] {
  const shown = new Set(rows.map((r) => r.repo));
  const unrowed = declared.filter((repo) => !shown.has(repo)).map((repo) => `${repo}: DECLARED and has no row in the table`);
  const bad = rows.flatMap((r) => Object.entries(r.cells).filter(([, c]) => c.state !== "OK")
    .map(([column, c]) => `${r.repo} ${column}: ${c.state} ${c.detail}`));
  return [...unrowed, ...bad];
}

/** The matrix, then the detail of each cell that is not `OK`. */
function renderTable(rows: Row[]): string[] {
  const columns = Object.keys(rows[0]?.cells ?? {});
  const width = Math.max(...rows.map((r) => r.repo.length), "repository".length);
  const cellWidth = "CANNOT_TELL".length;
  const header = `${"repository".padEnd(width)}  ${columns.map((c) => c.padEnd(cellWidth)).join("  ")}`;
  const lines = rows.map((r) => `${r.repo.padEnd(width)}  ${columns.map((c) => (r.cells[c]?.state ?? "NO CELL").padEnd(cellWidth)).join("  ")}`);
  return [header, ...lines];
}

// --- fixtures: a repository that satisfies the page, and the same one drifting --------------------------------

const PUBLISHER: Entry = { repo: "a11ign/fixture-publisher", defaultBranch: "main", requiredCheck: "gate", publishes: true };
const NO_ORG: OrgReads = { bots: { kind: "ok", value: [{ name: "fixture-publisher", role_name: "write", permissions: { admin: false } }] }, trackers: [] };
const GOOD_SETTINGS: RepoSettings = { allow_auto_merge: true, allow_merge_commit: true, allow_squash_merge: false,
  allow_rebase_merge: false, delete_branch_on_merge: true, has_issues: false };
const RESTRICTED_ENV: Read<EnvironmentList> = { kind: "ok", value: { environments: [{ name: PUBLISH_ENV, deployment_branch_policy: { custom_branch_policies: true } }] } };
const MAIN_ONLY: Read<PolicyList> = { kind: "ok", value: { branch_policies: [{ name: "main", type: "branch" }] } };
const CI_OPENED: Read<Authored> = { kind: "ok", value: { total_count: 2 } };
const NO_PULLS: Read<PullSummary[]> = { kind: "ok", value: [] };
const GOOD_READS: RepoReads = { settings: { kind: "ok", value: GOOD_SETTINGS }, protection: withClassic({ kind: "ok", value: FULL_CLASSIC }),
  envs: RESTRICTED_ENV, policies: MAIN_ONLY, pulls: NO_PULLS, authored: CI_OPENED };
const columnsNotOk = (row: Row, state: CellState): string[] => Object.entries(row.cells).filter(([, c]) => c.state === state).map(([k]) => k);

test("#3705: a repository that satisfies the page reads OK in every cell -- the table can be green", () => {
  const row = tableRow(PUBLISHER, GOOD_READS, NO_ORG);
  assert.deepEqual(tableProblems([row], [PUBLISHER.repo]), []);
  assert.equal(Object.keys(row.cells).length, 10, "the columns the page's steps 1, 1b, 4 and 8 name, and the `issues` line of step 1");
});

test("#3705 POSITIVE CONTROL: a repository whose settings DRIFT prints DRIFT for exactly those cells", () => {
  // Squash allowed, `allow_auto_merge` false and `npm-publish` unrestricted: the three the row names. An emptiness
  // assertion over the problems would pass on a table that read nothing, so this names what must be there.
  const reads: RepoReads = { ...GOOD_READS,
    settings: { kind: "ok", value: { ...GOOD_SETTINGS, allow_squash_merge: true, allow_auto_merge: false } },
    envs: { kind: "ok", value: { environments: [{ name: PUBLISH_ENV, deployment_branch_policy: { custom_branch_policies: false } }] } } };
  const row = tableRow(PUBLISHER, reads, NO_ORG);
  assert.deepEqual(columnsNotOk(row, "DRIFT"), ["auto-merge", "squash", PUBLISH_ENV]);
  assert.deepEqual(columnsNotOk(row, "CANNOT_TELL"), []);
  assert.match(row.cells.squash?.detail ?? "", /allow_squash_merge is true, the page says false/);
  assert.equal(tableProblems([row], [PUBLISHER.repo]).length, 3);
});

test("#3705: each merge setting drifts on its own, in both directions the page cares about", () => {
  for (const { column, field, wanted } of SETTING_COLUMNS) {
    const wrong = { kind: "ok", value: { ...GOOD_SETTINGS, [field]: !wanted } } as Read<RepoSettings>;
    assert.deepEqual(columnsNotOk(tableRow(PUBLISHER, { ...GOOD_READS, settings: wrong }, NO_ORG), "DRIFT"), [column]);
  }
  // `issues` is off everywhere but the tracker, which IS the tracker.
  const withIssues = { kind: "ok", value: { ...GOOD_SETTINGS, has_issues: true } } as Read<RepoSettings>;
  assert.deepEqual(columnsNotOk(tableRow(PUBLISHER, { ...GOOD_READS, settings: withIssues }, NO_ORG), "DRIFT"), ["issues"]);
  assert.deepEqual(columnsNotOk(tableRow(PUBLISHER, { ...GOOD_READS, settings: withIssues }, { ...NO_ORG, trackers: [PUBLISHER.repo] }), "DRIFT"), []);
});

test("#3705: a setting GitHub did not return, or a read that failed, is CANNOT_TELL and never OK", () => {
  const partial = { kind: "ok", value: { allow_auto_merge: true } } as Read<RepoSettings>;
  const row = tableRow(PUBLISHER, { ...GOOD_READS, settings: partial }, NO_ORG);
  assert.deepEqual(columnsNotOk(row, "CANNOT_TELL"), ["merge-commit", "squash", "rebase", "delete-branch", "issues"]);
  const refused = tableRow(PUBLISHER, { ...GOOD_READS, settings: { kind: "refused" }, envs: { kind: "unreadable", why: "HTTP 502" } }, { ...NO_ORG, bots: { kind: "refused" } });
  assert.deepEqual(columnsNotOk(refused, "CANNOT_TELL"), [...SETTING_COLUMNS.map((s) => s.column), "issues", PUBLISH_ENV, "bots"]);
});

test("#3705: the protection cell reuses the existing verdict: MISSING is DRIFT, unreadable is CANNOT_TELL, PARTLY_READ is OK and says so", () => {
  const cell = (protection: RepoRead): Cell => tableRow(PUBLISHER, { ...GOOD_READS, protection }, NO_ORG).cells.protection as Cell;
  assert.equal(cell(EMPTY_REPO).state, "DRIFT");
  assert.match(cell(EMPTY_REPO).detail, /MISSING ruleset `pull_request` rule/);
  assert.equal(cell({ ...EMPTY_REPO, rules: { kind: "refused" } }).state, "CANNOT_TELL");
  const partly = cell(withClassic({ kind: "refused" }));
  assert.equal(partly.state, "OK", "as the live read above accepts it: a non-admin cannot read classic protection");
  assert.match(partly.detail, /^PARTLY_READ: .*NOT READ classic branch protection/);
});

test("#3705: an entry that does not say whether it publishes is a problem, because the `npm-publish` cell reads it", () => {
  const entries = [{ repo: "a11ign/silent", defaultBranch: "main", requiredCheck: "gate" }] as Entry[];
  assert.match(entryProblems(entries).join("\n"), /a11ign\/silent says nowhere whether it publishes/);
  assert.ok(protectionEntries().every((e) => typeof e.publishes === "boolean"), "the committed file is complete");
});

test("#3705: `npm-publish` -- a publisher needs it restricted to its default branch, and a non-publisher needs none", () => {
  const none: Read<EnvironmentList> = { kind: "ok", value: { environments: [] } };
  assert.equal(publishCell(PUBLISHER, none, null).state, "DRIFT", "a publisher with no environment");
  assert.equal(publishCell({ ...PUBLISHER, publishes: false }, none, null).state, "OK", "a non-publisher with none: absent is right");
  assert.equal(publishCell({ ...PUBLISHER, publishes: false }, RESTRICTED_ENV, MAIN_ONLY).state, "DRIFT", "a non-publisher carrying one");
  assert.equal(publishCell(PUBLISHER, { kind: "refused" }, null).state, "CANNOT_TELL", "a refused list is not absence");
  const wider: Read<PolicyList> = { kind: "ok", value: { branch_policies: [{ name: "main", type: "branch" }, { name: "v*", type: "tag" }] } };
  assert.match(publishCell(PUBLISHER, RESTRICTED_ENV, wider).detail, /branch:main, tag:v\*/);
  assert.equal(publishCell(PUBLISHER, RESTRICTED_ENV, { kind: "ok", value: { branch_policies: [] } }).state, "DRIFT", "custom policies with none listed restrict nothing the page names");
  assert.equal(publishCell(PUBLISHER, RESTRICTED_ENV, { kind: "refused" }).state, "CANNOT_TELL");
});

test("#3705: `bots` -- write with admin false is OK; absent, admin or read is DRIFT; an unreadable team is CANNOT_TELL", () => {
  const team = (t: Partial<TeamRepo>): Read<TeamRepo[]> => ({ kind: "ok", value: [{ name: "fixture-publisher", role_name: "write", permissions: { admin: false }, ...t }] });
  assert.equal(botsCell(PUBLISHER.repo, team({})).state, "OK");
  assert.equal(botsCell(PUBLISHER.repo, team({ role_name: "admin", permissions: { admin: true } })).state, "DRIFT");
  assert.equal(botsCell(PUBLISHER.repo, team({ role_name: "read" })).state, "DRIFT");
  assert.equal(botsCell(PUBLISHER.repo, team({ name: "someone-else" })).state, "DRIFT");
  assert.equal(botsCell(PUBLISHER.repo, { kind: "refused" }).state, "CANNOT_TELL");
  const full: Read<TeamRepo[]> = { kind: "ok", value: Array.from({ length: BOTS_PAGE }, (_, i) => ({ name: `r${i}`, role_name: "write", permissions: { admin: false } })) };
  assert.equal(botsCell(PUBLISHER.repo, full).state, "CANNOT_TELL", "a full page may hide the repository");
});

test("#3705: the token's reach is OK only from an act by the token's identity, and no act is CANNOT_TELL", () => {
  const none: Read<Authored> = { kind: "ok", value: { total_count: 0 } };
  assert.equal(tokenCell(NO_PULLS, CI_OPENED).state, "OK");
  const armed: Read<PullSummary[]> = { kind: "ok", value: [{ number: 3, user: { login: "dependabot[bot]" }, auto_merge: { enabled_by: { login: SECRET_HOLDER } } }] };
  assert.match(tokenCell(armed, none).detail, /armed #3/);
  const others: Read<PullSummary[]> = { kind: "ok", value: [{ number: 1, user: { login: "a11ign-ai-workers" }, auto_merge: { enabled_by: { login: "a11ign-ai-workers" } } }] };
  const silent = tokenCell(others, none);
  assert.equal(silent.state, "CANNOT_TELL");
  assert.match(silent.detail, /NOT readable without org admin/);
  assert.equal(tokenCell(NO_PULLS, none).state, "CANNOT_TELL", "an empty repository has no act to read");
  const failed = tokenCell({ kind: "unreadable", why: "ENOBUFS" }, none);
  assert.equal(failed.state, "CANNOT_TELL");
  assert.match(failed.detail, /pulls: ENOBUFS/, "a failed read says so rather than reading as 'no act'");
  assert.equal(tokenCell(armed, { kind: "refused" }).state, "OK", "an act seen is evidence even where the other read failed");
});

test("#3705: a declared repository with no row is a failure, and the table renders a cell for every column", () => {
  const row = tableRow(PUBLISHER, GOOD_READS, NO_ORG);
  assert.deepEqual(tableProblems([row], [PUBLISHER.repo]), []);
  assert.deepEqual(tableProblems([row], [PUBLISHER.repo, "a11ign/has-no-row"]), ["a11ign/has-no-row: DECLARED and has no row in the table"]);
  assert.deepEqual(tableProblems([], ["a11ign/has-no-row"]).length, 1, "no rows at all is a failure and not a pass");
  const [header, line] = renderTable([row]);
  assert.match(header ?? "", /repository +auto-merge +merge-commit +squash/);
  assert.match(line ?? "", /^a11ign\/fixture-publisher +OK/);
});

// --- the live table, over every declared repository -------------------------------------------------------

function readRepo(entry: Entry): RepoReads {
  const envs = ghRead<EnvironmentList>(`repos/${entry.repo}/environments`);
  const hasEnv = envs.kind === "ok" && (envs.value.environments ?? []).some((e) => e.name === PUBLISH_ENV);
  return {
    settings: ghRead(`repos/${entry.repo}`),
    protection: liveRead(entry),
    envs,
    policies: hasEnv ? ghRead(`repos/${entry.repo}/environments/${PUBLISH_ENV}/deployment-branch-policies`) : null,
    pulls: ghRead(`repos/${entry.repo}/pulls?state=all&per_page=${PULLS_WINDOW}`),
    authored: ghRead(`search/issues?q=repo:${entry.repo}+is:pr+author:${SECRET_HOLDER}&per_page=1`),
  };
}

test("#3705 LIVE: every code repository is read against docs/new-code-repository.md, one table, DRIFT and CANNOT_TELL fail", () => {
  // OPT-IN under the same switch as the read above, for the same reason. It reads EVERY declared repository, so
  // `A11Y_PROTECTION_REPO` (one repository, possibly not yet declared) does not narrow it.
  if (process.env.A11Y_CHECK_MAIN_RULESET !== "1") {
    console.log("  NOT RUN: the live settings table is opt-in -- `A11Y_CHECK_MAIN_RULESET=1` asks GitHub about every declared "
      + "repository (settings, environments, the bots team, pull requests, a search). Nothing here read one.");
    return;
  }
  const declared = declaredRepositories();
  const entries = protectionEntries();
  const org: OrgReads = { bots: ghRead(`orgs/a11ign/teams/bots/repos?per_page=${BOTS_PAGE}`), trackers: readJson<ProjectFile>(PROJECT_FILE).tracker.map((t) => t.repo) };
  const rows = entries.filter((e) => declared.includes(e.repo)).map((entry) => tableRow(entry, readRepo(entry), org));
  assert.ok(rows.length >= 1, "no repository to read: the declared list was empty, and an empty read certifies nothing");
  const lines = renderTable(rows);
  console.log(lines.join("\n"));
  const problems = tableProblems(rows, declared);
  for (const p of problems) console.log(`  ${p}`);
  assert.deepEqual(problems, [], "a repository drifts from docs/new-code-repository.md, or a setting could not be read: neither is a pass");
});
