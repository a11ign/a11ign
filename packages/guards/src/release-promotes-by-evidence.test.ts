/**
 * A VERSION ON `next` BECOMES `latest` WHEN THE FLEET'S QUALIFICATION IS GREEN, AND `latest` STAYS PUT WHEN IT IS RED
 * (#3947, outcome 3 of #3911, items 2 and 3: release channels and promotion by evidence; #3946 is the publish side).
 *
 * ## Two halves, and why the first calls the shipped function
 *
 * 1. THE DECISION, over a table, by calling `decidePromotion` from `scripts/release-promote.mjs`, never a copy of its rules. The
 *    outcome comes from the decider that already exists (`qualificationDecision`), so each row says what the real history of
 *    statuses must yield: `proceed` promotes every released package, `wait`, `rerun` and `regression` promote none, `regression`
 *    (and an overdue `wait`) raise ONE row, a version older than the registry's latest is refused, and a status that is missing or
 *    cannot be read is never `proceed`.
 * 2. THE WORKFLOW, by PARSING `release.yml`: the job that moves the tag, what it holds, what starts it, and that nothing it
 *    added widens the publish path. A step that echoes the same words must not satisfy a property.
 *
 * ## Positive control for the emptiness
 *
 * An assertion that a table of outcomes yields no promotion passes for an implementation that never promotes. So the table has
 * a `proceed` row, and `checkTable` is run against an implementation that promotes on EVERY outcome and against one that never
 * promotes: the first is refused by the `wait`, `rerun` and `regression` rows, the second by the `proceed` row.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse, stringify } from "yaml";
import {
  candidatesFrom,
  decidePromotion,
  groupBySha,
  promotionLine,
  promotionPlan,
  promotionTimeFrom,
  readDistTags,
  releaseShaOf,
} from "../../../scripts/release-promote.mjs";
import {
  QUALIFICATION_WRITER,
  qualificationDecision,
  qualificationStatusesFrom,
  WAIT_BOUND_MINUTES,
} from "../../../scripts/release-reads-qualification.mjs";
import { sandboxGitEnv } from "./git-env.mjs";

const REPO = fileURLToPath(new URL("../../..", import.meta.url));
const WORKFLOW = join(REPO, ".github/workflows/release.yml");
const SHA_LENGTH = 40;
const SHA = "a".repeat(SHA_LENGTH);
const OLDER_SHA = "b".repeat(SHA_LENGTH);

const GATED = { name: "@a11ign/evidence", version: "0.3.0", directory: "evidence" };
const CLI = { name: "a11ign", version: "0.3.0", directory: "cli" };
const RUNNER_ONLY = { name: "@a11ign/scorer", version: "0.3.0", directory: "scorer" };
const LATEST = { "@a11ign/evidence": "0.2.0", a11ign: "0.2.7", "@a11ign/scorer": "0.2.1" };

type Status = { state: string; description?: string };
type History = { sha: string; changedPaths: string[]; statuses: Status[] }[];
const history = (...statuses: Status[]): History => [{ sha: SHA, changedPaths: [], statuses }];

interface Row {
  name: string;
  released: typeof GATED[];
  history: History;
  waitedMinutes?: number;
  outcome: "proceed" | "wait" | "rerun" | "regression";
  promotes: string[];
  rows: string[];
}

const BOTH = [GATED, CLI];
const specs = (...r: typeof GATED[]) => r.map((p) => `${p.name}@${p.version}`);

/** Newest status first, the order GitHub lists them in. */
const TABLE: Row[] = [
  { name: "success on the sha", released: BOTH, history: history({ state: "success" }), outcome: "proceed", promotes: specs(...BOTH), rows: [] },
  { name: "pending, inside the bound", released: BOTH, history: history({ state: "pending" }), waitedMinutes: 10, outcome: "wait", promotes: [], rows: [] },
  { name: "no status at all", released: BOTH, history: history(), outcome: "wait", promotes: [], rows: [] },
  { name: "ONE failure: a candidate, not a proven regression", released: BOTH, history: history({ state: "failure" }), outcome: "rerun", promotes: [], rows: [] },
  { name: "TWO failures since the last success", released: BOTH, history: history({ state: "failure" }, { state: "failure" }), outcome: "regression", promotes: [], rows: ["regression"] },
  { name: "a failure is not softened by an older success", released: BOTH, history: history({ state: "failure" }, { state: "success" }), outcome: "rerun", promotes: [], rows: [] },
  { name: "a wait past the bound raises its row", released: BOTH, history: history({ state: "pending" }), waitedMinutes: WAIT_BOUND_MINUTES + 1, outcome: "wait", promotes: [], rows: ["qualification-overdue"] },
  { name: "GitHub's `error` state reads as a failure", released: BOTH, history: history({ state: "error" }), outcome: "rerun", promotes: [], rows: [] },
  { name: "success on an earlier commit with no read path changed since", released: BOTH,
    history: [{ sha: SHA, changedPaths: ["docs/x.md"], statuses: [] }, { sha: OLDER_SHA, changedPaths: [], statuses: [{ state: "success" }] }],
    outcome: "proceed", promotes: specs(...BOTH), rows: [] },
  { name: "success on an earlier commit, but a read path changed since: not inherited", released: BOTH,
    history: [{ sha: SHA, changedPaths: [], statuses: [] }, { sha: OLDER_SHA, changedPaths: ["packages/lab/src/x.ts"], statuses: [{ state: "success" }] }],
    outcome: "wait", promotes: [], rows: [] },
  { name: "a release of runner-only packages needs no fleet stage: the decider's own rule", released: [RUNNER_ONLY], history: history(),
    outcome: "proceed", promotes: specs(RUNNER_ONLY), rows: [] },
];

type Decide = (input: { released: typeof GATED[]; history: History; waitedMinutes: number }) =>
  { decision: { outcome: string }; promote: { name: string; version: string }[]; rows: { labels: string[] }[] };

const real: Decide = (input) => decidePromotion({ releaseSha: SHA, registryLatest: LATEST, ...input });

