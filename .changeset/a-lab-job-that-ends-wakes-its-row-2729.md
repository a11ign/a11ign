---
"@a11ign/control": patch
"@a11ign/lab": patch
---

**A lab job that ends wakes the session holding the row it was dispatched for, carrying the result (#2729).** No gate cause fired when a job finished, so three sessions called `ScheduleWakeup` to re-poll `lab:status` in one day. `npm run lab:job -- -e job=<name> -e row=<n>` now makes `run-job.yml` write one record per InvocationID (job, row, `Result`, `ExecMainStatus`, commit, finish time) into `~/.cache/a11ign/lab-jobs/`, and a new plugin cause, `lab-job-finished`, turns each into an order for the row's holder on the next tick. A record wakes for 90 minutes (under the wake ledger's two-hour memory, so it is offered once and clears itself); a bad `row=` is refused before the job starts. With no `row=` nothing is recorded and nobody is woken. A dispatch killed before the job ends writes nothing.
