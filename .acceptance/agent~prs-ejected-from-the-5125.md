## What

The release-pin guard (`docs-release-pin-currency.real-tree.test.ts`) reads the newest release, so every release turned it red for every pull request in the merge queue until a doc pin was bumped. On 2026-10-11 #5115, #5122 and #5124 were each ejected from the queue by it with diffs that touched no doc (a11ign/a11ign#5125). This is the guard's half of that row; the gate's half (re-arming an ejection that was not the PR's own) is a11ign/agent-org#1029, which does not close the row (the tool refuses `Closes: none` on the claimed branch's pull request, so the row closes with this one, and #1029 is named on it).

- On a `pull_request` or `merge_group` run the guard runs only when the diff touches a doc it checks (`README.md`, `docs/*.md`, `docs/adr/*.md`) or the guard's own files. The diff is the event payload's base commit to `HEAD`.
- On every other event (`schedule`, which is the nightly `pnpm run coverage` over the whole suite, `push`, `workflow_dispatch`, and a local run) it runs, so the world is still read once a day and a failure still reaches #169.
- A diff that cannot be read (no payload, no base commit, a base this clone does not hold) RUNS the guard: a skip is for a diff that was read and touched nothing.
- The skip names its reason in the runner's output. `scopeOf` has named cases for each branch, and they run on every run, so the decision itself is never skipped.

## Evidence

- `node --test packages/guards/src/docs-release-pin-currency.real-tree.test.ts` locally: pass 2, skipped 0. With `GITHUB_EVENT_NAME=merge_group` and a payload whose `base_sha` is `HEAD` (an empty diff): pass 1, skipped 1, with the reason printed.
- `npx eslint packages/guards/src/docs-release-pin-currency.real-tree.test.ts`: 0 errors, 0 warnings.

Mutation: (M1) a diff that touches a doc never runs the guard -- the scope case fails; (M2) the guard never skips -- the scope case fails; (M3) an unreadable diff skips -- the scope case fails. Each was run against this head and the file restored from a copy (`cp` back, byte-identical); each reddens only the scope case.

Not done: `.github/workflows/release.yml` is untouched. The row also asked the release to bump the doc pins; a pin names the release's own commit, `main` takes no workflow write past its review and queue rules, and the docs' prose about the pinned release is re-read by hand on every bump (#5069), so an automatic swap would state things of a release nobody re-read. The reasoning is on a11ign/agent-org#1029.

## Acceptance

```bash
bash -c 'node --test packages/guards/src/docs-release-pin-currency.real-tree.test.ts'
```

Closes #5125