/** What the table demands of ANY implementation of the decision. Returns the names of the rows it refuses. */
function checkTable(decide: Decide): string[] {
  const refused: string[] = [];
  for (const row of TABLE) {
    const got = decide({ released: row.released, history: row.history, waitedMinutes: row.waitedMinutes ?? 0 });
    const promoted = got.promote.map((p) => `${p.name}@${p.version}`);
    const raised = got.rows.map((r) => r.labels[0]);
    const ok = got.decision.outcome === row.outcome
      && JSON.stringify(promoted) === JSON.stringify(row.promotes)
      && JSON.stringify(raised) === JSON.stringify(row.rows);
    if (!ok) refused.push(row.name);
  }
  return refused;
}

for (const row of TABLE) {
  test(`the shipped decision: ${row.name} -> ${row.outcome}`, () => {
    const got = real({ released: row.released, history: row.history, waitedMinutes: row.waitedMinutes ?? 0 });
    assert.equal(got.decision.outcome, row.outcome);
    assert.deepEqual(got.promote.map((p) => `${p.name}@${p.version}`), row.promotes);
    assert.deepEqual(got.rows.map((r) => r.labels[0]), row.rows);
  });
}

test("the outcome IS the existing decider's: the table's inputs, handed to `qualificationDecision`, say the same", () => {
  for (const row of TABLE) {
    const direct = qualificationDecision({ releaseSha: SHA, packages: row.released.map((p) => p.directory), history: row.history, waitedMinutes: row.waitedMinutes ?? 0 });
    assert.equal(direct.outcome, row.outcome, row.name);
  }
});

test("positive control: the table has a `proceed` row and a row for every other outcome", () => {
  assert.deepEqual([...new Set(TABLE.map((r) => r.outcome))].sort(), ["proceed", "regression", "rerun", "wait"]);
  assert.ok(TABLE.some((r) => r.outcome === "proceed" && r.promotes.length === r.released.length && r.released.length > 1));
  assert.deepEqual(checkTable(real), []);
});

test("an implementation that promotes on EVERY outcome is refused by the wait, rerun and regression rows, and by no `proceed` row", () => {
  const always: Decide = (input) => {
    const got = real(input);
    return { ...got, promote: input.released };
  };
  assert.deepEqual(checkTable(always), TABLE.filter((r) => r.outcome !== "proceed").map((r) => r.name));
});

test("an implementation that never promotes is refused by the `proceed` rows", () => {
  const never: Decide = (input) => ({ ...real(input), promote: [] });
  const refused = checkTable(never);
  assert.deepEqual(refused, TABLE.filter((r) => r.outcome === "proceed").map((r) => r.name));
});

test("a status in a state nobody defined is never `proceed`: the decision throws CANNOT_TELL", () => {
  assert.throws(() => real({ released: BOTH, history: history({ state: "banana" }), waitedMinutes: 0 }), /CANNOT_TELL/);
});

test("a history that does not begin at the release sha is never `proceed`", () => {
  assert.throws(() => decidePromotion({ releaseSha: SHA, registryLatest: LATEST, released: BOTH, waitedMinutes: 0,
    history: [{ sha: OLDER_SHA, changedPaths: [], statuses: [{ state: "success" }] }] }), /CANNOT_TELL/);
});

test("a release that names no package is never `proceed`", () => {
  assert.throws(() => real({ released: [], history: history({ state: "success" }), waitedMinutes: 0 }), /CANNOT_TELL/);
});

const proceed = { outcome: "proceed" as const, reason: "test", overdue: false };

test("a version older than the registry's latest is REFUSED, and the whole release is held with it", () => {
  const plan = promotionPlan({ decision: proceed, released: BOTH, registryLatest: { ...LATEST, a11ign: "0.9.0" } });
  assert.deepEqual(plan.promote, []);
  assert.deepEqual(plan.refused.map((r) => r.name), ["a11ign"]);
});

test("a version equal to the registry's latest is already promoted: nothing to do and nothing refused", () => {
  const plan = promotionPlan({ decision: proceed, released: BOTH, registryLatest: { ...LATEST, a11ign: "0.3.0" } });
  assert.deepEqual(plan.refused, []);
  assert.deepEqual(plan.promote.map((p) => p.name), ["@a11ign/evidence"]);
});

test("`0.0.0-reserved.0` (a name held, ADR 0040) is the floor `0.0.0`, and any other prerelease is CANNOT_TELL", () => {
  const plan = promotionPlan({ decision: proceed, released: [GATED], registryLatest: { "@a11ign/evidence": "0.0.0-reserved.0" } });
  assert.equal(plan.promote.length, 1);
  assert.throws(() => promotionPlan({ decision: proceed, released: [GATED], registryLatest: { "@a11ign/evidence": "1.0.0-beta.1" } }), /CANNOT_TELL/);
});

test("a registry reading that is missing is never `proceed`'s licence: CANNOT_TELL", () => {
  assert.throws(() => promotionPlan({ decision: proceed, released: BOTH, registryLatest: { "@a11ign/evidence": "0.2.0" } }), /CANNOT_TELL/);
});

test("a row names the whole sha, is idempotent by that title, and says latest stays", () => {
  const got = real({ released: BOTH, history: history({ state: "failure" }, { state: "failure" }), waitedMinutes: 0 });
  assert.equal(got.rows.length, 1);
  const row = got.rows[0] as unknown as { title: string; labels: string[]; body: string };
  assert.ok(row.title.includes(SHA));
  assert.deepEqual(row.labels, ["regression", "answer:orchestrator"]);
  assert.match(row.body, /`latest` stays/);
  assert.equal(real({ released: BOTH, history: history({ state: "failure" }, { state: "failure" }), waitedMinutes: 0 }).rows[0].labels[0], "regression");
});

// ---- the registry's side: which versions are waiting on `next` ------------------------------------------------------------

test("a candidate is a package whose `next` is strictly newer than its `latest`", () => {
  const found = candidatesFrom([
    { name: "a11ign", directory: "cli", tags: { latest: "0.2.7", next: "0.3.0" } },
    { name: "@a11ign/judge", directory: "judge", tags: { latest: "0.2.3", next: "0.2.3" } },
    { name: "@a11ign/scorer", directory: "scorer", tags: { latest: "0.2.1" } },
    { name: "@a11ign/evidence", directory: "evidence", tags: { next: "0.3.0" } },
  ]);
  assert.deepEqual(found.map((c) => `${c.name}@${c.version}<-${c.latest}`), ["a11ign@0.3.0<-0.2.7", "@a11ign/evidence@0.3.0<-0.0.0"]);
});

