`CODEOWNERS` no longer asks `@a11ign-ai-leads` for `.github/workflows/` (#5044 step 2): the `/.github/workflows/ @a11ign-ai-leads` line and the ownerless `consumer-gate.yml` carve-out under it are deleted, and the header now says the file names no code owner and why. `ci.yml`'s four comments that described the CODEOWNERS request as live (the `mergeSafety` retirement note, the `deliberateRefusals` lane note and the one naming `codeowners-lane-sync.test.ts`) say it is gone. No behaviour changes: `require_code_owner_review` is false on the `merge-queue-main` ruleset, so nothing waited on the entry.

- **Measured before** (`HEAD`): the negated grep exits 1, the line being at `CODEOWNERS:28`.
- **Measured after** (this branch): it exits 0. The positive control is the before reading above, run by restoring `HEAD`'s file over the working copy and restoring mine from a copy (byte-identical, `diff -q`).
- **Does the core still carry a test that pins CODEOWNERS?** `git grep -l CODEOWNERS -- '*.test.ts'` at this head prints nothing (rc=1). The only other mention in code is `scripts/rstest/rstest.config.ts:109`, a root-file list that still names a file that still exists.
- **Not claimed:** the second command exercises agent-org's `owned-path-signoff.test.ts` and does not read this diff; it is the row's own command, run as written (12 tests, pass). The `ownedPaths` CI job reads `docs/owned-path-facts.json`, which lists no `.github/workflows/` path, so the comments say the guard is the chairman's named owned-path check and not that job.

Acceptance:
```bash
bash -c '! git grep -q "^/.github/workflows/ @a11ign-ai-leads" -- CODEOWNERS'
bash -c 'cd ~/repos/agent-org && npx rstest run --config scripts/rstest/rstest.config.ts src/packaging/owned-path-signoff.test.ts'
```

Mutation: the first command exits 1 against `HEAD`'s `CODEOWNERS` (the line present) and 0 against this branch's. Putting the line back makes it exit 1 again, so it moves with the entry and not with the file.

Closes #5096
