---
"@a11ign/control": patch
---

**The fleet auto-off timer's unit now passes `--apply`, so a live timer powers an idle worker off instead of printing a report every ten seconds (#2784).** #2656 shipped `a11y-fleet-auto-off.service` without the flag ("the third row's step"), #2734 was that third row and flipped the timer live but left the flag out, and the playbook was never run — so `a11y-control` still held the disabled #2656 copy and 15 workers sat powered at 0 captures for 25h+ with both rows closed. `fleet-auto-off.test.ts` now pins the unit's `ExecStart` (a unit that reports and exits 0 is otherwise indistinguishable from one that works) and the timer/playbook pair.