test("a `next` that is OLDER than `latest` is no candidate: latest never moves backwards", () => {
  assert.deepEqual(candidatesFrom([{ name: "a11ign", directory: "cli", tags: { latest: "0.9.0", next: "0.3.0" } }]), []);
});

test("a `next` that is not a plain x.y.z is CANNOT_TELL, never a candidate", () => {
  assert.throws(() => candidatesFrom([{ name: "a11ign", directory: "cli", tags: { latest: "0.2.7", next: "0.3.0-rc.1" } }]), /CANNOT_TELL/);
});

const OK = 200;
const NOT_FOUND = 404;
const UNAVAILABLE = 503;
const FIRST_NON_OK = 300;

function registryAnswering(status: number, body: unknown = {}) {
  return (async (url: string) => ({ ok: status >= OK && status < FIRST_NON_OK, status, json: async () => body, url })) as unknown as typeof fetch;
}

test("the registry: a 404 is `not published`, a 5xx is CANNOT_TELL, and only the dist-tags are read", async () => {
  assert.equal(await readDistTags("a11ign", registryAnswering(NOT_FOUND)), null);
  await assert.rejects(readDistTags("a11ign", registryAnswering(UNAVAILABLE)), /CANNOT_TELL/);
  assert.deepEqual(await readDistTags("a11ign", registryAnswering(OK, { "dist-tags": { latest: "0.2.7", next: "0.3.0" } })), { latest: "0.2.7", next: "0.3.0" });
  await assert.rejects(readDistTags("a11ign", registryAnswering(OK, {})), /CANNOT_TELL/);
});

test("a scoped name is asked for with its slash encoded", async () => {
  let asked = "";
  const spy = (async (url: string) => { asked = url; return { ok: true, status: OK, json: async () => ({ "dist-tags": {} }) }; }) as unknown as typeof fetch;
  await readDistTags("@a11ign/evidence", spy);
  assert.equal(asked, "https://registry.npmjs.org/@a11ign%2Fevidence");
});

// ---- item 5: the promotion's time, where `dora.mjs` can read it without a token ---------------------------------------------

test("the promotion line round-trips: what is written is what `promotionTimeFrom` reads", () => {
  const body = `## 0.3.0\n\n- a change\n\n${promotionLine("2026-10-07T12:34:56Z", SHA)}\n`;
  assert.equal(promotionTimeFrom(body), "2026-10-07T12:34:56Z");
  assert.equal(promotionTimeFrom("## 0.3.0\n\n- a change\n"), null);
  assert.equal(promotionTimeFrom("Promoted to latest: yesterday (qualification read on x)"), null);
});

// ---- who may say `qualification`: the lab's identity, and nobody else (#3969, item 2) ----------------------------------------

/** One entry of GitHub's `commits/{sha}/statuses`, newest first. */
const listed = (login: string | null, state: string, context = "qualification") =>
  ({ context, state, description: `${state} by ${login}`, creator: login === null ? null : { login } });

/** What `decidePromotion` makes of a LISTING, after the reader has dropped what is not the lab's. */
function decideListing(listing: ReturnType<typeof listed>[], report: (line: string) => void = () => undefined) {
  const statuses = qualificationStatusesFrom(listing, SHA, report);
  return real({ released: BOTH, history: [{ sha: SHA, changedPaths: [], statuses }], waitedMinutes: 0 });
}

test("a `success` from anyone but the lab's identity is no verdict: the release WAITS and promotes nothing", () => {
  const got = decideListing([listed("someone-with-status-write", "success")]);
  assert.equal(got.decision.outcome, "wait");
  assert.deepEqual(got.promote, []);
});

test("a `success` from the lab's identity qualifies", () => {
  const got = decideListing([listed(QUALIFICATION_WRITER, "success")]);
  assert.equal(got.decision.outcome, "proceed");
  assert.equal(got.promote.length, BOTH.length);
});

test("a forged `success` laid over the lab's own `failure` does not soften it", () => {
  const got = decideListing([listed("someone-with-status-write", "success"), listed(QUALIFICATION_WRITER, "failure")]);
  assert.equal(got.decision.outcome, "rerun");
  assert.deepEqual(got.promote, []);
});

test("a forged `failure` does not stop the lab's `success` either: the identity decides, not the state", () => {
  assert.equal(decideListing([listed("someone-with-status-write", "failure"), listed(QUALIFICATION_WRITER, "success")]).decision.outcome, "proceed");
});

test("a status from another identity is NAMED in the log: who, which state, which sha", () => {
  const lines: string[] = [];
  decideListing([listed("mallory", "success")], (line) => lines.push(line));
  assert.equal(lines.length, 1);
  assert.match(lines[0], /mallory/);
  assert.match(lines[0], /success/);
  assert.ok(lines[0].includes(SHA));
  assert.ok(lines[0].includes(QUALIFICATION_WRITER), "it says whose status it WOULD have counted");
});

test("a status whose creator cannot be read is ignored and named, never counted: absence is not the lab's identity", () => {
  const lines: string[] = [];
  const got = decideListing([listed(null, "success")], (line) => lines.push(line));
  assert.equal(got.decision.outcome, "wait");
  assert.equal(lines.length, 1);
});

test("a status of another CONTEXT is not this reader's business: dropped without a word", () => {
  const lines: string[] = [];
  const kept = qualificationStatusesFrom([listed("mallory", "success", "ci/other"), listed(QUALIFICATION_WRITER, "pending")], SHA, (line) => lines.push(line));
  assert.deepEqual(kept.map((s: Status) => s.state), ["pending"]);
  assert.deepEqual(lines, []);
});

test("the lab's statuses keep GitHub's order (newest first), whatever lies between them", () => {
  const kept = qualificationStatusesFrom([listed(QUALIFICATION_WRITER, "failure"), listed("mallory", "success"), listed(QUALIFICATION_WRITER, "success")], SHA, () => undefined);
  assert.deepEqual(kept.map((s: Status) => s.state), ["failure", "success"]);
});

