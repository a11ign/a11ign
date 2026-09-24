---
"@a11ign/worker-fleet": patch
---

**`run-job.yml` now says, where it writes the commit stamp, that a released unit reads as a success (#2232).** After "Release the unit", `systemctl show` answers `Result=success`, `ExecMainStatus=0` and `Description=<unit NAME>` for a job that ran and for a name that never existed alike (measured on the lab, 2026-09-23: a `train` that exited 0 after 4m12s against an invented name, byte-identical). The header gains point 4 and the `--description=` site a pointer to it; `lab-job.test.ts` pins the relationship on the parsed playbook, keyed on the release task existing. No behaviour of the launcher changes.
