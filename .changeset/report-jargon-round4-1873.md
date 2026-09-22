---
"a11ign": patch
"@a11ign/evidence": patch
---

**The CLI text report now glosses bare sweep-stop codes and states what the Support line's number measures.** #1855's own closing blind-read named two more bare terms out of its Region and declined to widen scope to fix them: a sweep-stop code like `deadline`/`channelReset`/`focusModeStuck`, printed bare in the "Full pages" conformance-requirement sentence, and the Support line's cosine-similarity number, printed with no stated scale.

`packages/evidence/src/conformance.ts`: `fullPages()`'s truncated-sweep detail string now appends one plain-language gloss per stop code (`exhausted`/`repeat` are excluded -- those mean the page ran out, not us). `packages/cli/src/report.ts`'s shared legend (`howToReadThisSection`) now states the Support number is a cosine similarity to the closest training page, from -1 to 1, with the scorer's own training pages named as a reference band. Nothing machine-readable changes -- no new field, no `--json` output change.
