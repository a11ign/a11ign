# Fleet convergence baseline: captures that ran on fewer boxes than the fleet (#4444, part (d) of #4405)

The number taken BEFORE the first patch run of #4405, so the reading a month after it has something to be
compared with. Read 2026-10-09 by `worker-4444`, on the driving host, from what is recorded. No `fleet:*`,
`lab:*` or `capture:*` command was run to produce it (the engineer resource ban).

## The answer: it cannot be derived from what is recorded

**Measured: 0 of the last 90 days' capture runs have a record of how many boxes were awake and capture-capable
at the start.** So the count of runs where participants < ready, and the reason for each, is **not recorded**.
It is not estimated here. The two things the row asks for are missing for different reasons:

| figure | state | why |
|---|---|---|
| boxes awake and capture-capable at the start (`fleet:status` ready count) | **not recorded** | `fleet:status` prints it to a terminal; nothing writes it beside a capture run |
| boxes that took part | recorded for **1 run** on this host, otherwise **not recorded** | the run's stdout is the only record (`Across N worker(s)`), and only one such log survives locally |
| runs where participants < ready | **not recorded** | needs both figures |
| why a box sat out (exit 3 then an exclusion; asleep; down) | **not recorded** | `capture-fleet-guard.mjs` reports `FLEET INCONSISTENT` on stderr and exits 3; the exclusion that follows is a hand edit of the worker list, and the guard's own comment says `capture-real-pages.mjs` "writes no structured run record" |

**The field that would have to be written** is one per-run record, at the start of every capture run:
`{ startedAt, readyCount, participants[], excluded: [{ worker, reason: "inconsistent" | "asleep" | "down" }] }`.
It is filed as a row: see [Rows filed](#rows-filed).

## The runs that can be read

One row per run whose participants are recorded. `ready at start` is "not recorded" in every row.

| run | date (UTC) | captured into | participants | ready at start | participants < ready | why |
|---|---|---|---|---|---|---|
| run 1: `capture-real-pages`, 49 real pages | 2026-09-24T15:30 | `/opt/a11y/runs/real-page-corpus` | 10 (last octets `.107 .59 .175 .224 .90 .21 .146 .217 .80 .74`) | not recorded | not recorded | not recorded |

Context for run 1, so the 10 is not misread: the fleet was **enrolled at 10** on that date and went to 15 on
2026-09-26 (#2654), so 10 participants equals the enrolled fleet at the time. *Enrolled* is not *ready*: a box
that was asleep would still be enrolled, and nothing says whether one was.

## A different reading that is recorded: which boxes rose in the last 24 hours

This is **not** a per-run reading and does not answer the row. It is the nearest thing that is written down.
`fleet-watch` polls each worker's capture counter and keeps the increases of the last 24 hours (`CAPTURE_WINDOW_MS`
in `fleet-watch.mjs`), so older runs are dropped by design.

Read at 2026-10-09T07:47Z (the file's own `seenAt`): of **15** enrolled boxes, **11** had a counter rise in the
window and **4** (`a11y-worker-7`, `-8`, `-9`, `-11`) had none, the last rise on each being 2026-10-06T08:47Z.
Those are the four the #4405 report names. **The file cannot say why**: asleep, down and excluded all read as
"no rise". The counter is also the worker's own, so a restart resets it (`uptimeMs` is read for that reason).

## Sources, each repeatable unchanged

| figure | exact source | note |
|---|---|---|
| participants of run 1 | `sed -n 2p ~/repos/a11y-witness/runs/fetched/capture-real-pages.log` | the `Across N worker(s):` line; `grep -n -E "Across [0-9]+ worker" ~/repos/a11y-witness/runs/fetched/*.log` finds any other |
| other runs' participants | none | `grep -c -E "Across [0-9]+ worker" ~/repos/a11y-witness/runs/fetched/*.log` printed 1 match in 1 file on 2026-10-09 |
| enrolled fleet size | `gh issue view 2654 --repo a11ign/a11ign` | 10 to 15 on 2026-09-26 |
| exit 3 exclusion path | `grep -n "EXIT_FLEET_INCONSISTENT" ~/repos/lab/packages/lab/src/training/capture-fleet-guard.mjs` (lab at `a725b332`) | stderr only; no file |
| 24 h counter rises | `python3 -I -c "import json;d=json.load(open('runs/fleet-captures-state.json'));print({w[-2:]:len(v['rises']) for w,v in d['workers'].items()})"` run in `~/repos/a11y-witness` | writer is `advanceWorker` in `~/repos/control/packages/control/src/fleet-watch.mjs` (control at `3ae20b1`) |
| per-capture worker identity | none | a capture's `environment` carries `workerCode` and `windowsVersion`, never a box name or address, so participation cannot be rebuilt from `runs/witness` either |

The lab holds the full corpus and its logs; this host's `runs/` is a partial replica (`capture-host.mjs`). A run
the lab alone remembers is a **corpus-reading limitation** and is routed to `orchestrator` on the row, not worked
around from a stale local copy.

## Rows filed

**#4459** (`ready`, `lane:any`, parent #4405) writes the per-run record named above, in the lab repository.
Until it merges, **the month-later reading has no "before" for runs earlier than that merge**, and the first
month of its data is the baseline. A corpus-reading limitation (the lab alone may remember runs this host's
`runs/` does not) is routed to `orchestrator` on #4444.

## What the follow-up reading repeats

After the record exists: one month of its rows, `count(participants < readyCount) / count(runs)`, grouped by
`excluded[].reason`, compared with the run count this file could not give. Until then the honest "before" is the
sentence in [The answer](#the-answer-it-cannot-be-derived-from-what-is-recorded).
