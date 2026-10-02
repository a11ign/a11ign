// no-token: gh -- every `gh`, `git` and `herdr` call here is an injected seam (`io`, `lookup`, `run`) and the state files are an in-memory map; nothing imported reaches the real one
/**
 * #2998: A ROW WHOSE WORK LANDED IN ANOTHER REPOSITORY CLOSES, OR ORDERS ITS CLOSER WITH A DEADLINE.
 *
 * THE INSTANCE (chairman, 2026-10-02): #2972 -- claimed, its completion comment naming `Landed-in: a11ign/agent-org#8`, that pull request merged
 * 07:32Z, the claimant clean -- stayed open three hours. THE POSITIVE CONTROL FOR EVERY "NOTHING FIRES" CASE IS THAT FIXTURE WITH ONE THING CHANGED:
 * an open pull request, a dirty worktree, a merge nobody named, an objection. Nothing here is asserted against an empty population.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { claimStallTick, performActions, lookupLandedPr, GH_READS } from "../../../agent-org/src/work-gate.mjs";
import { landedReading, landedInOf, splitRef, LANDED_ELSEWHERE_GRACE_MINUTES } from "../../../agent-org/src/landed-elsewhere.mjs";
import { RELEASE_KINDS, claimReading, nudgeKey } from "../../../agent-org/src/claim-stall.mjs";
import { claimRecordComment } from "../../../agent-org/src/row-claim.mjs";
import { ledgerLine } from "../../../agent-org/src/wake.mjs";

const MIN = 60_000;
const iso = (ms: number) => new Date(ms).toISOString();
const ROW = 2972;
const SESSION = "worker-2972";
const BRANCH = "agent/agent-org-cut-over-2972";
const WT = "/home/agent/repos/wt-2972";
const REPO = "/home/agent/repos/a11y-witness";
const NAMED = "a11ign/agent-org#8";
const CLAIMED_AT = Date.parse("2026-10-02T07:24:32Z");
const MERGED_AT = Date.parse("2026-10-02T07:32:00Z");
const ONE_TICK_LATER = Date.parse("2026-10-02T07:33:30Z");
const GRACE_UP = MERGED_AT + LANDED_ELSEWHERE_GRACE_MINUTES * MIN;
const DONE_WHEN = "1. The sync lands in `a11ign/agent-org`.\n2. The monorepo's copy is unchanged.";

type Comment = { body: string; createdAt: string; author: { login: string } };
const WORKERS = "a11ign-ai-workers";
const claim: Comment = { body: claimRecordComment({ session: SESSION, branch: BRANCH, worktree: "../wt-2972" }), createdAt: iso(CLAIMED_AT), author: { login: WORKERS } };
const completion = (lines: string[] = [`Landed-in: ${NAMED}`], at = MERGED_AT + 45_000, author = WORKERS): Comment => ({
  body: `**${SESSION}: DONE.** agent-org#8 merged.\n\n${lines.join("\n")}\n`, createdAt: iso(at), author: { login: author } });

const row = (labels = ["in-progress", `session:${SESSION}`], body = `## What it is\nx\n\n## Done-when\n\n${DONE_WHEN}\n\n## Fleet\n\nNo.\n`) => ({
  number: ROW, title: "cut agent-org over", labels: labels.map((name) => ({ name })), body, blockedBy: { nodes: [] } });

/** A fake `git`: a worktree with `dirty` modified files and `unpushed` commits, or a clean one. */
const host = ({ dirty = 0, unpushed = 0 } = {}) => ({
  git: (_dir: string, args: string[]) => {
    if (args[0] === "rev-parse") return { status: 0, out: "" };
    if (args[0] === "log") return { status: 0, out: "" };
    if (args[0] === "status") return { status: 0, out: Array.from({ length: dirty }, (_, i) => ` M f${i}\n`).join("") };
    if (args[0] === "rev-list") return { status: 0, out: `${unpushed}\n` };
    throw new Error(`unexpected git ${args.join(" ")}`);
  },
  exists: (p: string) => p === WT,
  mtime: () => null,
});

type Answer = { merged: boolean; mergedAt?: number } | null;
const merged = (at = MERGED_AT): Answer => ({ merged: true, mergedAt: at });
const open: Answer = { merged: false };

