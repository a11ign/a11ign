---
"@a11ign/control": patch
---

**`lab:job` builds its capture pool from addresses resolved at use time, not the inventory pin (#2803).** A worker silent at its pin is looked up by MAC with `resolvePoolAtUseTime` (#2790: two agreeing reads, then `/health`), so the wake, the staleness check and the playbook aim at where the box is; each moved worker is reported with its old and new address, and a worker still absent after the wake is named and left out of a whole-fleet job. A named pool keeps its all-or-nothing rule. The playbook receives the addresses as `resolved_addresses` / `left_out_workers`, applies them with `add_host`, and asserts each is a bare IPv4 of an inventory worker; `lab:job` refuses a command line that sets either name.
