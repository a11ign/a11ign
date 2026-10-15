ADR 0045 cut (b), the B half of the plan on a11ign#928 (re-scoped 2026-10-15): the four product scripts stop loading the org tool, and nothing is declared. `scripts/repo-identity.ts` reads `REPO` from `$GITHUB_REPOSITORY` else the `origin` remote (refusing when neither names one) and `TRACKERS`/`CODE_REPOSITORIES` are deleted; `release-reads-qualification.ts` and `npm-token-liveness.ts` call `gh` themselves; `verify.ts` drops the `acceptance` (`checkBody`) and `ownedPaths` (`owned-path-signoff`) steps, which move to `CI_ONLY` with their reasons, and takes the host's suite slot only from a tool checkout already on disk instead of cloning one and refusing without it.

**Not done here, and why:** `provisionAgentOrg`, `refreshAgentOrgClone` and `verify-agent-org-cache.test.ts` are now unused by `verify`'s `main` (the slot reads `presentAgentOrg`); deleting them and their test is outside this row's Region and is filed as a row. The `.github/workflows/*` clone steps and the guards pinning them (`release-jobs-clone-the-tool.test.ts`, `consumer-gate-pin-needed.test.ts`) are cut (a)/(c)/(d) work and still hold.

platform: `gh` and `git remote get-url origin` already answer what `REPO` is; no resolver was built.

Acceptance: `bash -c 'test -z "$(git grep -l -E "toolExport|agent-org-newest-tag" -- scripts/repo-identity.ts scripts/release-reads-qualification.ts scripts/npm-token-liveness.ts scripts/verify.ts)" && test -z "$(git grep -l -E "\b(TRACKERS|CODE_REPOSITORIES)\b" -- scripts)"'`

## Evidence

Measured at this head: the command above exits 0. Measured, by mutation: appending `const _m = toolExport;` to `scripts/repo-identity.ts` exits 1, the same line appended to `scripts/verify.ts` exits 1, and appending `export const TRACKERS = [];` to `scripts/repo-identity.ts` exits 1; each file was restored byte-identical (`cmp`).

Mutation: (A) `toolExport` back in `repo-identity.ts` -> the first `test -z` fails; (B) `toolExport` back in `verify.ts` -> the first `test -z` fails; (C) `TRACKERS` back -> the second `test -z` fails, and the first still passes.

Measured at head `1914be542` (the code and tests as pushed; the commit that follows it changes only this file and the PR body): `pnpm run verify` GREEN, the affected set 11 test files / 258 tests against `origin/main` (the 9 new tests are in `packages/guards/src/verify-present-agent-org.test.ts` and `release-scripts-call-gh.test.ts`, where the gates look: `scripts/*.test.ts` is picked up by none); `node scripts/coverage.ts` exits 0 (it exited 1 at `b856b4250`, from `: string` return types in `repo-identity.ts` that the coverage provider cannot parse).

Mutation, tests: `presentAgentOrg` returning `null` always, and returning the cache directory when it is absent, each exit 1; `gh` in `npm-token-liveness.ts`, and in `release-reads-qualification.ts`, swallowing a non-zero exit each exit 1; every file restored byte-identical (`cmp`). Positive controls in the same file: a sibling, an explicit `A11Y_AGENT_ORG_REPO`, and the cache are each found, and the absent case creates no cache and no `FETCH_HEAD`.
