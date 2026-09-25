---
"@a11ign/guards": patch
---

**An agent session's rstest report now ends in a `VERDICT` line that names the count run and refuses zero, and carries only what failed (#2541).** A run that matched no test printed `"status": "pass"` over `"tests": 0`; the report now ends `VERDICT REFUSED: 0 tests run` (and `VERDICT pass: 154 tests in 11 files` when tests ran), whether the command is the direct form or a wrapped one. Outside CI a failing run's blocks drop the code frame and the list of files a trace touched, and the line names `A11Y_RSTEST_FULL_REPORT=1`, which gives the whole report back. CI's report and the `json` run record are unchanged. `npm run mutate` reads the line: it refuses a clean run that ran zero tests, and names the count the clean run ran and the tests that failed under the mutant.