interface Scene {
  now?: number; comments?: Comment[]; answers?: Record<string, Answer>; dirty?: number; unpushed?: number; prs?: object[];
  mergedPrs?: object[] | null; blockedBy?: number[]; agents?: { label: string; status: string }[] | null; memory?: Record<string, unknown>; ledger?: string;
}
type Order = { session: string; cause: string; discriminator: string; prompt: string; causeKey: string; release?: { why: string };
  action?: { kind: string; row: number; comment: string } };

/** One whole tick over #2972, through the REAL `claimStallTick`: the readings, the release decisions and the landed-elsewhere pass together. */
function tick(s: Scene = {}) {
  const now = s.now ?? ONE_TICK_LATER;
  const log: string[] = [];
  const asked: string[] = [];
  const memory = s.memory ?? {};
  const r = row(undefined);
  const blocked = { ...r, blockedBy: { nodes: (s.blockedBy ?? []).map((n) => ({ number: n, state: "OPEN" })) } };
  const orders = claimStallTick({ rows: [blocked], claimedComments: [{ number: ROW, comments: s.comments ?? [claim, completion()] }], openPrs: s.prs ?? [],
    mergedPrs: s.mergedPrs ?? null, io: host(s), repo: REPO, now, restartAt: null, agents: s.agents ?? null, stateDir: "/state",
    ledger: () => s.ledger ?? "", log: (l: string) => log.push(l), read: () => JSON.parse(JSON.stringify(memory)), write: () => {},
    lookup: (ref: string) => { asked.push(ref); return (s.answers ?? { [NAMED]: merged() })[ref] ?? null; } }) as Order[];
  return { orders, log, asked, offers: orders.filter((o) => o.discriminator === "landed-elsewhere"),
    closes: orders.filter((o) => o.discriminator === "landed-elsewhere-close") };
}

// --- (1) THE INSTANCE ---------------------------------------------------------------------------------------------------------

test("#2998 (1) POSITIVE CONTROL: #2972's fixture is OFFERED to product-manager one tick after the merge, carrying the pull request and the done-when", () => {
  const got = tick();
  assert.equal(got.offers.length, 1);
  assert.equal(got.closes.length, 0, "inside the grace the gate only offers");
  const [offer] = got.offers;
  assert.equal(offer.session, "product-manager");
  assert.match(offer.prompt, new RegExp(`${NAMED} MERGED 2026-10-02T07:32:00Z`));
  assert.ok(offer.prompt.includes(DONE_WHEN), "the done-when TEXT is in the prompt, not a pointer to it");
  assert.match(offer.prompt, /Objection:/);
  assert.match(offer.prompt, /by 2026-10-02T08:02:00Z/);
  assert.deepEqual(got.asked, [NAMED], "the named pull request was looked up, by its own reference");
});

test("#2998 (1) with no objection the row CLOSES at 08:02Z, the comment quoting the merged pull request and the done-when it was read against", () => {
  const before = tick({ now: GRACE_UP - 1000 });
  assert.equal(before.closes.length, 0, "one second inside the grace is still an offer");
  assert.equal(before.offers.length, 1);
  const got = tick({ now: GRACE_UP });
  assert.equal(got.offers.length, 0, "past the grace the offer is replaced by the close");
  assert.equal(got.closes.length, 1);
  const [close] = got.closes;
  assert.equal(close.action?.kind, "close-landed");
  assert.equal(close.action?.row, ROW);
  assert.ok(close.action?.comment.includes(`${NAMED} MERGED 2026-10-02T07:32:00Z`));
  assert.ok(close.action?.comment.includes(DONE_WHEN));
  assert.match(close.prompt, /could not close/, "if the close is refused the closer is told to do it by hand, with the same comment");
});

