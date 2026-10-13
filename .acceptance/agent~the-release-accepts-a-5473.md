The release accepts a `qualification` verdict only from the managers App, not the user account `a11ign-ai-leads` (#5473, a11ign#5044 Done-when 2).

`QUALIFICATION_WRITERS` is now `[QUALIFICATION_WRITER_APP]`, `a11ign-managers[bot]`. The `QUALIFICATION_WRITER` export (`a11ign-ai-leads`) is removed, so the grep `QUALIFICATION_WRITER\b` has no live use left. The reading #5057 waited for exists: every `qualification` status on 0.10.2's release commit `ccd21d9d` was created by `a11ign-managers[bot]` and none by the user account (`gh api repos/a11ign/a11ign/commits/ccd21d9d0b6088caeff375fa91d3efe0897cb839/statuses`, as the row states, read 2026-10-13). A status from the user account is now ignored and named in the log like any other creator's, so a release routed to it WAITS.

Done-when 1: a `success` from `a11ign-ai-leads` is `wait`, promotes nothing, and the log line names `IGNORED` and the login. Done-when 2: the same `success` from `a11ign-managers[bot]` is `proceed` (the POSITIVE CONTROL, renamed). A `failure` from the user account is ignored too, so the App's `success` beside it still proceeds. The three tests that used the user account as the lab's identity (the other-context, the ordering and the forged-`failure` tests) now use the App, which keeps what each was about.

Mutation, both directions, on this head with the repo's rstest config, each restored from a copy and `diff`ed byte-identical. Readmit the user account in the list: 3 red, exactly the user-account `success` test, the user-account `failure` test and the identity pin. Accept nobody (`[]`, the check always fires): 8 red, the POSITIVE CONTROL and the App-`failure` tests among them. Unmutated: 112 passed.

Outside-Region: `.github/workflows/release.yml` comment lines 88-92, which described the list as two identities and now name the one; no workflow behaviour changes.

Resolve check: removing `QUALIFICATION_WRITER` is a deliberate removal of a symbol `origin/main` exports, which `pre-push`'s resolve-toward-main check refuses unless pushed with `A11Y_RESOLVE_REASON`. Nothing in the tree imports it (`git grep -n "QUALIFICATION_WRITER\b" origin/main` finds only its definition, the list and a `release.yml` comment).

platform: nothing new; the filter and its tests already exist, this removes one entry.

Acceptance: `pnpm exec rstest run --config scripts/rstest/rstest.config.ts packages/guards/src/release-promotes-by-evidence.test.ts`

Closes #5473
