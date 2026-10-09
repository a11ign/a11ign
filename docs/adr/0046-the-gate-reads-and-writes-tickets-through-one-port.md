# ADR 0046: the gate reads and writes tickets through one port

## Status

**Accepted, 2026-10-09.** Row #4510, Phase 0 of epic #4505 (the chairman's manager redesign). The interface is **ruled** by `ceo`
([#4505 comment 6082710487](https://github.com/a11ign/a11ign/issues/4505#issuecomment-6082710487), 2026-10-09T14:15Z) and this ADR records that
ruling section for section; the author added no decision of their own. **It changes no code.** The rows that do are agent-org#484 (the
types and the first move), #488 and #489 (the code-host port's first calls), #490 (`row-off-board`'s write) and the Phase 1 rows behind them.

**Measured by the ruling, not re-measured here.** The ruling read agent-org at `9abc80e`: `readRowsOffBoard` in `src/work-gate.ts`, the
`item-add` rung in `row-file.ts`, and 60 non-test files that spawn `gh`. A count quoted from this paragraph without re-running it is a
quotation.

## Context

**The gate reads and writes tickets by spawning `gh` from 60 non-test files, and the state a ticket is in is a label string each caller
compares.** The chairman's constraint on #4505 is: "Tracker-agnostic: the ticket interface comes first, GitHub as the first adapter and Linear
planned." Nothing can be tracker-agnostic while `ready`, `in-progress` and `answer:<session>` are strings that consumers match and write
themselves, and while "added by the chairman" means "the label `priority:chairman` was added by `DanBeckDev`" in each place that cares.

Two further facts shaped the ruling. A ticket is not a pull request: `pr-green-unarmed`, `pr-review-blocked` and
`pr-codeowner-review-missing` are acts on the **code host**, and a port that proved itself on them would prove the wrong thing. And
`src/work-gate.ts` is contended (#4475 is rewriting it, and #4524 is shelved on it), so the first move must add no line to it.

## Decision

### DECISION 1: the ticket port has four operations, no more

**A fifth operation needs a ruling from `ceo`.**

| Operation | Shape | Rule |
|---|---|---|
| read an item | `readItem(ref)` returns `{ ref, title, body, state, flags, relations, events }` | `state` is the port's own set: `backlog`, `ready`, `in-progress`, `in-review`, `done`, `parked`. `flags` are named: `priority`, `chairman-priority`, `answer-owed:<session>`, `hold`, `lane:<owner>`, `out-of-release`. `relations` carry `blockedBy`, `parent`, `children`, `linkedChanges` (a ref to a change on the code host) and the waits as data (`notBefore`, `waitingFor`). `events` is the recent tail, each with `at`, `actor`, `kind`. |
| post a decision | `postDecision(ref, { role, runId, kind, text })` | One comment, rendered by the adapter with the role and run id in a fixed header. This is Move 0's "role and run id on every decision comment". It returns the comment's id. |
| change state | `changeState(ref, { state?, addFlags?, removeFlags? })` | ONE call, atomic from the caller's side and idempotent. It returns whether anything changed. The adapter orders the underlying writes: the label add and remove in one edit, then the board Status. |
| subscribe | `subscribe(filter, handler)` | Events are port-level: `item-opened`, `state-changed`, `flag-added`, `flag-removed`, `blocker-resolved`, `decision-posted`. **Level-triggered:** an event is a hint to re-read, never the fact; a handler calls `readItem` and acts only if the gap still exists. |

### DECISION 2: the actor travels with the event

Every event and every flag change carries `actor`. "Added by the chairman" is a property of that event, answered by the adapter from the host's
configured chairman identity. It is **not** a label string a consumer compares. Today `priority:chairman` counts only when added by
`DanBeckDev`; that rule moves into the adapter unchanged.

### DECISION 3: the code host is a SEPARATE port

`CodeHostPort` is a second type, and **neither port imports the other.** A ticket holds only a change ref, `{ host, id }`, in `linkedChanges`.

Its operations, as the first consumers need them: read a change (head, checks, reviews each with the head it was posted on, merge state),
request a review, arm merge; and the events `head-moved`, `checks-settled`, `review-posted`.

Today both ports have a GitHub adapter and may live in one module; they are two types. **agent-org#484 lands the `CodeHostPort` TYPE only.**
Its adapter is built by the first row that calls it (agent-org#488, arming), and only for the operations that row uses.

### DECISION 4: the first consumer is `row-off-board`, and the first thing moved is its read

The consumer is `row-off-board` (agent-org#490) and what moves first is `readRowsOffBoard`. The reasons, as ruled:

1. It is the one Phase 1 cause that is purely a TICKET act: it reads an item's labels and Project membership and writes a state. The three
   code-host causes must not be the ticket port's proof.
2. It exercises `readItem` and `changeState` against live data every tick, so a wrong mapping shows within one tick.
3. Its writes are idempotent and cheap to revert.

agent-org#484 therefore migrates **`readRowsOffBoard` only**, extracted into `src/ticket-port/` so that it adds no line to
`src/work-gate.ts`. #490 then adds the `changeState` call. **The other 59 files are not migrated by this epic:** the rule is new code only,
held by agent-org#485's inventory and the detector filed after #484.

The adapter files are `src/ticket-port/` in agent-org, with GitHub as the first adapter. **Linear is planned**, and is not built by this epic.

### DECISION 5: the labels-as-state conventions become the GitHub adapter's mapping table

**Nothing else may write a label string.**

| Today (GitHub) | Behind the port |
|---|---|
| `ready`, `in-progress`, `backlog`, `parked` | `state` |
| `answer:<session>` | the flag `answer-owed:<session>` |
| `lane:*`, `priority`, `hold`, `out-of-release` | flags of the same name |
| the Project Status | set by `changeState`, never by a caller |
| `Closes #n` | `linkedChanges` |
| `Not-before`, `Waiting-for`, `Waits-on-done-when` | `relations` waits (`notBefore`, `waitingFor`) |

A second adapter (Linear) re-implements this table, not the consumers.

### DECISION 6: the revert for each cutover is one line, and the port has no global switch

Each consumer moves behind the per-cause switch its row names. Removing that switch returns that one cause to today's direct path. The direct
path is deleted only after the cause has run clean for a week. **Fix forward is the first response; the switch is the safety.**

## Consequences

- **Four operations are a ceiling.** A Phase 1 cause that wants a fifth waits for a ruling. That is the cost of a port small enough for a
  second adapter to implement.
- **A reading is a hint, never the fact.** Level-triggered events make every handler re-read, which costs a `readItem` per event; the
  falsifier below puts a number on how much is too much.
- **Two types for one module.** `TicketPort` and `CodeHostPort` share a GitHub adapter module today, and the discipline that neither imports
  the other has to be held by review until a check exists.
- **Most of the code stays as it is.** 59 of the 60 files that spawn `gh` are not migrated; only new code goes through the port, so
  the old and new paths coexist for as long as the per-cause switches do.
- **Rows follow from this.** agent-org#484 is amended to the scope in Decisions 3 and 4 (the `CodeHostPort` type, `readRowsOffBoard` as the one
  consumer); #488 and #489 call "the code-host port", not "the ticket port"; #490's dependency on the ticket port is unchanged.

## Alternatives rejected

- **A code-host cause as the first consumer** (`pr-green-unarmed`, `pr-review-blocked`, `pr-codeowner-review-missing`). Rejected: they are
  code-host acts and must not be the ticket port's proof (Decision 4, reason 1).
- **One port holding tickets and changes.** Rejected: it would make a ticket tracker implement merge arming, and a Linear adapter would then
  have to fake a code host (Decision 3).
- **A global switch for the port.** Rejected: a revert should return one cause to its direct path and no other (Decision 6).
- **Consumers comparing label strings or identities.** Rejected: the chairman's rule would stay in every consumer and a second adapter could
  not supply it (Decisions 2 and 5).

## What would falsify this

Any one of:

1. A Phase 1 cause that needs a fifth operation to be written.
2. A Linear adapter that cannot supply `blocker-resolved` or a per-event `actor`.
3. A port read that costs more `gh` calls per tick than the direct read it replaced (agent-org#485's inventory is the baseline).
4. A consumer that still has to name a label string.
