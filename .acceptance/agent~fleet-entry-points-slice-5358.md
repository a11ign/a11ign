`scripts/fleet-env.ts` no longer runs its command on import: `main()` is called only under the `import.meta.url` guard, with the entry path resolved through `realpathSync` so a `node_modules/.bin` symlink still runs it (#5358). Its entry leaves `KNOWN_UNGUARDED_ENTRY_POINTS`, which is now empty, and the one remaining exemption, `scripts/rstest/rstest.config.ts`, is re-justified in the test's comment.

- **Measured, guard test:** `node --test packages/guards/src/entry-points.test.ts` passes 7 of 7, before and after the change.
- **Import is silent:** `node -e "import('./scripts/fleet-env.ts')"` prints `imported` and exits 0; direct and symlinked runs with no arguments print the usage message and exit 2. `pnpm run fleet:env` was not run (fleet resource ban).
- **Mutation (each restored byte-identical):** (A) `main();` left unguarded: "every entry point" fails naming `scripts/fleet-env.ts`. (B) the symlink-blind `process.argv[1] ?? ""` form: the symlink run exits 0 with no output, and the ratchet test fails naming `scripts/fleet-env.ts`. (C) `fleet-env.ts` left on the known list while guarded: "every entry point" fails with "is listed as unguarded but now carries a guard".
- **Positive control moved:** the detection control now asserts `scripts/rstest/rstest.config.ts` is detected as unguarded, the one unguarded file left to see. The stale-entry check is a per-entry loop, since `deepEqual(stale, [])` over an empty list would pass whatever the detection did.

Acceptance: node --test packages/guards/src/entry-points.test.ts

Closes #5358
