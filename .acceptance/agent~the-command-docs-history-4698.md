Removes the `--import tsx` words from the twelve command, docs, history and install scripts under `scripts/` (slice of #4596): Node 24 strips types since #4389, so `node file.ts` needs no loader. Every hit was a usage string, a `refuseUnknownFlags` command name or a header comment; no test or assertion was about the loader.

`generate-commands-doc.ts`'s `invocation()` had two identical branches once the loader went, so it is deleted and `buildPage` writes `node <file>`. `docs/commands.md` is that generator's output and `commands-documented.test.ts` compares it with the tree, so it is regenerated with `node scripts/run.ts docs-commands` (a file outside the row's Region, said on the row). The regeneration also adds the `release-tags-complete.ts` line the committed page lacked at `origin/main`.

Verification: `node scripts/generate-commands-doc.ts --check` prints OK (51 scripts), run with no loader on Node v24.21.0. `pnpm run lint` 0 errors, `pnpm run typecheck` exit 0.

platform: none needed, a word removal.

Acceptance:
```bash
bash -c '! git grep -qE -- "--import[= ]\S*tsx" -- scripts/run.ts scripts/commands.ts scripts/doc-checks/commands-documented.ts scripts/doc-cross-reference-report.ts scripts/generate-commands-doc.ts scripts/history-purge-rehearsal.ts scripts/history-secret-scan.ts scripts/install-git-hooks.ts scripts/known-gaps-index.ts scripts/manifest-repository-check.ts scripts/prune-stale-workspace-scope.ts scripts/spotlight-exclude.ts'
node scripts/generate-commands-doc.ts --check
```

Closes #4698

🤖 Generated with [Claude Code](https://claude.com/claude-code)
