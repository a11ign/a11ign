---
---

Names no release. The launchers record their exit code with the redirect first (`>> capture-check.log echo EXITCODE=...`): a digit directly before `>>` is a cmd handle number, so the old line wrote nothing to the log on success and `EXITCODE=` without its digit on the early exits (#3397). `provisionRevision` is unchanged: neither launcher is hashed by the stamp.