test("#2998 the close is PERFORMED by the gate (`gh issue close`), and a refusal falls back to delivering the order to product-manager", () => {
  const [close] = tick({ now: GRACE_UP }).closes;
  const calls: string[][] = [];
  const done = performActions([close], ((args: string[]) => { calls.push(args); return ""; }) as never, () => {});
  assert.equal(done.performed, 1);
  assert.deepEqual(done.delivered, []);
  assert.deepEqual(calls[0].slice(0, 5), ["issue", "close", String(ROW), "--reason", "completed"]);
  assert.equal(calls[0].at(-2), "--comment");
  assert.equal(calls[0].at(-1), close.action?.comment);
  const logged: string[] = [];
  const refused = performActions([close], (() => { throw new Error("boom"); }) as never, (l) => logged.push(l));
  assert.equal(refused.performed, 0);
  assert.equal(refused.delivered.length, 1, "THE CONTROL: the same order, refused, reaches product-manager instead");
  assert.equal(refused.delivered[0].session, "product-manager");
  assert.match(logged.join(""), /COULD NOT close-landed row-2972/);
});

// --- (2) THE NEGATIVES, EACH ITS OWN CASE -------------------------------------------------------------------------------------

test("#2998 (2) the named pull request still OPEN offers nothing", () => {
  const got = tick({ answers: { [NAMED]: open } });
  assert.deepEqual(got.orders.filter((o) => o.cause === "claim-stalled" && o.discriminator.startsWith("landed")), []);
  assert.deepEqual(got.asked, [NAMED], "it WAS asked: the silence is the answer, not a skipped read");
});

test("#2998 (2) merged, but the claimant holds 3 dirty files: the work is KEPT, nothing is offered or closed", () => {
  const got = tick({ dirty: 3, now: GRACE_UP + 5 * MIN });
  assert.deepEqual([...got.offers, ...got.closes], []);
  assert.equal(tick({ dirty: 0, now: GRACE_UP + 5 * MIN }).closes.length, 1, "CONTROL: the same row, clean, closes");
  assert.equal(tick({ unpushed: 2, now: GRACE_UP + 5 * MIN }).closes.length, 0, "and unpushed commits keep it too");
});

test("#2998 (2) a merged pull request NOBODY NAMED never closes the row", () => {
  const unnamed = tick({ comments: [claim, completion([])], answers: { [NAMED]: merged() } });
  assert.deepEqual([...unnamed.offers, ...unnamed.closes], []);
  assert.deepEqual(unnamed.asked, [], "nothing was named, so nothing was looked up");
  const elsewhere = tick({ comments: [claim, completion(["Landed-in: a11ign/agent-org#9"])], answers: { [NAMED]: merged() } });
  assert.deepEqual([...elsewhere.offers, ...elsewhere.closes], [], "a different pull request merged is not the one that was named");
  assert.equal(tick().offers.length, 1, "CONTROL: naming it is what makes it count");
});

test("#2998 (2) a landing declared by somebody ELSE, or before the claim, is not the claimant's declaration", () => {
  assert.deepEqual(tick({ comments: [claim, completion([`Landed-in: ${NAMED}`], MERGED_AT, "someone-else")] }).offers, []);
  assert.deepEqual(tick({ comments: [claim, completion([`Landed-in: ${NAMED}`], CLAIMED_AT - MIN)] }).offers, []);
});

test("#2998 (2) a row with an OBJECTION inside the grace is not closed, and one posted before the merge does not count", () => {
  const objection = (at: number): Comment => ({ body: "Objection: done-when 2 is not measured yet", createdAt: iso(at), author: { login: "a11ign-ai-leads" } });
  const objected = tick({ comments: [claim, completion(), objection(MERGED_AT + 10 * MIN)], now: GRACE_UP + 5 * MIN });
  assert.deepEqual([...objected.offers, ...objected.closes], []);
  const early = tick({ comments: [claim, objection(MERGED_AT - MIN), completion()], now: GRACE_UP + 5 * MIN });
  assert.equal(early.closes.length, 1, "CONTROL: the same objection before the landing is not an objection to it");
});

