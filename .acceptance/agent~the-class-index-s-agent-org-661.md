The class index's `claimed-worker-stalled` entry no longer says the ledger gets one event per nudge, which a11ign/agent-org#660 (row #4826) made false. `guard` now says the ledger line is written by the release that follows a nudge nothing answered, ref `<session>/#<row>/<nudge time>`, pinned by `src/claimed-worker-stalled-ledger.test.ts`. `guardNote`'s last sentence ("A tick-written ledger event is a nudge, not proof the worker resumed") is replaced by what a repeat now means: two lines are two UNANSWERED nudges, so a `class-repeat` reading of this class IS a guard that did not bring a worker back, and what is still not seen (a `Claimed-nothing:` claim and a holder with an open pull request of its own are never released, so an unanswered nudge to one is in the wake ledger only, `<session>/claim-stalled/row-<n>/nudge-<ms>`). `name`, `seed` and every other class are untouched.

Re-read: the wording was checked against a11ign/agent-org `main` (`stalledNudgeEvents` and its doc comment in `src/claim-stall.ts`, and `src/claimed-worker-stalled-ledger.test.ts`), not against the row's text alone.

Acceptance: node -e 'const c=JSON.parse(require("fs").readFileSync(".agent-org/failure-classes.json","utf8")).classes; const o=c.find(x=>x.id==="claimed-worker-stalled"); if(/event to the failure ledger per nudge/.test(o.guard)||/not proof the worker resumed/.test(o.guardNote)||!/unanswered/i.test(o.guardNote))process.exit(1)'

Mutation: the same command run against `HEAD:.agent-org/failure-classes.json` (before this change) exits 1; against the edited file it exits 0. Measured on this branch, both exits read from `$?`. The file is data, so there is no detector to break in the other direction.

Closes a11ign/agent-org#661

🤖 Generated with [Claude Code](https://claude.com/claude-code)
