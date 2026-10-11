The core's `dora` entry for `a11ign/control` lists `releasablePaths` `["src/", "ansible/", "layers.json", "deploy-pins.json"]`, character for character the list control#69 gives its own `ci.yml` (`releasable-paths: src/ ansible/ layers.json deploy-pins.json`, read off that PR's diff, not off `main`). A pin-only change to `deploy-pins.json` now counts as releasable in the daily DORA reading.

**Measured at this head:**
- Before the edit, the row's JSON check exits 1 (`releasablePaths` was `["src/"]`), and `grep -c deploy-pins.json .agent-org/project.json` reads 0.
- After the edit, the JSON check exits 0 and the open-check reads 1.
- `packages/guards/src/dora-declaration.test.ts` pins no control list (its control tests check `src/` and the prefix shape), so no fixture moved. Under `pnpm exec tsx --test packages/guards/src/dora-declaration.test.ts` all 18 tests pass.
- `pnpm run test:org` (the agent-org and guards suites, which read `project.json`): 1271 tests in 86 files, 1 skipped, exit 0.

**The row's Acceptance as written does not pass, and the fix is one flag.** Its second half, `pnpm exec rstest run packages/guards/src/dora-declaration.test.ts`, has no `--config`, so rstest finds `No test suites found` in the file and exits 1. With `pnpm exec rstest run --config scripts/rstest/rstest.config.ts packages/guards/src/dora-declaration.test.ts` the same 18 tests run and pass (exit 0), which is the form `assert-glob-not-empty.ts` uses for every rstest run. The Acceptance below is the row's command verbatim, because Acceptance is `product-manager`'s to amend; this PR waits on that amendment.

Acceptance:

```bash
python3 -I -c 'import json,sys; p=json.load(open(".agent-org/project.json")); e=[d for d in p["dora"] if d["repo"]=="a11ign/control"][0]; w=["src/","ansible/","layers.json","deploy-pins.json"]; sys.exit(0 if e["releasablePaths"]==w else 1)' && pnpm exec rstest run packages/guards/src/dora-declaration.test.ts
```

Mutation: restore `["src/"]` and the JSON check exits 1, so the first half of the Acceptance refuses. The second half is claimed only in its `--config` form, above, and is not claimed as written.

Closes #5159
