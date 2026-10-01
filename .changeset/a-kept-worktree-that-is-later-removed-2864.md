---
"@a11ign/agent-org": patch
---

**A kept worktree that is later removed no longer leaves its record and branch behind (#2864).** A claim released by the gate KEEPS the tree for the next instance and records it in `kept-claims.json`; whoever later removed the tree (a merge-cleanup sweep, `endFinishedSpares`, a person) removed only the tree, so the record outlived it and the leftover local branch made the respawn's claim refuse every tick (`--branch=... ALREADY EXISTS locally`) -- #2846 for over an hour, with all 9 records in the file naming a vanished tree. The spawner now treats a record whose tree is gone as no record: it drops it and deletes the recorded branch with `git branch -d`, never `-D`, so a branch holding commits found nowhere else is left and the claim's own refusal names it. The tick also drops every such record up front (one stdout line each, then none), so a record for a row nobody offers does not linger. A record whose tree exists is never touched.
