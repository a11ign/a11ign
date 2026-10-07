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
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse, stringify } from "yaml";
import {
  candidatesFrom,
  decidePromotion,
  promotionLine,
  promotionPlan,
  promotionTimeFrom,
  readDistTags,
} from "../../../scripts/release-promote.mjs";
import { qualificationDecision, WAIT_BOUND_MINUTES } from "../../../scripts/release-reads-qualification.mjs";

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

/** The job the row's Acceptance finds: `npm-publish`, `id-token: write`, a `dist-tag add`, and the decider named. */
function promotionJobName(workflow: Workflow): string | undefined {
  const found = Object.entries(workflow.jobs ?? {}).filter(([name]) => !PUBLISH_PATH.includes(name)).find(([, job]) => {
    const text = JSON.stringify(job);
    return job.environment === "npm-publish" && job.permissions?.["id-token"] === "write" && /dist-tag add/.test(text) && /release-reads-qualification/.test(text);
  });
  return found?.[0];
}

/** Would `job` run for an event of this name? Only the two `if` shapes the file uses are understood; anything else COUNTS AS RUNNING. */
function runsOn(job: Job, event: string): boolean {
  const expression = (job.if ?? "").replace(/^\$\{\{\s*|\s*\}\}$/g, "").trim();
  if (expression === "") return true;
  const equals = /^github\.event_name == '([a-z_]+)'$/.exec(expression);
  if (equals) return equals[1] === event;
  const differs = /^github\.event_name != '([a-z_]+)'$/.exec(expression);
  if (differs) return differs[1] !== event;
  return true;
}

function refusals(text: string): string[] {
  const workflow = parse(text) as Workflow;
  const jobs = workflow.jobs ?? {};
  const name = promotionJobName(workflow);
  if (!name) return ["no job moves a dist-tag by OIDC in `npm-publish` and names the decider"];
  const promote = jobs[name];
  const found: string[] = [];
  found.push(...holdRefusals(workflow, name, promote));
  found.push(...startRefusals(workflow, name));
  found.push(...publishPathRefusals(workflow, name));
  found.push(...stepRefusals(promote));
  return found;
}

const ALLOWED_PERMISSIONS = new Set(["id-token", "contents", "statuses"]);

function holdRefusals(workflow: Workflow, name: string, promote: Job): string[] {
  const found: string[] = [];
  const extra = Object.entries(promote.permissions ?? {}).filter(([key, value]) => !ALLOWED_PERMISSIONS.has(key) && value !== "none");
  if (extra.length > 0) found.push(`the promotion job holds more than it needs: ${extra.map(([k]) => k).join(", ")}`);
  if (promote.permissions?.contents === "write") found.push("the promotion job holds contents: write");
  const others = Object.entries(workflow.jobs ?? {}).filter(([other]) => other !== name && !PUBLISH_PATH.includes(other));
  for (const [other, job] of others) found.push(...otherJobRefusals(other, job));
  return found;
}

function otherJobRefusals(name: string, job: Job): string[] {
  const found: string[] = [];
  if (job.permissions?.["id-token"] === "write") found.push(`${name} also holds id-token: write`);
  if (job.permissions?.["issues"] === "write" && /dist-tag/.test(stepsText(job))) found.push(`${name} holds issues: write beside a dist-tag`);
  return found;
}

function startRefusals(workflow: Workflow, name: string): string[] {
  return [...pushTriggerRefusals(workflow), ...statusTriggerRefusals(workflow, name), ...concurrencyRefusals(workflow)];
}

function pushTriggerRefusals(workflow: Workflow): string[] {
  const push = workflow.on?.push;
  const exact = JSON.stringify(push?.paths) === JSON.stringify([".changeset/**"]) && JSON.stringify(push?.branches) === JSON.stringify(["main"]);
  return exact ? [] : ["the `push` trigger is not exactly `main` + `.changeset/**`"];
}

function statusTriggerRefusals(workflow: Workflow, name: string): string[] {
  const found: string[] = [];
  if (!("status" in (workflow.on ?? {}))) found.push("nothing starts the promotion when the lab posts a status");
  if (workflow.on?.schedule !== undefined) found.push("a `schedule` polls for work the status event already announces");
  if (!/event\.context == 'qualification'/.test(workflow.jobs?.[name]?.if ?? "")) found.push("the promotion job does not narrow a `status` event to the `qualification` context");
  return found;
}

