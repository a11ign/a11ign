---
"@a11ign/lab": patch
---

**`check-signals` no longer loses its verdict line to a slow reader (fixes the red trunk at #2441's merge, `92914d89`).** It ended in `process.exit(code)`, and its output is ~170 KB on a full manifest with the verdict LAST; stdout to a pipe is asynchronous, so exiting dropped whatever the reader had not yet taken. A parent that read slowly — `corpus-restore-drill`'s hollow-archive control in the CI unit run — saw the case list and `(no verdict line; …)` for a gate that had answered INCONCLUSIVE, and `/INCONCLUSIVE/` failed. It now sets `process.exitCode`, so the stream drains first and the code is unchanged. Measured: a 3 s stall in the reader printed the verdict 0 times before, once after. `signal-verdict-survives-slow-reader.test.ts` stalls the reader deterministically and goes red with `process.exit` put back.
