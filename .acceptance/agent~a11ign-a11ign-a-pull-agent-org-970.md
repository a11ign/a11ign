A pull request that touches `package.json`, `pnpm-lock.yaml`, `.npmrc` or `.github/workflows/` now dry-runs the release's `version` step in CI (a11ign/agent-org#970, the whole refile of closed #969; a11ign/agent-org#888, #885 class 3).

**What moved:** `.github/workflows/ci.yml` only.

- **A `release-dry-run` job**, adapted from a11ign/agent-org's (`#967`, merged, read from its `main`): `contents: read`, a full-depth checkout that keeps no credential, and a `touched` step that reads `git diff --name-only HEAD^1 HEAD` itself. The install, `changeset version` and `pnpm install --lockfile-only` run on a scratch clone only when one of the four paths changed; an untouched change is `success`, not a skip. A body or label event skips the job by name, as `ts` does, and `gate` reads that as passing.
- **`gate` needs it and reads `needs.release-dry-run.result`** in its loop.
- **The toolchain is this repository's release's, not agent-org's.** `release.yml`'s call of `release-per-merge.yml@4aa20dfc` passes none of `pnpm-version`, `changesets-version` or `node-version`, so: pnpm comes from `packageManager` (`pnpm@10.34.5`; `pnpm/action-setup` with no `version`, which is what the called workflow's `setup` step arranges), Node is the called workflow's default `22`, and `changesets-version` (`3.0.3`, its default) matters only on the no-lockfile branch, where this repository's `@changesets/cli` is its own.

**The second step is dropped, as the row allows.** a11ign/agent-org's job also runs the consumer's `pnpm install --frozen-lockfile --ignore-scripts` of the candidate tag. That is `scripts/agent-org-newest-tag.ts`, whose `TOOL_REPO_URL` is `https://github.com/a11ign/agent-org`: it installs agent-org's tags. `installToolDependencies` has no other caller in this tree, and a search of the `control` and `lab` checkouts on this host found no clone of a tag of THIS repository that is then installed (what they hold are layer pins). A consumer of `a11ign` takes the published packages from the registry. Absence from those three trees is what was measured; nothing else was searched.

**The Acceptance is the row's two greps with the path made repository-relative.** The row names `/home/agent/repos/a11ign/.github/workflows/ci.yml`; no such directory exists on this host (this repository's primary checkout is `/home/agent/repos/a11y-witness`), and a path inside this repository is what CI's acceptance job can run. Same two patterns, same file.

## Evidence

Measured, on this host, by running the job's version-step commands (`pnpm install --frozen-lockfile`, `pnpm exec changeset version`, `pnpm install --lockfile-only`) on a scratch clone of this tree:

- unmodified lockfile: exit 0, `DRYRUN-OK`;
- the root importer's `@changesets/cli` entry removed from `pnpm-lock.yaml`: exit 1, `ERR_PNPM_OUTDATED_LOCKFILE`, so the job goes red for the class the row names.

Measured, the `touched` pattern on 14 paths: `package.json`, `pnpm-lock.yaml`, `.npmrc` and `.github/workflows/ci.yml` match; `packages/cli/package.json`, `src/a.ts`, `.github/CLAUDE.md`, `docs/.npmrc`, `xpackage.json` and `pnpm-lock.yaml.bak` do not.

Measured: `ci.yml` parses as YAML, the job's keys are `if, runs-on, permissions, env, steps`, and `gate`'s last `needs` entry is `release-dry-run`. Of the guard tests that read `ci.yml` (`ci-agreement-step-cancelled`, `ci-changed`, `ci-runs-no-other-repositorys-tests`, `boundary-report-job`, `branch-protection`, `changed-packages`, `acceptance-keeps-class-line`), six pass and one test of `ci-changed.test.ts` (`CLI: a missing base ... is refused before git is asked`, exit status 1 where 2 is expected) fails identically with `ci.yml` restored to `origin/main`'s, so it is not this change's; it exercises `scripts/ci-changed.ts`, not the workflow.

**Not done here, and why:** done-when 2 (the job green on this pull request, red on a throwaway pull request whose lockfile omits `@changesets/cli`) and done-when 3 (a pull request touching none of the four paths shows the job `success`; a `merge_group` entry is green) are readings of CI runs that do not exist until this pull request does. They are quoted on a11ign/agent-org#970 when they have run.

Acceptance: bash -c 'grep -q "release-dry-run:" .github/workflows/ci.yml && grep -q "needs.release-dry-run.result" .github/workflows/ci.yml'

Closes a11ign/agent-org#970
