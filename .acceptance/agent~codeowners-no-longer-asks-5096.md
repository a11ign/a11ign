`CODEOWNERS` no longer asks `@a11ign-ai-leads` for `.github/workflows/` (#5044 step 2): the `/.github/workflows/ @a11ign-ai-leads` line and the ownerless `consumer-gate.yml` carve-out under it are deleted, and the header now says the file names no code owner and why. `ci.yml`'s four comments that described the CODEOWNERS request as live (the `mergeSafety` retirement note, the `deliberateRefusals` lane note and the one naming `codeowners-lane-sync.test.ts`) say it is gone. No behaviour changes: `require_code_owner_review` is false on the `merge-queue-main` ruleset, so nothing waited on the entry.

- **Measured before** (`HEAD`): the negated grep exits 1, the line being at `CODEOWNERS:28`.
- **Measured after** (this branch): it exits 0. The positive control is the before reading above, run by restoring `HEAD`'s file over the working copy and restoring mine from a copy (byte-identical, `diff -q`).
- **Does the core still carry a test that pins CODEOWNERS?** `git grep -l CODEOWNERS -- '*.test.ts'` at this head prints nothing (rc=1). The only other mention in code is `scripts/rstest/rstest.config.ts:109`, a root-file list that still names a file that still exists.
- **Not claimed:** the second command exercises agent-org's `owned-path-signoff.test.ts` and does not read this diff; it is the row's own command (12 tests, pass locally), with the path change noted below. The `ownedPaths` CI job reads `docs/owned-path-facts.json`, which lists no `.github/workflows/` path, so the comments say the guard is the chairman's named owned-path check and not that job.

Acceptance:
```bash
bash -c '! git grep -q "^/.github/workflows/ @a11ign-ai-leads" -- CODEOWNERS'
bash -c 'T="${AGENT_ORG_TOOL:-$HOME/repos/agent-org}"; "$T/node_modules/.bin/rstest" run --config "$T/scripts/rstest/rstest.config.ts" src/packaging/owned-path-signoff.test.ts'
```

The second command is the row's, run from the PROJECT root instead of from inside the tool. The row's `cd ~/repos/agent-org` names a directory a CI runner does not have (exit 1, run 38194136528). Reading `$AGENT_ORG_TOOL` and `cd`-ing there fixed that and failed the next way (exit 1, run 38204928974): from inside the tool's own clone `resolveHomeCheckout` finds no `.agent-org/project.json` and refuses on `AGENT_ORG_HOST`, which a runner does not set. The tool's rstest config says it is meant to run from the project's root (`root` is its own repository, "not the working directory"), where this repository holds the declaration. So the command names the tool's `rstest` binary and config by `$AGENT_ORG_TOOL` (falling back to `~/repos/agent-org`) and runs from here. Same test file, same config. Reproduced under CI's condition with `env -u AGENT_ORG_HOST`: 12 tests, pass.

Mutation: the first command exits 1 against `HEAD`'s `CODEOWNERS` (the line present) and 0 against this branch's. Putting the line back makes it exit 1 again, so it moves with the entry and not with the file.

Closes #5096
