---
"@a11ign/lab": patch
---

`corpus-snapshot.mjs`'s closing advisory now names `corpus:release` and `a11ign/corpus-backups` -- the route that already copies the archive off the machine and verifies it -- alongside its unchanged "this is on the SAME DISK, so it is not yet a backup" warning. It previously offered only `A11Y_CORPUS_REMOTE`/`corpus:backup`, which has never been configured on any machine, so the one message the lab prints unattended every night sent its reader to a dead route and nowhere else. This is #1042's defect in a third file (#2050).
