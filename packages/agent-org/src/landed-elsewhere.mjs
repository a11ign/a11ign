// @ts-check
// #2998: A ROW WHOSE WORK LANDED IN ANOTHER REPOSITORY CLOSES, OR ORDERS ITS CLOSER WITH A DEADLINE -- it does not wait on a
// session that is itself waiting.
//
// MEASURED 2026-10-02 (the chairman's reading on the row): #2972 and #2906 stayed OPEN for three hours after their work merged
// (`agent-org#8` 07:32Z, `agent-org#6` 06:44Z), and #2973-#2977 were shelved on #2972's `blockedBy` edge the whole time. The
// merged release of `claim-stall.mjs` asks THIS repository's merged list, a row finished elsewhere has no pull request here, no
// `Closes` to resolve and no completion label, so only `product-manager` closing it moved it -- and `product-manager` was
// waiting on `ceo`.
//
// WHAT THE ROW MAY BE CLOSED ON, AND ONLY THAT: the claimant's own completion comment carries `Landed-in: owner/repo#n` (one
// line per pull request) and every named pull request is MERGED and the claimant holds nothing. A merged pull request NOBODY
// NAMED never closes a row -- the risk `close-rows-for-merged-pr.mjs` names ("a tool that closed rows automatically would
// eventually close one whose work did not actually land").
//
// A LEAF, ON PURPOSE. `claim-stall.mjs` imports `landedReading` from here for its own merged release (10), so the two cannot
// disagree about "landed"; this file therefore imports nothing from it, and the gate hands it the facts it needs (the claim
// record, the work-at-risk thunk, the lookup of a named pull request) instead.

const MINUTE_MS = 60_000;

/** How long `product-manager` has to object before the gate closes the row itself (the row's own figure). */
export const LANDED_ELSEWHERE_GRACE_MINUTES = 30;

