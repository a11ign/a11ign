# Agent practices — every session in this repo (chairman's direction, 2026-09-11)

These load with CLAUDE.md in every session. They are habits, not gates; the org clock on #912 reads whether
they are followed.

**EVERY WAKE LOADS EVERY FILE HERE, BUDGETED AT 20,000 BYTES WITH `CLAUDE.md` (#2217).** One topic per file
(#2092); each carries the RULE and
one clause of why; **the incident behind each is in
[`docs/operational-lessons.md`](../../docs/operational-lessons.md), under a section named for that rule.**
**A section added here is a permanent tax charged hundreds of times a day** —
`prefix-budget.test.ts` prints it. **Evict or move, never truncate.**

## Model routing for subagents

- `model="haiku"` for data gathering: file reads, counting, directory walks, grep, API listings.
- `model="sonnet"` for analysis and judgment over gathered material.
- `model="opus"` only for multi-step reasoning that a cheaper tier has measurably got wrong.
- **Every subagent call names its model.**

## Context

- `/compact` at 50–70% fill, before auto-compact; quality degrades past 70%.
- **A model change needs evidence (ceo, #1950):** two `ceo` rulings in a week reversed as WRONG, not stale,
  justify raising that cause's effort or model via #1952. **Never pin a session to Opus.**
- `/clear` between unrelated topics; a fresh window beats stale history.
- Batch related requests into one message; every round-trip re-sends the whole config stack.

## Web research

- **Run research in a subagent** (`haiku` gathers, `sonnet` digests) so pages stay in its context and
  only the digest reaches yours — with sources, never a page dump. **One fetch that the main session must
  read itself is the exception, not the habit.**
