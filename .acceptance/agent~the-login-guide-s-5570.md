Brings the text of `docs/try-it.md` and `docs/github-action.md` up to `a11ign@0.10.8`, read against that tag's own files (`packages/cli/src/auth/flows.ts`, `packages/cli/src/action/interpreter.ts`, `known-gaps.md` §51, and the worker 0.13.2 `auth-flow` dist). The Action takes no authenticator code: the first paragraph under `## Behind a login` says so. Pin lines and the `v0.1.0`-predates sentences are unchanged.

**Measured at this head:** the two Acceptance commands pass, and `docs-release-pin-currency` plus `renovate-config` pass (`rstest`, the command below).

**Not done here (named):** the stale sentences found outside the two files are listed in the PR body and not edited.

Acceptance: bash -c 'grep -L -E "a11ign@0\.9\.0|0\.10\.2" docs/try-it.md docs/github-action.md | wc -l | grep -qx 2 && sed -n "/^## Behind a login/,/^### 1\./p" docs/try-it.md | grep -q "the Action does not take an authenticator code"'

Closes #5570
