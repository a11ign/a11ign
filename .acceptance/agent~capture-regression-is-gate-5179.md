**Gate 6 of `release.yml` reads the lab's own `capture-check` run on its `main`, and `capture-regression.yml` is gone** (ceo's ruling (b), stage 2, on a11ign#5179).

Acceptance: `bash -c '! grep -q "capture-regression has no harness" .github/workflows/capture-regression.yml && test ! -e .github/workflows/capture-regression.yml && grep -q "workflows/capture-check.yml/runs" .github/workflows/release.yml && ! grep -q "capture-regression.yml" .github/workflows/release.yml'`

Positive control (measured): the row's own command, `! grep -q "capture-regression has no harness" .github/workflows/capture-regression.yml`, exits 1 against `origin/main`'s file (the string is there) and 0 here. It also exits 0 when the file is merely missing, which is why the command above adds the `test ! -e` and the two reads of `release.yml`.

Mutation (the step's script, extracted from the YAML with PyYAML and run with a stub `gh` first on `PATH`; no workflow run): the newest run red over an older green exits 1; the newest `cancelled` over an older green passes on the green; a `pull_request` run whose branch is named `main` is no run and exits 1; an empty list, an API error and a non-JSON answer each exit 1 as `CANNOT_TELL`. Against the real lab it printed `capture-check on a11ign/lab main at 3da0c0a1: success`.