/** `Landed-in: owner/repo#n`, one per pull request, a line of its own. The completion comment carries them. */
const LANDED_IN = /^Landed-in:[ \t]*([\w.-]+\/[\w.-]+#\d+)[ \t]*$/gm;

/** A comment that stops the close: a line of its own beginning `Objection:`, which is data the next tick reads, not a sentence. */
const OBJECTION = /^Objection:/m;

/** The `## Done-when` section of a row body, up to the next heading. */
const DONE_WHEN = /^##[ \t]+Done-when[ \t]*\n([\s\S]*?)(?=^##[ \t]|(?![\s\S]))/m;

/**
 * @typedef {{ body?: string, createdAt?: string, author?: { login?: string } | null }} RowComment
 * @typedef {{ ref: string, mergedAt: number }} MergedPr `ref` is `owner/repo#n` for another repository and `#n` for this one
 * @typedef {{ state: "none" | "at-risk" | "unknown", dirty: number, unpushed: number }} Work `claim-stall.mjs`'s `workAtRisk` answer
 * @typedef {{ kind: "landed", prs: MergedPr[], mergedAt: number }
 *   | { kind: "holding", expected: boolean, why: string }} Landed
 */

/**
 * THE ONE DECIDER OF "LANDED", shared by the same-repository release (10) and the named-elsewhere close.
 *
 * Every pull request in `named` must be among the `merged` ones (a named one still open, closed unmerged or unreadable leaves the row
 * as it is), and the claimant must hold nothing: a merged pull request with the holder still carrying dirty or unpushed files is the
 * work KEPT, never a row to close. `work` is a thunk so a row that has not landed pays for no `git status`.
 *
 * @param {{ named: string[], merged: MergedPr[], work: () => Work }} facts
 * @returns {Landed | null} `null` when the row has not landed
 */
export function landedReading({ named, merged, work }) {
  if (named.length === 0) return null;
  const found = named.map((ref) => merged.find((m) => m.ref === ref));
  if (found.some((m) => m === undefined)) return null;
  const prs = /** @type {MergedPr[]} */ (found);
  const held = work();
  if (held.state !== "none") {
    const what = held.state === "unknown" ? "the worktree could not be read"
      : `the holder still has ${held.dirty} dirty file(s) and ${held.unpushed} unpushed commit(s)`;
    return { kind: "holding", expected: held.state !== "unknown", why: `${named.join(", ")} merged, but ${what}` };
  }
  return { kind: "landed", prs, mergedAt: Math.max(...prs.map((m) => m.mergedAt)) };
}

/**
 * The pull requests the claimant DECLARED landed: every `Landed-in:` line of a comment by the claim record's own account, newer
 * than the record. The same "who is the claimant" answer `commentMove` gives, and the same stated limit: two sessions on one account
 * are one author.
 * @param {RowComment[]} comments @param {{ at: number, author: string | null }} record @returns {string[]}
 */
export function landedInOf(comments, record) {
  if (record.author === null) return [];
  const refs = new Set();
  for (const c of comments) {
    if (c.author?.login !== record.author || !(Date.parse(String(c.createdAt ?? "")) > record.at)) continue;
    for (const match of String(c.body ?? "").matchAll(LANDED_IN)) refs.add(match[1]);
  }
  return [...refs];
}

/** @param {string} ref `owner/repo#n` @returns {{ repo: string, number: number }} */
export function splitRef(ref) {
  const [repo, number] = ref.split("#");
  return { repo, number: Number(number) };
}

/** The done-when text of a row body, or a sentence saying there is none (the order must still be readable). @param {string | undefined} body */
function doneWhenOf(body) {
  const text = DONE_WHEN.exec(String(body ?? ""))?.[1].trim();
  return text === undefined || text === "" ? "(the row carries no `## Done-when` section)" : text;
}

/** @param {number} ms */
const stamp = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");

/** @param {MergedPr[]} prs */
const mergedLines = (prs) => prs.map((p) => `- ${p.ref} MERGED ${stamp(p.mergedAt)}`).join("\n");

/**
 * @typedef {{ row: number, title?: string, body?: string, session: string, comments: RowComment[],
 *   record: { at: number, author: string | null }, work: () => Work, deferred: boolean }} Candidate
 *   `deferred` is true when `claimReading` already has an answer for the row (a release, or a pull request open here): that answer wins.
 * @typedef {{ session: string, cause: string, subject: string, discriminator: string, prompt: string, causeKey: string, title?: string,
 *   action?: { kind: "close-landed", row: number, comment: string } }} LandedOrder
 */

/**
 * The offer, to the row's closer, with the evidence prefilled -- sent from the landing on and until the grace is up. `causeKey` carries no
 * time, so the ledger drops the repeats and the closer hears it once.
 * @param {Candidate} c @param {Extract<Landed, { kind: "landed" }>} landed @returns {LandedOrder}
 */
function offerOrder(c, landed) {
  return {
    session: "product-manager", cause: "claim-stalled", subject: `row-${c.row}`, discriminator: "landed-elsewhere",
    prompt: `#${c.row} LANDED IN ANOTHER REPOSITORY and is still open. ${c.session} declared it (\`Landed-in:\`) and holds nothing:\n`
      + `${mergedLines(landed.prs)}\n`
      + `THE DONE-WHEN IT IS READ AGAINST:\n${doneWhenOf(c.body)}\n`
      + `CLOSE IT if the done-when is met. IF IT IS NOT, comment on the row with a line beginning \`Objection:\` and say what is missing, `
      + `within ${LANDED_ELSEWHERE_GRACE_MINUTES} minutes of the merge (by ${stamp(landed.mergedAt + LANDED_ELSEWHERE_GRACE_MINUTES * MINUTE_MS)}). `
      + "With no objection by then the gate closes the row itself and quotes the pull request and this done-when. Its dependents "
      + "(`blockedBy`) are released by the close, with nothing else to do.",
    causeKey: `product-manager/claim-stalled/row-${c.row}/landed-elsewhere`,
    ...(c.title === undefined ? {} : { title: c.title }),
  };
}

/**
 * The close, performed by the gate (`performActions`), whose comment quotes what it was read against. IF THE CLOSE FAILS the order is
 * delivered to the closer instead, so the prompt says what to do by hand.
 * @param {Candidate} c @param {Extract<Landed, { kind: "landed" }>} landed @returns {LandedOrder}
 */
function closeOrder(c, landed) {
  const comment = `**The gate closes this row: its work landed in another repository (#2998).** ${c.session} declared it with `
    + `\`Landed-in:\` and holds nothing, and no objection was posted within ${LANDED_ELSEWHERE_GRACE_MINUTES} minutes of the merge.\n\n`
    + `${mergedLines(landed.prs)}\n\nTHE DONE-WHEN IT WAS READ AGAINST:\n\n${doneWhenOf(c.body)}\n`;
  return {
    session: "product-manager", cause: "claim-stalled", subject: `row-${c.row}`, discriminator: "landed-elsewhere-close",
    prompt: `The gate could not close #${c.row} (its work landed: ${landed.prs.map((p) => p.ref).join(", ")}). CLOSE IT by hand with this comment:\n${comment}`,
    causeKey: `product-manager/claim-stalled/row-${c.row}/landed-elsewhere-close`,
    action: { kind: "close-landed", row: c.row, comment },
    ...(c.title === undefined ? {} : { title: c.title }),
  };
}

/**
 * One row's order, or nothing. `lookup` answers for a named reference `{ merged: true, mergedAt }` (merged), `{ merged: false }` (open, closed
 * unmerged) or `null` (could not ask): a reference that could not be asked about leaves the row as it is, because "unreadable" is not "open".
 * @param {Candidate} c
 * @param {{ now: number, lookup: (ref: string) => { merged: boolean, mergedAt?: number } | null, log: (line: string) => void }} ctx
 * @returns {LandedOrder | null}
 */
function orderFor(c, { now, lookup, log }) {
  const named = landedInOf(c.comments, c.record);
  if (c.deferred || named.length === 0) return null;
  const answers = named.map((ref) => ({ ref, answer: lookup(ref) }));
  const unread = answers.filter((a) => a.answer === null);
  if (unread.length > 0) {
    log(`landed-elsewhere: #${c.row} names ${unread.map((a) => a.ref).join(", ")}, which could not be read -- not evaluated.\n`);
    return null;
  }
  const merged = answers.flatMap(({ ref, answer }) => (answer?.merged === true ? [{ ref, mergedAt: Number(answer.mergedAt) }] : []));
  const landed = landedReading({ named, merged, work: c.work });
  if (landed === null || landed.kind !== "landed") return null;
  const objected = c.comments.some((x) => OBJECTION.test(String(x.body ?? "")) && Date.parse(String(x.createdAt ?? "")) >= landed.mergedAt);
  if (objected) return null;
  return now - landed.mergedAt >= LANDED_ELSEWHERE_GRACE_MINUTES * MINUTE_MS ? closeOrder(c, landed) : offerOrder(c, landed);
}

/**
 * THE WHOLE OF `landed-elsewhere` FOR ONE TICK: an order per candidate row that landed. A row it cannot read is named on `log` and left alone.
 * @param {Candidate[]} candidates
 * @param {{ now: number, lookup: (ref: string) => { merged: boolean, mergedAt?: number } | null, log?: (line: string) => void }} ctx
 * @returns {LandedOrder[]}
 */
export function landedElsewhereOrders(candidates, { now, lookup, log = (line) => process.stderr.write(line) }) {
  return candidates.flatMap((c) => orderFor(c, { now, lookup, log }) ?? []);
}
