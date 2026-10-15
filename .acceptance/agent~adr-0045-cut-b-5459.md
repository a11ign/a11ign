ADR 0045 cut (b), the B half of the plan on a11ign#928 (re-scoped 2026-10-15): the four product scripts stop loading the org tool, and nothing is declared. `scripts/repo-identity.ts` reads `REPO` from `$GITHUB_REPOSITORY` else the `origin` remote (refusing when neither names one) and `TRACKERS`/`CODE_REPOSITORIES` are deleted; `release-reads-qualification.ts` and `npm-token-liveness.ts` call `gh` themselves; `verify.ts` drops the `acceptance` (`checkBody`) and `ownedPaths` (`owned-path-signoff`) steps, which move to `CI_ONLY` with their reasons, and takes the host's suite slot only from a tool checkout already on disk instead of cloning one and refusing without it.

**Not done here, and why:** `provisionAgentOrg`, `refreshAgentOrgClone` and `verify-agent-org-cache.test.ts` are now unused by `verify`'s `main` (the slot reads `presentAgentOrg`); deleting them and their test is outside this row's Region and is filed as a row. The `.github/workflows/*` clone steps and the guards pinning them (`release-jobs-clone-the-tool.test.ts`, `consumer-gate-pin-needed.test.ts`) are cut (a)/(c)/(d) work and still hold.

platform: `gh` and `git remote get-url origin` already answer what `REPO` is; no resolver was built.

Acceptance: `bash -c 'test -z "$(git grep -l -E "toolExport|agent-org-newest-tag" -- scripts/repo-identity.ts scripts/release-reads-qualification.ts scripts/npm-token-liveness.ts scripts/verify.ts)" && test -z "$(git grep -l -E "\b(TRACKERS|CODE_REPOSITORIES)\b" -- scripts)"'`

## Evidence

Measured at this head: the command above exits 0. Measured, by mutation: appending `const _m = toolExport;` to `scripts/repo-identity.ts` exits 1, the same line appended to `scripts/verify.ts` exits 1, and appending `export const TRACKERS = [];` to `scripts/repo-identity.ts` exits 1; each file was restored byte-identical (`cmp`).

Mutation: (A) `toolExport` back in `repo-identity.ts` -> the first `test -z` fails; (B) `toolExport` back in `verify.ts` -> the first `test -z` fails; (C) `TRACKERS` back -> the second `test -z` fails, and the first still passes.

Measured: `presentAgentOrg` answers `null` for a repository with no sibling `../agent-org`, no cache and no `A11Y_AGENT_ORG_REPO`, and the host checkout for this worktree; the 10 test files that import or read `verify.ts`, `repo-identity.ts` and `release-reads-qualification.ts` ran 201 tests, 0 failed (`node --test`).
