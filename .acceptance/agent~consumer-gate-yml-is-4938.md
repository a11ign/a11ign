## What

`.github/workflows/consumer-gate.yml` is regenerated from `README.md`'s Quickstart fence, so `release.yml`'s `guards` step and `consumer-gate / check-pin` stop reading `STALE .github/workflows/consumer-gate.yml does not match README.md` (org-health `release-run-failed`, run 38111554715 at `91e39a576`).

Cause: `7115688cc` (#4918, merged as #4921) moved README's pin to `a11ign@0.6.6` and did not regenerate the file, which still carried `472f05695` and the comment `release 0.5.3`. The file is generated and was not hand-edited: `node scripts/run.ts consumer-gate` rewrote it at `47113639e` and changed 7 lines (`git diff --stat`: 7 insertions, 7 deletions): six carry the pin sha (five in `check-pin`, one the `uses:` line) and one is the `release 0.5.3` comment.

Not in this diff: the guard that would have caught it on the PR. Measured: `packages/lab/src/packaging/consumer-gate.test.ts`, which the generated file's header still cites as the checker, left the tree with `packages/lab` (`0a5f6ca61`, #3505, 2026-10-06). Since then the only readers of `consumer-gate.yml` against README are `release.yml`'s `guards` step and `consumer-gate.yml`'s own `check-pin`, and a merge with no changeset runs neither. This is the second occurrence (#4556 on 2026-10-09); it is filed as its own row.

platform: nothing built; the repository's own generator (`scripts/run.ts consumer-gate`) produced the file.

Acceptance:
```bash
node scripts/generate-consumer-gate.ts --check
```
