`a11ign login --check --flows <file> [--login-flow <name>]` runs ONLY the login and its verification in a real browser (no scan, no worker), prints `idp-origins: [...]` to paste when the login crossed origins, and writes the scrubbed failure artefact to `<witnessArtifactRoot()>/login-check`. Exit 0 signed in, 2 any failure, `LOGIN_EXIT_CODES.sessionLost` for session-lost outcomes. Outcomes come from the fault type and the classified stop page, never message text; retry is `retryDecision` only.

- **POSITIVE CONTROL** (cross-origin IdP fixture, declared origin): ends `signed-in`, exit 0, one password handed to the IdP, prints the `idp-origins:` line, writes no artefact. Same for a `login:` block via the screen loop.
- **NEGATIVE CONTROLS**: the same fixture undeclared ends `left-origin` with the line to paste and nothing typed on the provider's page; a wrong password ends `credentials-rejected` with exactly one attempt and one POST; a failed run writes `steps.json`, screenshots and trees with neither password in any file; a check the signed-out page already passes is refused before anything is typed.
- **Mutation** (run, then restored byte-identical): making `runLoginCheck` retry once after `credentials-rejected` turns exactly one test red: "NEGATIVE CONTROL: a wrong password ends credentials-rejected and attempts exactly one login" (`2 !== 1` on attempts). The other six stay green.
- **Known gaps:** a `login:` block whose check is a `url:` is refused by `login --check`; the artefact records the signed-out start page and where the login ended; `fields:` in the block is not wired. Out of Region, filed rather than fixed: the interpreter's `observeScreen` also drops unnamed `alert` nodes, so a rejected password under `auto:` waits out the 60 s budget instead of ending `credentials-rejected` at once.
- Needs a Chromium that starts; without one the browser cases SKIP with the reason printed.

Acceptance: bash -c 'git grep -q "POSITIVE CONTROL" -- packages/cli/src/login-check.test.ts && git grep -q "NEGATIVE CONTROL" -- packages/cli/src/login-check.test.ts && npx rstest run --config scripts/rstest/rstest.config.ts --include packages/cli/src/login-check.test.ts'

Closes #4995

🤖 Generated with [Claude Code](https://claude.com/claude-code)
