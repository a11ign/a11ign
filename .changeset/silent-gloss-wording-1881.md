---
"@a11ign/evidence": patch
---

**The "Full pages" conformance sentence no longer claims the screen reader failed when a sweep just stopped hearing new speech.** #1873's own reviewer flagged the `silent` sweep-stop gloss (`packages/evidence/src/conformance.ts`) as a stronger, definitive claim than the producer supports: `awaitLateSpeech` retries at the same log offset specifically because late speech is not the end of the page, and only reports `silent` once nothing arrives after every retry -- the code's own comment calls this an ambiguity, not a screen-reader failure. `SWEEP_STOP_GLOSS.silent` now reads "no new speech arrived after retries, cause unknown" instead of "the screen reader stopped responding". Nothing machine-readable changes -- no new field, no `--json` output change.
