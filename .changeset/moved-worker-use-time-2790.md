---
"@a11ign/control": patch
---

**`doctor` and `worker:code` re-resolve a worker whose address moved, at the moment they use it, and no longer hold the run for a missing one (#2790).** `with-control-plane-fleet.mjs` used to set `A11Y_WORKERS` from each worker's pinned `url` alone, so a run aimed at a worker that DHCP had moved went to its old address, and at worst to whatever machine held it next. Now a worker that answers `/health` at its pin is used as pinned and asked nothing more; one that does not is looked up by its declared `mac` (`resolveMovedByMacLive`), used only when two separate MAC reads agree and the new address answers `/health`, and reported on stderr as `MOVED <name>: pinned <url>, answers by MAC at <url>`. A worker that cannot be found is reported as `MISSING <name>` and left out; a run with no worker left refuses (exit 1) before it spawns the bin. `inventory.yml` is never rewritten. `lab:job`, `fleet:deploy` and `fleet:provision` are not changed here (#2803).
