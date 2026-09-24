---
"@a11ign/control": patch
---

**`npm run lab:clear-failed -- -e job=<name>` clears ONE failed lab job unit, and refuses a sweep (#2180).** A hand-dispatched job is a transient unit that stays `failed` on the lab, and `lab:status` reported the line for as long as it stood (eleven days for `everything`) because every route that clears a handle was the wrong one: `lab:job` reaps only on the next START, `lab:stop` is for a running unit. The new play takes a catalogue NAME, never a unit or a glob (`systemctl reset-failed` with none resets every failed unit, erasing lines other owners still read), probes `is-failed` first, resets only when stdout reads `failed`, and reads the result back. Clearing is not fixing: the journal is read first, and a cause that still stands will fail the job again.
