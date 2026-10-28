A11-370. `.github/workflows/ci.yml` no longer filters `pull_request` to base `main`, so a pull request stacked on another branch gets the same checks as any other and its reviewer starts on its green head. `merge_group` keeps its `main` filter: the merge queue stays the merge condition for `main`. The `changed` job already reads the base from `github.base_ref`, so a stacked pull request is classified against its own base.

Acceptance:

```bash
bash -c 'set -euo pipefail; node packages/guards/src/ci-stacked-trigger.test.ts'
```