test("the lab's identity is a plain login, so an empty one cannot match a creator-less status", () => {
  assert.match(QUALIFICATION_WRITER, /^[A-Za-z0-9][A-Za-z0-9-]*$/);
});

// ---- a tag that does not exist yet is a WAIT, and anything else unreadable still BLOCKS (#3969, item 3) ----------------------

function repoWithTags(tags: Record<string, "release" | "root">): { run: (args: string[]) => string; release: string; parent: string; done: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "release-promote-tags-"));
  const run = (args: string[]) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.test", "-c", "commit.gpgsign=false", ...args],
    { cwd: dir, encoding: "utf8", env: sandboxGitEnv() }).trim();
  run(["init", "-q"]);
  writeFileSync(join(dir, "a"), "1");
  run(["add", "a"]);
  run(["commit", "-q", "-m", "main sha"]);
  const parent = run(["rev-parse", "HEAD"]);
  writeFileSync(join(dir, "a"), "2");
  run(["commit", "-q", "-am", "release commit"]);
  const release = run(["rev-parse", "HEAD"]);
  for (const [tag, kind] of Object.entries(tags)) run(["tag", tag, kind === "release" ? release : parent]);
  return { run, release, parent, done: () => rmSync(dir, { recursive: true, force: true }) };
}

test("the release sha is the PARENT of the commit the tag names", () => {
  const repo = repoWithTags({ "a11ign@0.3.0": "release" });
  try {
    assert.equal(releaseShaOf("a11ign", "0.3.0", repo.run), repo.parent);
  } finally { repo.done(); }
});

test("a tag that does not exist yet reads as null, not as an error: the publish finished and the tag job has not cut it", () => {
  const repo = repoWithTags({ "a11ign@0.3.0": "release" });
  try {
    assert.equal(releaseShaOf("@a11ign/evidence", "0.3.0", repo.run), null);
  } finally { repo.done(); }
});

test("a tag that exists but has no parent to read is CANNOT_TELL: that one still blocks", () => {
  const repo = repoWithTags({});
  try {
    const first = repo.run(["rev-list", "--max-parents=0", "HEAD"]);
    repo.run(["tag", "a11ign@0.3.0", first]);
    assert.throws(() => releaseShaOf("a11ign", "0.3.0", repo.run), /CANNOT_TELL/);
  } finally { repo.done(); }
});

test("git failing for any other reason is CANNOT_TELL, never `no tag yet`", () => {
  const broken = () => { throw Object.assign(new Error("fatal: not a git repository"), { status: 128 }); };
  assert.throws(() => releaseShaOf("a11ign", "0.3.0", broken), /CANNOT_TELL/);
});

test("a candidate with no tag is WAITING and the rest are grouped by the sha they were released on", () => {
  const candidates = [
    { name: "a11ign", directory: "cli", version: "0.3.0", latest: "0.2.7" },
    { name: "@a11ign/evidence", directory: "evidence", version: "0.3.0", latest: "0.2.0" },
    { name: "@a11ign/scorer", directory: "scorer", version: "0.3.0", latest: "0.2.1" },
  ];
  const shaOf = (name: string) => (name === "@a11ign/evidence" ? null : SHA);
  const { groups, waiting } = groupBySha(candidates, shaOf);
  assert.deepEqual(waiting.map((c: { name: string }) => c.name), ["@a11ign/evidence"]);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].released.map((r: { name: string }) => r.name), ["a11ign", "@a11ign/scorer"]);
  assert.equal(groups[0].sha, SHA);
});

test("positive control: with every tag cut, nothing waits, and an error from the sha lookup is NOT swallowed into a wait", () => {
  const candidates = [{ name: "a11ign", directory: "cli", version: "0.3.0", latest: "0.2.7" }];
  assert.deepEqual(groupBySha(candidates, () => SHA).waiting, []);
  assert.throws(() => groupBySha(candidates, () => { throw new Error("CANNOT_TELL: git broke"); }), /CANNOT_TELL/);
});

// ---- the workflow, parsed ----------------------------------------------------------------------------------------------------

interface Step { id?: string; name?: string; run?: string; uses?: string; if?: string; env?: Record<string, string> }
interface Job {
  name?: string;
  needs?: string | string[];
  if?: string;
  uses?: string;
  environment?: string;
  permissions?: Record<string, string>;
  concurrency?: { group?: string };
  outputs?: Record<string, string>;
  steps?: Step[];
}
interface Workflow {
  on?: { push?: { branches?: string[]; paths?: string[] }; status?: unknown; workflow_dispatch?: unknown; schedule?: unknown };
  concurrency?: { group?: string; "cancel-in-progress"?: boolean };
  jobs?: Record<string, Job>;
}

const PUBLISH_PATH = ["action-smoke", "capture-regression", "consumer-gate", "guards", "release"];
const stepsText = (job: Job | undefined) => (job?.steps ?? []).map((s) => s.run ?? "").join("\n");

/** The job the row's Acceptance finds, the one that can mint an npm token: `npm-publish`, `id-token: write`, a `dist-tag add`. */
function moveJobName(workflow: Workflow): string | undefined {
  const found = Object.entries(workflow.jobs ?? {}).filter(([name]) => !PUBLISH_PATH.includes(name)).find(([, job]) =>
    job.environment === "npm-publish" && job.permissions?.["id-token"] === "write" && /dist-tag add/.test(JSON.stringify(job)));
  return found?.[0];
}

/** The job that reads the verdict: the one whose step runs the decision script. A step that echoes the name does not count. */
function decideJobName(workflow: Workflow): string | undefined {
  const found = Object.entries(workflow.jobs ?? {}).filter(([name]) => !PUBLISH_PATH.includes(name))
    .find(([, job]) => (job.steps ?? []).some((step) => /^\s*node scripts\/release-promote\.mjs\s*$/m.test(step.run ?? "")));
  return found?.[0];
}

/** Would `job` run for an event of this name? Only the two `if` shapes the file uses are understood; anything else COUNTS AS RUNNING. */
function runsOn(job: Job, event: string): boolean {
  const expression = (job.if ?? "").replace(/^\$\{\{\s*|\s*\}\}$/g, "").trim();
  if (expression === "") return true;
  return expression.split(" || ").some((term) => termAdmits(term, event));
}

