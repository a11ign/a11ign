Closes A11-127

Retires the old gate's `refusalOwners` job from a11ign's CI so the required `gate` is no longer red on every pull request. `refusalOwners` asked GitHub whether the row a `REFUSED` string names is open; rows live in Linear now and every GitHub copy is closed (`package.json script "gate:lab-held": REFUSED names #4425 as its owner, and #4425 is CLOSED`), so it could only fail, and `gate` failed after 3 s reading its result. The job, its comment block and its test (`scripts/refusal-owners-are-open.test.ts`) are removed, and `gate` no longer waits for or reads it. `acceptance` stays in `gate`: it runs a pull request's own `Acceptance:` command, and its `closes` half now reads the ticket-mode declaration from agent-org's newest release (agent-org #1827). `gate:lab-held` keeps its refusal and its exit code and drops only the claim that the closed row #4425 owns what it holds.

Acceptance: `ci.yml` has no `refusalOwners` job and `gate` waits for exactly the jobs it reads, and reads each of them (`acceptance` among them); `gate:lab-held` still exits 1 naming what it holds and names no GitHub row; `release:gate` and `candidate:gate` still reach it.

```bash
! grep -nE "refusalOwners|refusal-owners" .github/workflows/ci.yml
test ! -e scripts/refusal-owners-are-open.test.ts
pnpm install --frozen-lockfile --ignore-scripts >/dev/null
pnpm exec rstest run --config=scripts/rstest/rstest.config.ts --include packages/guards/src/old-gate-checks-are-retired.test.ts
```

The three tests of `old-gate-checks-are-retired.test.ts` parse `ci.yml` with `yaml` and run the real `gate:lab-held` script; the first two fail on the base `ci.yml` and `package.json`, the third (the release chains still reach the refusal) passes there too.

Review of the dependency pull requests the workflow declines (#5709, #5712, #5716), whose bodies were rewritten in its own shape under this ticket: `gh pr view <n> --json body --jq .body` shows an `Acceptance:` command and `Closes: none -- dependency update reviewed under A11-127` on each, and `gh pr checks <n>` shows `acceptance / run` on the new body once the pull request has been rebased on this change.
