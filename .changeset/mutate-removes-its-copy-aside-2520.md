---
"@a11ign/guards": patch
---

**`npm run mutate` no longer leaves a `mutate-*` directory in `os.tmpdir()` on every run (#2520).** The script copies the file aside into `mkdtempSync(tmpdir()/mutate-)` and never removed it, so every real use by any session leaked one directory holding one copy of the file. It now removes the directory once the restore is PROVEN: byte-identical, and (outside `--per-mutant`) the test passing again. A restore that fails, or whose bytes are back while the test still fails, exits 3 and leaves the directory, because it is then the only copy of the original, and the report names its path. Runs that end 1 (the guard did not bite) or 2 (the mutation changed nothing) restore and remove it too. `--per-mutant` is one process per mutant, so it makes and removes one directory per invocation and leaves none.
