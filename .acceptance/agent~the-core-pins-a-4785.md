Pins lab `v0.1.27` in `layers.json` (from `v0.1.24`) and names the six renamed lab files by their `.ts` paths in `package.json`, `README.md`, the two workflows and `screenreader-worker-extraction.test.ts` (step 2 of a11ign#4519).

**The tag is `v0.1.27`, not the `v0.1.26` the row and the landing order name.** Measured with `git ls-tree -r --name-only <tag>` over a fetched `a11ign/lab` at each tag: `v0.1.26` holds `qualification-status.mjs` and the five harness `.mjs` and NO `.ts`; `v0.1.27` ("Release v0.1.27", `2bbe417db`) holds all six `.ts` AND the six `.mjs`, which are the one-release shims of lab A (`capture-check.mjs` throws "is now capture-check.ts"). `v0.1.27` is the newest tag (`git ls-remote --tags`). Proof the tag holds the six:

```
$ git ls-tree -r --name-only v0.1.27 | grep -E 'src/(gates/qualification-status|harnesses/(assert-action-report|capture-check|capture-fixtures|occurrence-verdict-stability|page-identity-rate))[.]ts$'
src/gates/qualification-status.ts
src/harnesses/assert-action-report.ts
src/harnesses/capture-check.ts
src/harnesses/capture-fixtures.ts
src/harnesses/occurrence-verdict-stability.ts
src/harnesses/page-identity-rate.ts
```

**Runner per caller is unchanged, only the extension moved:** `tsx` stays `tsx` (`capture:check`, `identity:rate`, `verdict:stability`) and `node` stays `node` (`eval:capture`, both workflows), which runs a `.ts` directly (repo precedent: `node scripts/lay-layer.ts lab` in `action-smoke.yml`; node 24 here, `22` in `capture-regression.yml`'s `setup-node`). Not exercised: both workflows are Windows/NVDA release-time jobs, so their changed lines were not run here.

**Not changed, and why: `scripts/test-support/launcher-reach.stand-in.cmd`.** It is in the Region, and its `CAPTURE_CHECK` line still names `capture-check.mjs`. It is a VERBATIM copy of `a11ign/screenreader-worker` `src/launcher-reach.cmd`, and `packages/guards/nightly/launcher-reach-drift.test.ts` fails when the two differ; measured with `curl` against that file's `main` at this head, it still says `capture-check.mjs`. Moving the copy first would red the nightly with a false "the layer moved". The layer moves first, then the stand-in follows (the nightly's own prescription). Until then `capture-check.mjs` is the lab's throwing shim; that is the layer's file and not this repository's, and a row is filed for it (linked on #4785).

**Outside-Region:** `.github/workflows/action-smoke.yml`, `.github/workflows/capture-regression.yml` (CODEOWNERS review required, as the row says).

platform: nothing built; one-line pin bump and name changes.

Acceptance: `bash -c '! git grep -nE "harnesses/(assert-action-report|capture-check|capture-fixtures|occurrence-verdict-stability|page-identity-rate)[.]mjs" -- package.json README.md .github packages/guards scripts' && jq -e '.pinned.lab.tag != "v0.1.24"' layers.json` printed `true` and exited 0 at this head, after `pnpm install --frozen-lockfile` laid `v0.1.27`. `node --test packages/guards/src/screenreader-worker-extraction.test.ts`: 10 pass, 0 fail; `scripts/test-support/stamp-files.test.ts`: 2 pass; `pnpm run lint` 0 errors; `pnpm run typecheck` clean.

Mutation: pointing the guard test's `HARNESS` back at `occurrence-verdict-stability.mjs` (the throwing shim at the new pin) fails 2 of its 10 tests; restored byte-identical (`diff` empty) and 10 pass again.

Closes #4785
