`a11ign` now exports `DEFAULT_PROBE_FLAGS` (new `packages/cli/src/probe-defaults.ts`, re-exported from `index.ts`). `defaultArgs()` spreads it, so the five probe defaults have one spelling. `probe-consent.test.ts` reads the export instead of scraping `defaultArgs()`'s body out of `cli.ts`.

The new module is "the module it moves to" in the row's Region: `cli.ts` is the `bin` and importing it runs it, so `index.ts` cannot re-export from it.

**Measured at this head:** the Acceptance command exits 0 (5 `probe*` keys); `probe-consent.test.ts` and `probe-forwarding.test.ts` pass (4 tests, `tsx --test`); `pnpm run lint` 0 errors; `pnpm run typecheck` clean.

**Mutation** (`probe-defaults.ts`, restored byte-identical with `diff`): deleting `probeFocusReveal` from the export turns `the CLI asks of a stranger's page exactly what the real-page corpus asks of one` red, naming the disagreement with the lab's real-page body.

**Not done here (named):** the lab's own copy of the check reading the published export is a11ign/lab's change, announced on a11ign#5078.

Acceptance: bash -c 'pnpm --filter a11ign run build >/dev/null && node -e "import(\"./packages/cli/dist/index.mjs\").then((m) => process.exit(Object.keys(m.DEFAULT_PROBE_FLAGS ?? {}).filter((k) => k.startsWith(\"probe\")).length >= 4 ? 0 : 1))"'

Closes #5091