test("#2998 a named pull request that could not be READ leaves the row as it is, and says so", () => {
  const got = tick({ answers: { [NAMED]: null } });
  assert.deepEqual([...got.offers, ...got.closes], []);
  assert.match(got.log.join(""), /#2972 names a11ign\/agent-org#8, which could not be read -- not evaluated/);
});

test("#2998 with TWO named pull requests, one still open: nothing; both merged: the later merge starts the grace", () => {
  const two = [`Landed-in: ${NAMED}`, "Landed-in: a11ign/agent-org#9"];
  const comments = [claim, completion(two)];
  assert.deepEqual(tick({ comments, answers: { [NAMED]: merged(), "a11ign/agent-org#9": open } }).offers, []);
  const later = MERGED_AT + 20 * MIN;
  const both = tick({ comments, answers: { [NAMED]: merged(), "a11ign/agent-org#9": merged(later) }, now: GRACE_UP + MIN });
  assert.equal(both.closes.length, 0, "the grace runs from the LAST merge, so 08:03Z is still inside it");
  assert.equal(both.offers.length, 1);
});

// --- (3) ONE DECIDER ----------------------------------------------------------------------------------------------------------

test("#2998 (3) release (10) and the named-elsewhere close ask ONE `landedReading` and get the same shape for the same facts", () => {
  const clean = () => ({ state: "none" as const, dirty: 0, unpushed: 0 });
  const dirty = () => ({ state: "at-risk" as const, dirty: 3, unpushed: 1 });
  const hereRef = "#41";
  const elseRef = "a11ign/agent-org#41";
  for (const [work, kind] of [[clean, "landed"], [dirty, "holding"]] as const) {
    const here = landedReading({ named: [hereRef], merged: [{ ref: hereRef, mergedAt: 5 }], work });
    const there = landedReading({ named: [elseRef], merged: [{ ref: elseRef, mergedAt: 5 }], work });
    assert.equal(here?.kind, kind);
    assert.deepEqual(Object.keys(here ?? {}), Object.keys(there ?? {}), `the ${kind} reading has one shape wherever the pull request lives`);
  }
  // and release (10) IS that reading: the in-repository merged case, through `claimReading`, holds exactly when `landedReading` holds.
  const facts = (work: () => { state: "none" | "at-risk"; dirty: number; unpushed: number }) => ({ row: 1, session: "s", claimedAt: 0, branch: "b", worktree: null, comment: null, commit: null,
    push: null, file: () => null, work, openPrs: 0, mergedPr: { number: 41, mergedAt: 5 }, waiting: null, blockedBy: [] }) as unknown as Parameters<typeof claimReading>[0];
  const ctx = { now: 10, restartAt: null, nudge: null };
  assert.equal(claimReading(facts(clean), ctx).kind, "release");
  assert.deepEqual(claimReading(facts(dirty), ctx), landedReading({ named: [hereRef], merged: [{ ref: hereRef, mergedAt: 5 }], work: dirty }));
});

test("#2998 (3) `landedReading` READS THE NAMED LIST: a merged pull request not in it, an empty list, and a named one not merged are all `null`", () => {
  const clean = () => ({ state: "none" as const, dirty: 0, unpushed: 0 });
  assert.equal(landedReading({ named: [], merged: [{ ref: "#1", mergedAt: 1 }], work: clean }), null);
  assert.equal(landedReading({ named: ["#2"], merged: [{ ref: "#1", mergedAt: 1 }], work: clean }), null);
  assert.equal(landedReading({ named: ["#1", "#2"], merged: [{ ref: "#1", mergedAt: 1 }], work: clean }), null);
  assert.equal(landedReading({ named: ["#1"], merged: [{ ref: "#1", mergedAt: 1 }], work: clean })?.kind, "landed", "CONTROL");
  let asked = 0;
  landedReading({ named: ["#2"], merged: [{ ref: "#1", mergedAt: 1 }], work: () => { asked += 1; return clean(); } });
  assert.equal(asked, 0, "a row that has not landed pays for no `git status`");
});

// --- (4) THE POPULATION IS DERIVED --------------------------------------------------------------------------------------------

/** Each release kind, as the one change to the instance's fixture that makes `claimReading` answer it. `claim-stall` is the owner of the set. */
const RELEASING: Record<(typeof RELEASE_KINDS)[number], Scene> = {
  // A nudge delivered two hours and more before, and nothing since the completion comment: the second reading.
  stalled: { now: GRACE_UP + 6 * 60 * MIN, memory: { [ROW]: { session: SESSION, nudgedAt: GRACE_UP + 60 * MIN } },
    ledger: ledgerLine(GRACE_UP + 61 * MIN, nudgeKey(SESSION, ROW, GRACE_UP + 60 * MIN)) },
  blocked: { blockedBy: [2900] },
  // The row's own branch ALSO merged in this repository: the same-repository release.
  merged: { mergedPrs: [{ number: 41, headRefName: BRANCH, mergedAt: iso(MERGED_AT) }] },
  gone: { memory: { [ROW]: { session: SESSION, goneSince: ONE_TICK_LATER - 11 * MIN } },
    agents: [{ label: "ceo", status: "idle" }, { label: "orchestrator", status: "idle" }] },
};

test("#2998 (4) EVERY claim-stall release kind is listed from the exported set and DEFERS the landed-elsewhere pass to the release", () => {
  assert.deepEqual(Object.keys(RELEASING).sort(), [...RELEASE_KINDS].sort(),
    "a release kind added to `claim-stall.mjs` must be answered for here, or this fails");
  assert.ok(RELEASE_KINDS.length > 0, "the population is not empty");
  for (const kind of RELEASE_KINDS) {
    const got = tick(RELEASING[kind]);
    assert.deepEqual(got.orders.filter((o) => o.release).map((o) => o.release?.why), [kind], `${kind}: the release is what fires`);
    assert.deepEqual([...got.offers, ...got.closes], [], `${kind}: and the landed-elsewhere pass stays out of its way`);
  }
  assert.equal(tick({ prs: [{ headRefName: BRANCH }] }).offers.length, 0, "a pull request open HERE on the branch is not a finished row either");
  assert.equal(tick().offers.length, 1, "CONTROL: without any of them the same fixture is offered");
});

// --- THE PARSER, THE LOOKUP, AND THE COST -------------------------------------------------------------------------------------

test("#2998 `Landed-in:` is read from the claimant's lines only: one per pull request, a line of its own, deduplicated", () => {
  const record = { at: CLAIMED_AT, author: WORKERS };
  const lines = completion([`Landed-in: ${NAMED}`, `Landed-in: ${NAMED}`, "Landed-in: a11ign/agent-org#9", "Landed-in: not-a-reference", `see Landed-in: ${NAMED}`]);
  assert.deepEqual(landedInOf([lines], record), [NAMED, "a11ign/agent-org#9"]);
  assert.deepEqual(landedInOf([lines], { at: CLAIMED_AT, author: null }), [], "no claim author, no claimant");
  assert.deepEqual(splitRef(NAMED), { repo: "a11ign/agent-org", number: 8 });
});

test("#2998 `lookupLandedPr` aims the read at the NAMED repository, only a DECLARED one, and never turns a refusal into `open`", () => {
  const declared = ["a11ign/a11ign", "a11ign/agent-org"];
  const calls: [string[], string | undefined][] = [];
  const answering = (body: object) => ((args: string[], repo?: string) => { calls.push([args, repo]); return JSON.stringify(body); }) as never;
  assert.deepEqual(lookupLandedPr(NAMED, answering({ state: "MERGED", mergedAt: "2026-10-02T07:32:00Z" }), declared), { merged: true, mergedAt: MERGED_AT });
  assert.deepEqual(calls[0], [["pr", "view", "8", "--json", "state,mergedAt"], "a11ign/agent-org"]);
  assert.deepEqual(lookupLandedPr(NAMED, answering({ state: "OPEN", mergedAt: null }), declared), { merged: false });
  assert.deepEqual(lookupLandedPr(NAMED, answering({ state: "CLOSED", mergedAt: null }), declared), { merged: false }, "closed unmerged is not landed");
  calls.length = 0;
  assert.equal(lookupLandedPr("somebody/else#3", answering({ state: "MERGED", mergedAt: "2026-10-02T07:32:00Z" }), declared), null);
  assert.equal(calls.length, 0, "a repository the host does not declare is not asked about at all");
  assert.equal(lookupLandedPr(NAMED, (() => { throw new Error("rate limited"); }) as never, declared), null);
  assert.equal(lookupLandedPr(NAMED, answering({ state: "MERGED", mergedAt: "soon" }), declared), null, "a merge with no readable time is unreadable");
});

test("#2998 the read is COUNTED in `GH_READS`, conditional on a `Landed-in:` line", () => {
  assert.match(GH_READS.conditionalOnLandedInLine, /lookupLandedPr/);
  assert.equal(tick({ comments: [claim, completion([])] }).asked.length, 0, "a quiet claimed row costs no call");
});
