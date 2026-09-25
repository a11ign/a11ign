---
"@a11ign/lab": patch
---

**The acceptance evaluator's changed-definition refusal now names the jobs that write the corpus it is about (#2168).** It said `job=generate` then `job=capture`, which write `runs/screenreader-dataset` (the training corpus), so an operator who followed it recaptured the wrong corpus and met the same refusal byte-for-byte. It also said "recapture the cases named above", an operation no job offers: acceptance runs never cache and the acceptance capture entries take no `only`. The remedy is now `generate-acceptance`, `capture-acceptance`, `capture-acceptance-2` and `export-acceptance`, states that it is every case twice, and the scoped form is refused on the row with its reason. `acceptance-remedy-names-its-own-jobs.test.ts` reads the job names out of the message and the corpus each writes out of the catalogue.
