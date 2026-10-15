The reading of run 38770567987 (artifact `auth0-e2e-evidence`) is recorded in `docs/login-outcomes-reading.md`, under the heading the row names. The row's fix is not made here: the record does not say which of the three causes holds, and no fixture is added, since the real alert text is not in the record and a made-up string would test nothing.

- **The heading is present, verbatim, in the tracked document:** `git grep` matches the exact line `## Why a wrong seed ended signed-in-check-never-matched (a11ign#4084)` in `docs/login-outcomes-reading.md`.
- **The CLI's loop still passes unchanged:** the rstest run over `packages/cli/src/auth/screen-loop.test.ts` is green at this head, including `NEGATIVE CONTROL: a callback that never settles ends signed-in-check-never-matched`.

Acceptance: git grep -q "^## Why a wrong seed ended signed-in-check-never-matched (a11ign#4084)" -- docs/login-outcomes-reading.md && npx rstest run --config scripts/rstest/rstest.config.ts --include packages/cli/src/auth/screen-loop.test.ts

Mutation: none -- a reading (docs) and an acceptance file; no code or test changed, so there is no guard to break.
