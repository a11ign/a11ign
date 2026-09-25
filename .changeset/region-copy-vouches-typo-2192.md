---
"@a11ign/agent-org": patch
---

**An Acceptance path the row's own `## Region` excuses is refused when a tracked file already bears its basename (#2192).** A filer writes a path once and copies it into both sections, so a wrong directory was vouched for by its copy and `acceptancePathsReason` returned `null` (#2068 named `packages/agent-org/src/acceptance-commands.test.ts`, which never existed; the module's tests are in `packages/lab/src/packaging/`). `unresolvedAcceptancePaths` now returns such a path with `twins`, every tracked file of that name, and the refusal names them all — FIX THE SPELLING, or DECLARE THE INTENT with a `New-file: <path>` line (`declaredNewFiles`) for a row really creating a second file of that name. Matching is on the BASENAME, never the directory, and a Region-excused path with no same-named tracked file still files, so a row can still reserve a file it has not written. The tracked-file list is read only when a Region excused something absent.