/** One `||` term (#4000): its `&&` atoms must all admit the event; an atom about anything but the event name (a ref) admits it. */
function termAdmits(term: string, event: string): boolean {
  return term.replace(/^\(|\)$/g, "").trim().split(" && ").every((atom) => {
    const equals = /^github\.event_name == '([a-z_]+)'$/.exec(atom.trim());
    if (equals) return equals[1] === event;
    const differs = /^github\.event_name != '([a-z_]+)'$/.exec(atom.trim());
    if (differs) return differs[1] !== event;
    return true;
  });
}

const NO_MOVE = "no job moves a dist-tag by OIDC in `npm-publish`";
const NO_DECIDE = "no job runs `scripts/release-promote.mjs`";

function refusals(text: string): string[] {
  const workflow = parse(text) as Workflow;
  const jobs = workflow.jobs ?? {};
  const move = moveJobName(workflow);
  if (!move) return [NO_MOVE];
  const decide = decideJobName(workflow);
  if (!decide) return [NO_DECIDE];
  return [
    ...holdRefusals(workflow, { move, decide }),
    ...startRefusals(workflow, decide),
    ...publishPathRefusals(workflow, { move, decide }),
    ...decideStepRefusals(jobs[decide]),
    ...moveStepRefusals(jobs[move], decide),
  ];
}

const ALLOWED_PERMISSIONS = new Set(["id-token", "contents", "statuses"]);
interface Pair { move: string; decide: string }

function holdRefusals(workflow: Workflow, { move, decide }: Pair): string[] {
  const jobs = workflow.jobs ?? {};
  const found: string[] = [];
  const extra = Object.entries(jobs[move].permissions ?? {}).filter(([key, value]) => !ALLOWED_PERMISSIONS.has(key) && value !== "none");
  if (extra.length > 0) found.push(`the promotion job holds more than it needs: ${extra.map(([k]) => k).join(", ")}`);
  if (jobs[move].permissions?.contents === "write") found.push("the promotion job holds contents: write");
  if (jobs[move].permissions?.statuses !== undefined) found.push("the job holding id-token reads statuses: it has no verdict to read");
  const written = Object.entries(jobs[decide].permissions ?? {}).filter(([, value]) => value === "write").map(([key]) => key);
  if (written.length > 0) found.push(`the deciding job holds a write: ${written.join(", ")}`);
  if (jobs[decide].environment !== undefined) found.push("the deciding job runs in an environment, which is where the OIDC token is minted");
  for (const [other, job] of Object.entries(jobs).filter(([name]) => name !== move && !PUBLISH_PATH.includes(name))) found.push(...otherJobRefusals(other, job));
  return found;
}

function otherJobRefusals(name: string, job: Job): string[] {
  const found: string[] = [];
  if (job.permissions?.["id-token"] === "write") found.push(`${name} also holds id-token: write`);
  if (job.permissions?.["issues"] === "write" && /dist-tag/.test(stepsText(job))) found.push(`${name} holds issues: write beside a dist-tag`);
  return found;
}

function startRefusals(workflow: Workflow, decide: string): string[] {
  return [...pushTriggerRefusals(workflow), ...statusTriggerRefusals(workflow, decide), ...concurrencyRefusals(workflow)];
}

function pushTriggerRefusals(workflow: Workflow): string[] {
  const push = workflow.on?.push;
  const exact = JSON.stringify(push?.paths) === JSON.stringify([".changeset/**"]) && JSON.stringify(push?.branches) === JSON.stringify(["main"]);
  return exact ? [] : ["the `push` trigger is not exactly `main` + `.changeset/**`"];
}

function statusTriggerRefusals(workflow: Workflow, decide: string): string[] {
  const found: string[] = [];
  if (!("status" in (workflow.on ?? {}))) found.push("nothing starts the promotion when the lab posts a status");
  if (workflow.on?.schedule !== undefined) found.push("a `schedule` polls for work the status event already announces");
  if (!/event\.context == 'qualification'/.test(workflow.jobs?.[decide]?.if ?? "")) found.push("the deciding job does not narrow a `status` event to the `qualification` context");
  return found;
}

function concurrencyRefusals(workflow: Workflow): string[] {
  const group = workflow.concurrency?.group ?? "";
  if (group === "release") return ["a status run shares the publish concurrency group and can displace a pending release"];
  return /status/.test(group) ? [] : ["the workflow concurrency group does not separate status runs from the publish"];
}

function publishPathRefusals(workflow: Workflow, { move, decide }: Pair): string[] {
  const found: string[] = [];
  const jobs = workflow.jobs ?? {};
  for (const job of PUBLISH_PATH) {
    if (!jobs[job]) found.push(`the publish-path job is missing: ${job}`);
    else if (runsOn(jobs[job], "status")) found.push(`${job} would run on a status event`);
  }
  const release = [jobs.release?.needs ?? []].flat();
  if (release.includes(decide) || release.includes(move)) found.push("`release` waits for the promotion job");
  if (![jobs[decide]?.needs ?? []].flat().includes("release")) found.push("the deciding job does not wait for `release`, so a push run could promote before the publish");
  if (![jobs[move]?.needs ?? []].flat().includes(decide)) found.push("the job holding id-token does not wait for the decision, so the tag could move before it is made");
  return found;
}

/** Whatever could run code that is not GitHub's own action or the registry's npm: a clone, a script of this repository, a package runner. */
const FOREIGN_CODE = /agent-org|release-promote|release-reads|\bnode\s+\S|\bpnpm\b|\bnpx\b|git\s+clone|\bcurl\b|\bwget\b|\.mjs\b/;
const ALLOWED_ACTIONS = /^actions\/setup-node@/;
const QUOTED_STEP_LENGTH = 80;