function concurrencyRefusals(workflow: Workflow): string[] {
  const group = workflow.concurrency?.group ?? "";
  if (group === "release") return ["a status run shares the publish concurrency group and can displace a pending release"];
  return /status/.test(group) ? [] : ["the workflow concurrency group does not separate status runs from the publish"];
}

function publishPathRefusals(workflow: Workflow, name: string): string[] {
  const found: string[] = [];
  const jobs = workflow.jobs ?? {};
  for (const job of PUBLISH_PATH) {
    if (!jobs[job]) found.push(`the publish-path job is missing: ${job}`);
    else if (runsOn(jobs[job], "status")) found.push(`${job} would run on a status event`);
  }
  const release = [jobs.release?.needs ?? []].flat();
  if (release.includes(name)) found.push("`release` waits for the promotion job");
  const promoteNeeds = [jobs[name]?.needs ?? []].flat();
  if (!promoteNeeds.includes("release")) found.push("the promotion job does not wait for `release`, so a push run could promote before the publish");
  return found;
}

function stepRefusals(promote: Job): string[] {
  const found: string[] = [];
  const steps = promote.steps ?? [];
  if (!steps.some((s) => /npm dist-tag add .* latest/.test(s.run ?? ""))) found.push("no step runs `npm dist-tag add <spec> latest`");
  if (steps.some((s) => /\b(npm|pnpm)\s+(stage|publish)\b/.test(s.run ?? ""))) found.push("the promotion job publishes or stages");
  if (steps.some((s) => /NODE_AUTH_TOKEN|NPM_TOKEN|A11IGN_BOT_TOKEN/.test(JSON.stringify(s)))) found.push("the promotion job holds a stored token: OIDC must be what npm uses");
  if (!steps.some((s) => /release-promote\.mjs/.test(s.run ?? ""))) found.push("no step runs `scripts/release-promote.mjs`");
  const pull = steps.findIndex((s) => /release-promote\.mjs/.test(s.run ?? ""));
  const move = steps.findIndex((s) => /dist-tag add/.test(s.run ?? ""));
  if (pull !== -1 && move !== -1 && move < pull) found.push("the tag is moved before the decision is made");
  if (!steps.some((s) => (s.if ?? "").includes("steps.plan.outputs.promote"))) found.push("the tag move is not conditioned on the plan's `promote` output");
  return found;
}

function brokenAs(edit: (workflow: Workflow) => void): string {
  const workflow = parse(readFileSync(WORKFLOW, "utf8")) as Workflow;
  edit(workflow);
  return stringify(workflow);
}

const realWorkflow = () => parse(readFileSync(WORKFLOW, "utf8")) as Workflow;
const promoteOf = (workflow: Workflow) => workflow.jobs![promotionJobName(workflow)!];

test("the real release.yml has a promotion job that satisfies every structural property", () => {
  assert.deepEqual(refusals(readFileSync(WORKFLOW, "utf8")), []);
});

test("positive control: the checker finds the job in the real file, and the file's own Acceptance filter finds exactly one", () => {
  const workflow = realWorkflow();
  assert.ok(promotionJobName(workflow));
  const matching = Object.entries(workflow.jobs ?? {}).filter(([k]) => k !== "release" && k !== "guards").filter(([, v]) => {
    const text = JSON.stringify(v);
    return v.environment === "npm-publish" && v.permissions?.["id-token"] === "write" && /dist-tag add/.test(text) && /release-reads-qualification/.test(text);
  });
  assert.equal(matching.length, 1);
});

test("a promotion job whose only mention of the words is a comment-like echo is not found", () => {
  const text = brokenAs((w) => {
    const job = promoteOf(w);
    delete w.jobs![promotionJobName(w)!];
    w.jobs!.guards.steps!.push({ run: "echo 'dist-tag add release-reads-qualification'" });
    assert.ok(job);
  });
  assert.deepEqual(refusals(text), ["no job moves a dist-tag by OIDC in `npm-publish` and names the decider"]);
});

