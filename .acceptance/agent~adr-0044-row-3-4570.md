## What

ADR 0044 row 3, second half (#4570): `.github/workflows/acceptance-sweep.yml`, a daily workflow (06:27 UTC, plus `workflow_dispatch`) that opens ONE pull request deleting the `.acceptance/*.md` files whose last commit is older than 14 days. It opens none while a sweep pull request is open, and refuses any path that is not directly under `.acceptance/`. The pull request carries its own dated `.acceptance/` file (`test ! -e <path>` per deleted file), so it passes the same check every pull request does.

Two files outside the row's Region, both forced by the work: `.github/chainguard/acceptance-sweep.sts.yaml` (a `GITHUB_TOKEN` push fires no `ci.yml` run, so the sweep pull request needs an Octo STS token like `consumer-gate-pin.yml`'s; modelled on `consumer-gate-pin-write.sts.yaml`, minus `workflows: write`) and `force-rerun-triggers-cover-the-27.test.ts` (its pin counted five STS policies; it is six).

## Evidence

- Acceptance, run at this head: exit 0. Mutated copies: no `14`/`fourteen` -> the grep exits 1; no `.acceptance/` -> exits 1; file absent -> `test -f` exits 1. (Run on copies in the scratchpad, so nothing to restore.)
- The workflow's `run:` script, extracted and run in a scratch clone of this repo with a stub `gh` and a local bare remote: `MAX_AGE_DAYS=0` swept all 19 files, committed 19 deletions plus the one added acceptance file, pushed `automation/acceptance-sweep-2026-10-09` and called the pulls API; `MAX_AGE_DAYS=14` found nothing older and exited 0 with a notice. The first run found a real defect (`${branch//\//~}` tilde-expands to `$HOME`, writing `.acceptance/automation/home/agent...`); fixed by quoting the `~`, and the all-files-deleted case needed `mkdir -p .acceptance`.
- Both tree-wide guards on this tree (19 `.acceptance/` files tracked, plus the new workflow and policy), `pnpm exec rstest run --config=scripts/rstest/rstest.config.ts --include <file>`: `tracked-prose-leak-guard.test.ts` VERDICT pass, 5 tests; `walk-scope-declaration.test.ts` VERDICT pass, 11 tests. Neither needed an edit.
- All of `packages/guards/src`: 1257 tests, 1 failed before the pin edit (`force-rerun-triggers-cover-the-27`, five STS policies became six); that file passes after.
- Open pull requests printing `ACCEPTANCE-SOURCE: body`: **0**, obtained as: `gh pr list --state open` and `gh api repos/a11ign/a11ign/pulls?state=open` both returned 0 open pull requests at 2026-10-09 ~16:10 UTC. The tool prints `body` only for a pull request that adds no `.acceptance/` file, and there is no open pull request at all. **Not proof the fallback is dead:** Dependabot pull requests print it by construction (`dependency-pr-body.yml` writes `Acceptance:` into the body, and cannot add a file: `pull_request_target`, no checkout), so the next one will.

Acceptance:
```
bash -c 'test -f .github/workflows/acceptance-sweep.yml && grep -q "\.acceptance/" .github/workflows/acceptance-sweep.yml && grep -qE "(14|fourteen)" .github/workflows/acceptance-sweep.yml'
node --import tsx packages/guards/src/force-rerun-triggers-cover-the-27.test.ts
```
