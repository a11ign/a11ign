---
"@a11ign/lab": patch
---

**`check-signals` delivers its verdict line to a slow pipe reader (#2452).** `main()` ended with `process.exit(exitCode)` straight after the whole report; into a pipe Node's stdout is asynchronous, so the exit discarded whatever the reader had not yet taken — everything past the 64 KB pipe buffer on a full corpus — and the verdict is the LAST thing printed. `corpus-restore-drill.mjs` reads the gate through a pipe, which is what reddened `main`'s `ts` job at random on PRs whose diff could not reach it. It now sets `process.exitCode` and lets the process end; the exit status is unchanged. The two earlier `process.exit` calls stay: each writes a few lines to stderr, far inside the buffer. `check-signals-pipe.test.ts` spawns the script over a 1,500-case fixture into a reader paused for 1.5 s and asserts the verdict line and the exit status; with `process.exit(exitCode)` restored it fails, with the fix it passes.
