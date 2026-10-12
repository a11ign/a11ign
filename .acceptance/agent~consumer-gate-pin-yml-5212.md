`consumer-gate-pin.yml`'s `repair` job now writes the regenerated pin pull request's own `.acceptance/` file onto `automation/consumer-gate-pin` with `consumer-gate.yml` (a11ign#5210 was red `ACCEPTANCE: MISSING`: the author `octo-sts[bot]` is not exempt, so the body was never read).

- **The name carries the commit, not the row's fixed `automation~consumer-gate-pin.md`.** The reader counts only a file ADDED against `main` (`--diff-filter=A`, `scripts/verify.ts`) and nothing deletes a merged `.acceptance/` file until the 14-day sweep, so a fixed name is added by the first repair and by none after it. `.acceptance/automation~consumer-gate-pin-<first 12 of the sha>.md` is new every regeneration; any one added path under `.acceptance/` is read (`isAcceptancePath`).
- **The shape check is extended, not loosened.** The handed artifact must still be exactly `consumer-gate.yml` with its pin moved; the acceptance file is written from literal text by the minting job, never from the artifact, and the branch is then compared with the commit: it must differ by those two paths and nothing else, or no pull request is opened.
- **One commit, as the row asks (reviewer-5213's blocker on `2126fe1b`).** The Contents API made a commit per file, so the repair now builds ONE tree on this commit's own tree with exactly the two entries, ONE commit on it whose only parent is this commit, and moves the branch onto it (force, as before). Run end to end against a stub `gh`: the tree carries both files byte-for-byte, the commit has the one parent, and a branch that differs by anything else stops before a pull request is opened.
- The body drops its `Acceptance:` block for `Acceptance file: <path>` (ADR 0044) and keeps `Closes: none -- ...`.

platform: the reader's own add-only rule and the existing sweep's dated-name idiom, nothing built.

Acceptance:
pnpm exec rstest run --config=scripts/rstest/rstest.config.ts --include packages/guards/src/consumer-gate-pin-needed.test.ts

History: full

Mutation: in `consumer-gate-pin-needed.test.ts`, `acceptanceFileFault` is run over the real repair script (null) and over four broken copies, each asserted to be applied and refused: the PUT of the acceptance file pointed at `$FILE_PATH` (no write), a second `git/commits` POST (two commits), the sha dropped from the name (fixed name), the `[ "$changed" = ... ]` check replaced by `true`, and the body's `Acceptance file:` line replaced by an `Acceptance:` block (the old workflow's body).

Closes a11ign/a11ign#5212
