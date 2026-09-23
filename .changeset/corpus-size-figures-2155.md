---
---

No published package changes (#2155): every edit is a COMMENT, a README or a new test. The stale
`1,061 pairs` / `2,122 captures` figures were corrected in `packages/lab/src/training/README.md`,
`capture-cache.mjs`, `packages/nvda-worker/CLAUDE.md`, `packages/cli/src/cli.ts` and
`packages/control/src/fleet-status.mjs`, and `packages/lab/src/gates/corpus-size-figures.test.ts` is new.
`@a11ign/lab` and `@a11ign/control` are private; `@a11ign/nvda-worker` ships `src` and not `CLAUDE.md`;
and `a11ign` ships `dist`, where the only reachable change is the wording of one JSDoc block -- the same
shape as `cli-flags-realpath-comment-1248.md`, which is empty for that reason.
