**Nine live files no longer point at `capture-regression.yml`.** Each reference is repointed at `a11ign/lab`'s `capture-check.yml` (a link, not a copy) or reworded; the `READ_FILE_TRIGGERS` entry for the file is removed. Measured with the row's own grep over the nine Region files: **12 lines in 9 files at `origin/main` (`526f60757`), 0 after.**

Acceptance: `bash -c 'test -z "$(git grep -l "capture-regression\.yml" -- README.md CONTRIBUTING.md docs/getting-started.md docs/github-action.md RELEASE.md action.yml scripts/rstest/rstest.config.ts scripts/git-hooks/pre-push .github/workflows/action-smoke.yml)"'` exited 0 at this head.

**Premise, checked:** a11ign#5204 is still OPEN, so `.github/workflows/capture-regression.yml` is still on `origin/main` (`git ls-tree origin/main` lists it). Nothing here depends on the deletion: #5204's files (`release.yml`, the workflow itself, its acceptance file) are outside this Region, and the references point at the lab's file whether or not it has merged. The `READ_FILE_TRIGGERS` entry is redundant either way, as `.github/workflows/**` is in `READ_DIRECTORY_TRIGGERS`.

**Left alone, on purpose:** `RELEASE.md` lines naming the job `capture-regression` (no `.yml`) are dated readings of what a run showed, and `release.yml`'s gate 6 is #5204's. The dated records the row excludes are untouched.

Mutation: not applicable (link and comment edits; no guard added). The one guard that reads the edited list, `force-rerun-triggers-cover-the-27.test.ts`, is run by `pnpm run verify`.

platform: nothing built; link and comment edits.

Closes #5205