const BREAKS: { name: string; edit: (w: Workflow) => void; says: RegExp }[] = [
  { name: "the job also holds issues: write", edit: (w) => { promoteOf(w).permissions!.issues = "write"; }, says: /holds more than it needs: issues/ },
  { name: "the job holds contents: write", edit: (w) => { promoteOf(w).permissions!.contents = "write"; }, says: /contents: write/ },
  { name: "the `push` trigger is widened to every path", edit: (w) => { delete w.on!.push!.paths; }, says: /`push` trigger/ },
  { name: "the `push` trigger gains another branch", edit: (w) => { w.on!.push!.branches!.push("agent/**"); }, says: /`push` trigger/ },
  { name: "nothing starts the promotion on a status", edit: (w) => { delete w.on!.status; }, says: /status/ },
  { name: "a schedule polls instead", edit: (w) => { w.on!.schedule = [{ cron: "*/10 * * * *" }]; }, says: /schedule/ },
  { name: "every status context starts the promotion", edit: (w) => { promoteOf(w).if = "github.event_name == 'status'"; }, says: /`qualification` context/ },
  { name: "a status run shares the publish group", edit: (w) => { w.concurrency!.group = "release"; }, says: /concurrency group/ },
  { name: "the guards job would run on a status event", edit: (w) => { delete w.jobs!.guards.if; }, says: /guards would run on a status event/ },
  { name: "the Windows capture job would run on a status event", edit: (w) => { delete w.jobs!["capture-regression"].if; }, says: /capture-regression would run on a status event/ },
  { name: "the release job would run on a status event", edit: (w) => { w.jobs!.release.if = "github.event_name != 'workflow_dispatch'"; }, says: /release would run on a status event/ },
  { name: "release waits for the promotion", edit: (w) => { w.jobs!.release.needs = [...[w.jobs!.release.needs].flat() as string[], promotionJobName(w)!]; }, says: /`release` waits for the promotion job/ },
  { name: "the promotion does not wait for release", edit: (w) => { delete promoteOf(w).needs; }, says: /does not wait for `release`/ },
  { name: "the move step is gone (the job is then no longer the promotion job at all)", edit: (w) => { promoteOf(w).steps = promoteOf(w).steps!.filter((s) => !/dist-tag add/.test(s.run ?? "")); }, says: /no job moves a dist-tag/ },
  { name: "the job publishes", edit: (w) => { promoteOf(w).steps!.push({ run: "npm publish --tag latest" }); }, says: /publishes or stages/ },
  { name: "a stored token is used", edit: (w) => { promoteOf(w).steps![promoteOf(w).steps!.length - 1].env = { NODE_AUTH_TOKEN: "${{ secrets.NPM_TOKEN }}" }; }, says: /stored token/ },
  { name: "the move runs whatever the plan said", edit: (w) => { for (const s of promoteOf(w).steps!) if (/dist-tag add/.test(s.run ?? "")) delete s.if; }, says: /not conditioned on the plan/ },
];

for (const broke of BREAKS) {
  test(`REFUSED: ${broke.name}`, () => {
    const found = refusals(brokenAs(broke.edit));
    assert.ok(found.some((line) => broke.says.test(line)), `refusals were: ${JSON.stringify(found)}`);
  });
}

test("the row-filing job holds issues: write and nothing else, the record job contents: write and nothing else, and neither holds id-token", () => {
  const workflow = realWorkflow();
  const promote = promotionJobName(workflow)!;
  const others = Object.entries(workflow.jobs ?? {}).filter(([k]) => !PUBLISH_PATH.includes(k) && k !== promote);
  assert.deepEqual(others.map(([k]) => k).sort(), ["promote-action-tag", "promotion-record", "promotion-row"]);
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
  assert.deepEqual([row.needs].flat(), [promotionJobName(realWorkflow())]);
});

test("the header of release.yml states the two channels and when `latest` moves (#2052)", () => {
  const header = readFileSync(WORKFLOW, "utf8").split("\nname: release")[0];
  assert.match(header, /TWO CHANNELS/);
  assert.match(header, /`next`/);
  assert.match(header, /`latest` MOVES ONLY/);
  assert.doesNotMatch(header, /nothing here runs it/);
});
