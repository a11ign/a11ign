---
"@a11ign/agent-org": patch
---

**The acceptance job's capability gate reads the files a command NAMES, whatever its runner (#2221).** Both requirement checks opened with "is this `tsx --test`, or a whole suite", so `rstest run --include <file>` — the spelling every row is now required to write, and the one `package.json`'s own suite scripts use — was charged nothing: `abstention-regression.test.ts` was refused for `corpus` via `npm test` and handed to the runner when named. The predicate is gone; the walk was already right. A named command reports every file it names, the suite still stops at the first, and `// requires:` / `// no-token:` declarations suppress exactly as before. The `tsx --test` spelling reads the same as it did. Re-swept at this commit: of 428 single-file named Acceptances, 92 are now refused (46 `corpus`, 39 `token`, 1 `corpus`+`token`, 6 `history`) where 0 of 421 were.
