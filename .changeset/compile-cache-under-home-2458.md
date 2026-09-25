---
"@a11ign/agent-org": patch
---

**Every shipped host unit now keeps V8's compile cache under the home's `.cache`, not `/tmp` (#2458).** `tsc`, `eslint`, `rstest` and `changeset` call `enableCompileCache()` with no directory, so with `NODE_COMPILE_CACHE` unset Node writes `<tmpdir>/node-compile-cache`, one entry per file per checkout path. Measured under a private `TMPDIR` (2026-09-25): `npm run lint` left 895 files, `eslint --version` 194, `rstest --version` 28. All seven shipped `.service` files carry `Environment=NODE_COMPILE_CACHE=%h/.cache/node-compile-cache`, and `host-units.test.ts` pins it through `compileCacheDrift` with a negative control. The agent account's `.zshenv` exports the same value for session shells; that is a host fact outside the tree, recorded as `docs/known-gaps.md` §50.
