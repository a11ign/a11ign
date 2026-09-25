---
"@a11ign/agent-org": patch
---

**`pr:open` refuses a diff that leaves the row's Region, before anything is sent to GitHub (#2417).** Three reviews were spent on a path a row never declared (#2253 twice, #2408), each after the PR had reached a reviewer. The Region is read from the row the body's `Closes #N` names, through `region-paths.mjs`; a path outside it is refused with the Region it was read against, the escape's exact spelling and the exempt set (the lockfile, `docs/commands.md`, `.changeset/`). The way through is a declared line in the PR body, `Outside-Region: <path> — <reason>`, em dash required: a hyphen, an empty reason or another path clears nothing, and a line that misses the shape is reported as ignored. `Closes: none` has no row, so it is not checked and the output says so; a row that cannot be read refuses. The check runs from the CLI only (`main` takes the row reader as a seam, so its direct callers never reach GitHub).
