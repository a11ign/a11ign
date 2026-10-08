/**
 * NO ROLE FILE TELLS ITS READER TO `CronCreate` (#4093, part of #4055).
 *
 * `.claude/rules/org-routing-and-timers.md` says no session holds a standing cron and a resumed one lists its crons once and deletes
 * what it finds. Until 2026-10-08 `product-manager.md` and `worker-loop-orchestrator.md` told a resumed session to create three, and
 * the work they scheduled already ran elsewhere (the board-report timer, `board-truth-audit` in the gate's tick), so a session obeyed
 * an instruction that was dead weight and against the rule. `ceo.md` already carried the rule's own wording.
 *
 * The property is read off the role files: a sentence naming `CronCreate` is an instruction to create one unless it forbids it.
 * Positive control: `ceo.md`, which names `CronDelete` and says no standing cron, passes. Negative control: the brief's resume block as it stood on
 * `origin/main` at a896fb89e, copied verbatim (a shallow CI checkout has no such commit to read), fails, so a detector that stopped noticing would turn this red.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROLES = resolve(import.meta.dirname, "../../../.agent-org/roles");
const FORBIDS = /\b(?:never|not|no|don't)\b/i;

function sentences(text: string): string[] {
  return text.replace(/^>\s?/gm, "").replace(/\s+/g, " ").split(/(?<=[.!?])\s/);
}

/** Sentences that name `CronCreate` without forbidding it: each is an instruction to create a cron. */
function createInstructions(text: string): string[] {
  return sentences(text).filter((s) => s.includes("CronCreate") && !FORBIDS.test(s));
}

const BEFORE_4093 = `
> **First, before reading anything: recreate this role's crons.** A session acts only on an incoming
> message or its own cron; on 2026-09-08 every session went idle at 20:52Z and nothing woke anyone for ten
> hours (zero merges, no hourly table, no 07:30 summary). A scheduled obligation that is not a cron in
> its owner's session does not exist, and crons are session-local: they die with the session and expire
> after seven days. So a resumed product-manager schedules these with \`CronCreate\` before its first read:
> - \`25 7 * * *\` (London): write and push the day's board summary from the state at that moment.
> - \`4 21 * * *\` (London): run the full tracker audit and send \`ceo\` its counts.
> Confirm the schedules to \`ceo\` in the first message after resuming.

> **And read these six before the first command; each cost a PR on 2026-09-09, in this role's own words:**
`;

test("detector: an instruction to CronCreate is found, and a prohibition of it is not", () => {
  assert.equal(createInstructions("A resumed session schedules these with `CronCreate`. Confirm them.").length, 1);
  assert.deepEqual(createInstructions("No session may `CronCreate` a standing cron. `CronDelete` what you find."), []);
});

test("positive control: ceo.md, which lists crons and deletes them, is accepted", () => {
  const ceo = readFileSync(resolve(ROLES, "ceo.md"), "utf8");
  assert.match(ceo, /`CronDelete`/);
  assert.deepEqual(createInstructions(ceo), []);
});

test("negative control: product-manager.md as it stood before #4093 is refused", () => {
  assert.equal(createInstructions(BEFORE_4093).length, 1);
});

test("the role files exist, so the sweep below is not an empty population", () => {
  const files = readdirSync(ROLES).filter((f) => f.endsWith(".md"));
  for (const expected of ["ceo.md", "product-manager.md", "worker-loop-orchestrator.md"]) assert.ok(files.includes(expected), expected);
});

test("no file under .agent-org/roles/ tells its reader to CronCreate", () => {
  const offenders = readdirSync(ROLES)
    .filter((f) => f.endsWith(".md"))
    .flatMap((f) => createInstructions(readFileSync(resolve(ROLES, f), "utf8")).map((s) => `${f}: ${s.slice(0, 80)}`));
  assert.deepEqual(offenders, []);
});