function stepRefusals(job: Job, label: string): string[] {
  const found: string[] = [];
  const steps = job.steps ?? [];
  if (steps.some((s) => /\$\{\{/.test(s.run ?? ""))) found.push(`${label} puts \`\${{ }}\` in a \`run:\`: a value goes in through \`env:\``);
  if (steps.some((s) => /NODE_AUTH_TOKEN|NPM_TOKEN|A11IGN_BOT_TOKEN/.test(JSON.stringify(s)))) found.push(`${label} holds a stored token: OIDC must be what npm uses`);
  if (steps.some((s) => /\b(npm|pnpm)\s+(stage|publish)\b/.test(s.run ?? ""))) found.push(`${label} publishes or stages`);
  return found;
}

function decideStepRefusals(decide: Job): string[] {
  const found = stepRefusals(decide, "the deciding job");
  const steps = decide.steps ?? [];
  if (steps.some((s) => /dist-tag/.test(s.run ?? ""))) found.push("the deciding job moves a dist-tag: it must only decide");
  const blocked = steps.find((s) => /::error::/.test(s.run ?? "") && /blocked/.test(JSON.stringify(s.env ?? {})));
  if (!blocked || !/\$\{?BLOCKED\b/.test(blocked.run ?? "")) found.push("`blocked` does not reach the failing step through `env:`");
  return found;
}

function moveStepRefusals(move: Job, decide: string): string[] {
  const found = stepRefusals(move, "the job holding id-token");
  const steps = move.steps ?? [];
  if (!steps.some((s) => /npm dist-tag add .* latest/.test(s.run ?? ""))) found.push("no step runs `npm dist-tag add <spec> latest`");
  for (const step of steps) {
    if (step.uses !== undefined && !ALLOWED_ACTIONS.test(step.uses)) found.push(`the job holding id-token uses ${step.uses}: no checkout, and no action but setup-node`);
    if (FOREIGN_CODE.test(step.run ?? "")) found.push(`the job holding id-token runs foreign code: ${JSON.stringify(step.run).slice(0, QUOTED_STEP_LENGTH)}`);
  }
  if (!new RegExp(`needs\\.${decide}\\.outputs\\.promote\\b`).test(move.if ?? "")) found.push("the tag move is not conditioned on the decision's `promote` output");
  if (!steps.some((s) => /=~/.test(s.run ?? "") && /@\[0-9\]\+/.test(s.run ?? ""))) found.push("the move does not check each spec's shape again before it moves anything");
  return found;
}

function brokenAs(edit: (workflow: Workflow) => void): string {
  const workflow = parse(readFileSync(WORKFLOW, "utf8")) as Workflow;
  edit(workflow);
  return stringify(workflow);
}

const realWorkflow = () => parse(readFileSync(WORKFLOW, "utf8")) as Workflow;
const moveOf = (workflow: Workflow) => workflow.jobs![moveJobName(workflow)!];
const decideOf = (workflow: Workflow) => workflow.jobs![decideJobName(workflow)!];

test("the real release.yml has a pair of promotion jobs that satisfies every structural property", () => {
  assert.deepEqual(refusals(readFileSync(WORKFLOW, "utf8")), []);
});

test("positive control: the checker finds BOTH jobs in the real file, they are two, and the file's own Acceptance filter finds exactly one", () => {
  const workflow = realWorkflow();
  assert.ok(moveJobName(workflow));
  assert.ok(decideJobName(workflow));
  assert.notEqual(moveJobName(workflow), decideJobName(workflow));
  const matching = Object.entries(workflow.jobs ?? {}).filter(([k]) => k !== "release" && k !== "guards").filter(([, v]) =>
    v.environment === "npm-publish" && v.permissions?.["id-token"] === "write" && /dist-tag add/.test(JSON.stringify(v)));
  assert.equal(matching.length, 1);
});

test("THE ROW'S ACCEPTANCE, in the test: the job holding `id-token` and `dist-tag add` names neither the tool clone nor the decider", () => {
  const job = moveOf(realWorkflow());
  assert.doesNotMatch(JSON.stringify(job), /agent-org-newest-tag|release-promote/);
});

test("a move job whose only mention of the words is an echo is not found", () => {
  const text = brokenAs((w) => {
    delete w.jobs![moveJobName(w)!];
    w.jobs!.guards.steps!.push({ run: "echo 'dist-tag add'" });
  });
  assert.deepEqual(refusals(text), [NO_MOVE]);
});

test("a deciding job whose only mention of the script is an echo is not found", () => {
  const text = brokenAs((w) => {
    delete w.jobs![decideJobName(w)!];
    w.jobs!.guards.steps!.push({ run: "echo 'node scripts/release-promote.mjs'" });
  });
  assert.deepEqual(refusals(text), [NO_DECIDE]);
});

const BREAKS: { name: string; edit: (w: Workflow) => void; says: RegExp }[] = [
  { name: "the move job also holds issues: write", edit: (w) => { moveOf(w).permissions!.issues = "write"; }, says: /holds more than it needs: issues/ },
  { name: "the move job holds contents: write", edit: (w) => { moveOf(w).permissions!.contents = "write"; }, says: /contents: write/ },
  { name: "the move job reads statuses", edit: (w) => { moveOf(w).permissions!.statuses = "read"; }, says: /reads statuses/ },
  { name: "the deciding job gains id-token", edit: (w) => { decideOf(w).permissions!["id-token"] = "write"; }, says: /holds a write: id-token|also holds id-token: write/ },
  { name: "the deciding job gains a write", edit: (w) => { decideOf(w).permissions!.issues = "write"; }, says: /holds a write: issues/ },
  { name: "the deciding job runs in the npm-publish environment", edit: (w) => { decideOf(w).environment = "npm-publish"; }, says: /environment/ },
  { name: "the `push` trigger is widened to every path", edit: (w) => { delete w.on!.push!.paths; }, says: /`push` trigger/ },
  { name: "the `push` trigger gains another branch", edit: (w) => { w.on!.push!.branches!.push("agent/**"); }, says: /`push` trigger/ },
  { name: "nothing starts the promotion on a status", edit: (w) => { delete w.on!.status; }, says: /status/ },
  { name: "a schedule polls instead", edit: (w) => { w.on!.schedule = [{ cron: "*/10 * * * *" }]; }, says: /schedule/ },
  { name: "every status context starts the promotion", edit: (w) => { decideOf(w).if = "github.event_name == 'status'"; }, says: /`qualification` context/ },
  { name: "a status run shares the publish group", edit: (w) => { w.concurrency!.group = "release"; }, says: /concurrency group/ },
  { name: "the guards job would run on a status event", edit: (w) => { delete w.jobs!.guards.if; }, says: /guards would run on a status event/ },
  { name: "the Windows capture job would run on a status event", edit: (w) => { delete w.jobs!["capture-regression"].if; }, says: /capture-regression would run on a status event/ },
  { name: "the release job would run on a status event", edit: (w) => { w.jobs!.release.if = "github.event_name != 'workflow_dispatch'"; }, says: /release would run on a status event/ },
  { name: "release waits for the decision", edit: (w) => { w.jobs!.release.needs = [...[w.jobs!.release.needs].flat() as string[], decideJobName(w)!]; }, says: /`release` waits for the promotion job/ },
  { name: "release waits for the move", edit: (w) => { w.jobs!.release.needs = [...[w.jobs!.release.needs].flat() as string[], moveJobName(w)!]; }, says: /`release` waits for the promotion job/ },
  { name: "the decision does not wait for release", edit: (w) => { delete decideOf(w).needs; }, says: /does not wait for `release`/ },
  { name: "the move does not wait for the decision", edit: (w) => { delete moveOf(w).needs; }, says: /does not wait for the decision/ },
  { name: "the move step is gone (the job is then no longer the promotion job at all)", edit: (w) => { moveOf(w).steps = moveOf(w).steps!.filter((s) => !/dist-tag add/.test(s.run ?? "")); }, says: /no job moves a dist-tag/ },
  { name: "the move job publishes", edit: (w) => { moveOf(w).steps!.push({ run: "npm publish --tag latest" }); }, says: /publishes or stages/ },
  { name: "the deciding job publishes", edit: (w) => { decideOf(w).steps!.push({ run: "npm publish --tag latest" }); }, says: /publishes or stages/ },
  { name: "a stored token is used by the move", edit: (w) => { moveOf(w).steps![moveOf(w).steps!.length - 1].env = { NODE_AUTH_TOKEN: "${{ secrets.NPM_TOKEN }}" }; }, says: /stored token/ },
  { name: "the move runs whatever the decision said", edit: (w) => { delete moveOf(w).if; }, says: /not conditioned on the decision/ },
  { name: "the move stops re-checking the specs", edit: (w) => { for (const s of moveOf(w).steps!) if (/dist-tag add/.test(s.run ?? "")) s.run = s.run!.replace(/=~/g, "=="); }, says: /check each spec's shape again/ },
  // THE ROW'S POINT (#3969): nothing from another repository runs beside the OIDC token.
  { name: "the job holding id-token checks out the repository", edit: (w) => { moveOf(w).steps!.unshift({ uses: "actions/checkout@v7" }); }, says: /uses actions\/checkout/ },
  { name: "the job holding id-token clones the tool again", edit: (w) => { moveOf(w).steps!.unshift({ run: 'node scripts/agent-org-newest-tag.mjs --dest="$RUNNER_TEMP/agent-org"' }); }, says: /runs foreign code/ },
  { name: "the job holding id-token runs the decider again", edit: (w) => { moveOf(w).steps!.unshift({ run: "node scripts/release-promote.mjs" }); }, says: /runs foreign code/ },
  { name: "the job holding id-token installs and runs a package of this repository", edit: (w) => { moveOf(w).steps!.unshift({ run: "pnpm install && pnpm run something" }); }, says: /runs foreign code/ },
  { name: "the job holding id-token uses some other action", edit: (w) => { moveOf(w).steps!.unshift({ uses: "someone-else/action@v1" }); }, says: /uses someone-else\/action/ },
  // `blocked` and `${{ }}` (item 4).
  { name: "the blocked count is spliced into the script with `${{ }}`", edit: (w) => { for (const s of decideOf(w).steps!) if (/::error::/.test(s.run ?? "")) { s.run = s.run!.replace("${BLOCKED}", "${{ steps.plan.outputs.blocked }}"); delete s.env; } }, says: /`\$\{\{ \}\}` in a `run:`/ },
  { name: "the move splices the list into the script with `${{ }}`", edit: (w) => { for (const s of moveOf(w).steps!) if (/dist-tag add/.test(s.run ?? "")) s.run = s.run!.replace("$PROMOTE", "${{ needs.decide.outputs.promote }}"); }, says: /`\$\{\{ \}\}` in a `run:`/ },
];

for (const broke of BREAKS) {
  test(`REFUSED: ${broke.name}`, () => {
    const found = refusals(brokenAs(broke.edit));
    assert.ok(found.some((line) => broke.says.test(line)), `refusals were: ${JSON.stringify(found)}`);
  });
}

// ---- the move step, RUN: what it does with a list it does not trust ----------------------------------------------------------

/** Runs the real `run:` of the move step under bash with an `npm` that only records, and returns what it did. */
function runMove(promote: string): { status: number | null; moved: string[]; output: string; at: string } {
  const dir = mkdtempSync(join(tmpdir(), "release-move-"));
  try {
    const bin = join(dir, "bin");
    mkdirSync(bin);
    const log = join(dir, "npm.log");
    writeFileSync(join(bin, "npm"), `#!/bin/sh\necho "$@" >> "${log}"\n`, { mode: 0o755 });
    const out = join(dir, "output");
    writeFileSync(out, "");
    const step = moveOf(realWorkflow()).steps!.find((s) => /dist-tag add/.test(s.run ?? ""))!;
    const done = spawnSync("bash", ["-c", step.run!], { cwd: dir, encoding: "utf8",
      env: { PATH: `${bin}:${process.env.PATH}`, PROMOTE: promote, GITHUB_OUTPUT: out } });
    const moved = (() => { try { return readFileSync(log, "utf8").split("\n").filter(Boolean); } catch { return []; } })();
    return { status: done.status, moved, output: `${done.stdout}${done.stderr}`, at: readFileSync(out, "utf8") };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

test("the move step, run: every spec the decision named is moved to `latest`, scoped or not, and the time is recorded", () => {
  const got = runMove("a11ign@0.3.0 @a11ign/evidence@0.3.0");
  assert.equal(got.status, 0, got.output);
  assert.deepEqual(got.moved, ["dist-tag add a11ign@0.3.0 latest", "dist-tag add @a11ign/evidence@0.3.0 latest"]);
  assert.match(got.at, /^at=\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/m);
});

const HOSTILE = [
  ["a flag in place of a name", "--registry=https://evil.example/x@1.0.0"],
  ["a version that is not x.y.z", "a11ign@latest"],
  ["a prerelease", "a11ign@0.3.0-rc.1"],
  ["a glob", "*"],
  ["a command substitution", "$(touch pwned)@1.0.0"],
  ["a name with a slash path", "../../x@1.0.0"],
  ["an uppercase scope", "@A11IGN/evidence@0.3.0"],
] as const;

for (const [what, bad] of HOSTILE) {
  test(`the move step, run: ${what} moves NOTHING, not even the valid spec beside it`, () => {
    const got = runMove(`a11ign@0.3.0 ${bad}`);
    assert.notEqual(got.status, 0, got.output);
    assert.deepEqual(got.moved, []);
    assert.match(got.output, /CANNOT_TELL/);
  });
}

test("the move step, run: a second line smuggled into the list is checked like the first, and an empty list is refused", () => {
  const smuggled = runMove("a11ign@0.3.0\nrm@-rf");
  assert.notEqual(smuggled.status, 0, smuggled.output);
  assert.deepEqual(smuggled.moved, []);
  const empty = runMove("   ");
  assert.notEqual(empty.status, 0);
  assert.deepEqual(empty.moved, []);
});

test("the move step re-applies the SAME shape `release-promote.mjs` checks: one regex, two places", () => {
  const source = readFileSync(join(REPO, "scripts/release-promote.mjs"), "utf8");
  const script = /const SPEC = \/(.+)\/;/.exec(source)![1];
  const step = moveOf(realWorkflow()).steps!.find((s) => /dist-tag add/.test(s.run ?? ""))!.run!;
  const shape = /spec_shape='([^']+)'/.exec(step)![1];
  const normal = (regex: string) => regex.replace(/^\^/, "").replace(/\$$/, "").replace(/\\\//g, "/").replace(/\[0-9\]/g, "\\d");
  assert.equal(normal(shape), normal(script));
});

test("the row-filing job holds issues: write and nothing else, the record job contents: write and nothing else, and neither holds id-token", () => {
  const workflow = realWorkflow();
  const move = moveJobName(workflow)!;
  const others = Object.entries(workflow.jobs ?? {}).filter(([k]) => !PUBLISH_PATH.includes(k) && k !== move);
  assert.deepEqual(others.map(([k]) => k).sort(), ["decide", "promote-action-tag", "promotion-record", "promotion-row"]);
  assert.deepEqual(workflow.jobs!["promotion-row"].permissions, { contents: "read", issues: "write" });
  assert.deepEqual(workflow.jobs!["promotion-record"].permissions, { contents: "write" });
  assert.ok(!/actions\/checkout|pnpm|node /.test(stepsText(workflow.jobs!["promotion-record"])), "the job that writes contents runs no repository code");
});

test("the Release write records the time in the line the parser reads, and marks `latest` only for `a11ign`", () => {
  const record = realWorkflow().jobs!["promotion-record"];
  const text = stepsText(record);
  const printf = /printf '([^']*Promoted to latest: [^']*)'/.exec(text);
  assert.ok(printf, "the record step writes a `Promoted to latest:` line");
  const written = printf![1].replace("%s", "").replace(/\\n/g, "\n");
  const sample = written.replace(/%s/, "2026-10-07T01:02:03Z").replace(/%s/, SHA).trim();
  assert.equal(promotionTimeFrom(sample), "2026-10-07T01:02:03Z");
  assert.match(text, /gh release edit "\$tag" --latest/);
  assert.match(text, /a11ign@\*/);
});

test("the promotion row is filed by title, once, by a job that has no `needs` on the publish path", () => {
  const row = realWorkflow().jobs!["promotion-row"];
  assert.match(stepsText(row), /--search/);
  assert.match(stepsText(row), /select\(\.title == env\.ROW_TITLE\)/);
  assert.deepEqual([row.needs].flat(), [decideJobName(realWorkflow())]);
});

test("the header of release.yml states the two channels and when `latest` moves (#2052)", () => {
  const header = readFileSync(WORKFLOW, "utf8").split("\nname: release")[0];
  assert.match(header, /TWO CHANNELS/);
  assert.match(header, /`next`/);
  assert.match(header, /`latest` MOVES ONLY/);
  assert.doesNotMatch(header, /nothing here runs it/);
});

/** Every job with `ancestor` somewhere above it in `needs`, however many hops away (#4021). */
function downstreamOf(workflow: Workflow, ancestor: string): string[] {
  const jobs = workflow.jobs ?? {};
  const reaches = (name: string, seen: Set<string>): boolean => [jobs[name]?.needs ?? []].flat().some((parent) => {
    if (parent === ancestor) return true;
    if (seen.has(parent)) return false;
    return reaches(parent, seen.add(parent));
  });
  return Object.keys(jobs).filter((name) => reaches(name, new Set()));
}

/** A job with no status function gets an implicit `success()`, false when ANY ancestor was skipped, and `release` is skipped on a `status` run. */
const missingCancelled = (workflow: Workflow) =>
  downstreamOf(workflow, "release").filter((name) => !/(^|[^\w.])!cancelled\(\)/.test(workflow.jobs![name].if ?? ""));

test("positive control: the jobs below `release` are the promotion path, and `promote-action-tag` is one of them (#4021)", () => {
  const below = downstreamOf(realWorkflow(), "release");
  for (const name of ["decide", "promote", "promote-action-tag", "promotion-record"]) assert.ok(below.includes(name), `${name} not found in ${below}`);
  assert.ok(!below.includes("guards"), "a job ABOVE release is no descendant of it");
});

test("every job below `release` states `!cancelled()`, else a `status` run skips it with `release` (#4021, run 37683854478)", () => {
  assert.deepEqual(missingCancelled(realWorkflow()), []);
});

test("REFUSED: the major-tag job loses its `!cancelled()`, the defect of run 37683854478", () => {
  const broken = parse(brokenAs((w) => { w.jobs!["promote-action-tag"].if = "${{ needs.promote.result == 'success' }}"; })) as Workflow;
  assert.deepEqual(missingCancelled(broken), ["promote-action-tag"]);
});
