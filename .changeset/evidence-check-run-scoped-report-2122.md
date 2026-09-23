---
"@a11ign/lab": patch
"@a11ign/control": patch
---

**`evidence:check` now keeps every run's report, not just the last one (#2122).** It wrote one fixed
path, `runs/screenreader-dataset/evidence-check/report.json`, with no run id, no timestamp and no append
— so run N+1 overwrote run N. A repeated-read protocol, the exact shape this repo uses to decide DRIFT
versus SAME, therefore left an apparatus artefact for its LAST read only.

**Measured on #1908, 2026-09-22/23.** That row's acceptance was ten `evidence:check` reads at pin
`8fd25e80c`, all ten SAME. On the lab, **read 10 was the only one with a file**; reads 1–9 survived solely
in `a11y-lab`'s systemd journal, which rotates, and the only durable copy of nine tenths of that row's
evidence was prose a session had typed into a comment. A reading in this project is trusted because it can
be re-derived from the apparatus; one that exists only in a rotating journal can only be believed.

**What changes.**
- Each run also writes `evidence-check/runs/<ISO-8601>-<pid>.json`, and `writeRunReport` **refuses** rather
  than replacing an existing run-scoped file — overwriting the previous run's artefact is the defect this
  path exists to remove.
- Both files carry `at`, `runId` and the `commit` the checkout was on, alongside the `workers` and
  per-result `worker` they already carried, so a verdict can be re-derived against the code that produced
  it. A checkout whose git is unreadable records `commitError` instead; it never records neither.
- `lab-fetch.yml` gains `evidence-check-run`, a glob resolving to the newest run-scoped file on the lab —
  the only route by which a reader outside the lab learns which run they are holding.

**What does not.** `report.json` keeps its name and its path, and goes on naming the latest run: it is the
only fetch entry this tool has, and renaming it is the failure #968 already recorded once for this same
file. The `evidence-check` fetch entry is untouched, and the verdict, the exit-code contract and the
sample are all unchanged.
