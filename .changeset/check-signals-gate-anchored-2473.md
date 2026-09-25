---
"@a11ign/agent-org": patch
---

**The acceptance job's corpus ban matches the `check-signals` GATE, not the word (#2473).** The pattern was the bare `\bcheck-signals\b`, and `-` is a word boundary, so a test FILE named `check-signals-<anything>.test.ts` was refused as "reads runs/" though its import closure never reaches the corpus (`pr:open` printed `ACCEPTANCE: REFUSED … EXECUTED NOTHING` for `packages/lab/src/training/check-signals-pipe.test.ts`). The gate is now the name not continued by `-`, `.` or a path separator, plus `check-signals.mjs`: `npm run check-signals`, `npm run training:check-signals:complete` and `node packages/lab/src/training/check-signals.mjs` stay refused, and a test file named `check-signals-*` or `check-signals.test.ts` is runnable. Measured by `acceptance-commands.test.ts` (273 pass); widening the pattern back fails the runnable case, and a pattern that never fires fails both refused cases.
