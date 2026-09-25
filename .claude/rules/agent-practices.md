# Agent practices — every session in this repo (chairman's direction, 2026-09-11)

**EVERY WAKE LOADS EVERY FILE HERE, BUDGETED AT 20,000 BYTES WITH `CLAUDE.md`
(#2217):** each carries the RULE and one clause of why, and **the incident is in
[`docs/operational-lessons.md`](../../docs/operational-lessons.md), under a section named for that rule.**
**A section added here is a permanent tax charged hundreds of times a day; evict or move, never truncate.**

## Model routing for subagents

- `model="haiku"` for data gathering: file reads, grep, API listings.
- `model="sonnet"` for analysis and judgment over gathered material.
- `model="opus"` only for multi-step reasoning that a cheaper tier has measurably got wrong.
- **Every subagent call names its model.**

## Context

- `/compact` at 50–70% fill, before auto-compact.
- **A model change needs evidence (ceo, #1950):** two `ceo` rulings in a week reversed as WRONG, not stale,
  justify raising effort or model. **Never pin a session to Opus.**
- `/clear` between unrelated topics; a fresh window beats stale history.
- Batch related requests into one message.

## Web research

- **Run research in a subagent** (`haiku` gathers, `sonnet` digests), so only a digest with sources reaches
  your context, never a page dump. **One fetch that the main session must read itself is the exception, not the habit.**

## The scratchpad is shared

- **Never capture output into a directory you are also reading:** `grep` over `tasks/*.output` writing
  into `tasks/` quotes itself.
- **No virtualenvs, wheels, weights or fetched corpora in the scratchpad:** every session shares it, counted in
  inodes as well as bytes and swept at one day; a full one shows as empty output or ENOSPC.
