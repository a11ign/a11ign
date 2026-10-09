## What

The qualification decider no longer counts a `failure`/`error` status whose description begins `NO VERDICT` as a failed run (#4572 was raised from two such statuses, both launch refusals that read nothing). Such a status is skipped by `failuresSinceSuccess`, and when it is the newest, `verdictFor` returns `wait` naming it, so a sha that never gets a readable verdict reaches the existing `qualification-overdue` row rather than a `regression` row. A `NO VERDICT` older than a counted failure does not hide it.

**This only ever makes the decider slower to call a regression and never lets a sha through: every case that was not `proceed` before is still not `proceed`.** No threshold moves, no stage is skipped, nothing is reverted (#3136).

platform: checked whether GitHub statuses carry a distinct state for a refused launch; they do not (only success/failure/error/pending), so the lab's `NO VERDICT` description is the only discriminator.

## Evidence

Measured at this head: `node --import tsx packages/guards/src/release-promotes-by-evidence.test.ts` -> 109 tests, 109 pass, 0 fail (was 102). With `scripts/release-reads-qualification.ts` restored to `origin/main`, 9 fail, 6 of them the new cases; restored byte-identical afterwards.

Acceptance:
```
node --import tsx packages/guards/src/release-promotes-by-evidence.test.ts
```

Closes #4574

🤖 Generated with [Claude Code](https://claude.com/claude-code)
