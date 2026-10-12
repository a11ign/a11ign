## What

Adds a paragraph to `docs/try-it.md` section 1 ("The repository must be private") saying a workflow of your own that logs in belongs in a private repository, for the same reason the Action refuses one on a public repository (`auth-refused-public-repository`, ADR 0038), and naming the private `a11ign/auth-capture-check` repository where the project's own authenticated checks of the Action run.

**The row's premise was corrected, not copied.** The row said the project's own *nightly* sign-in runs in `a11ign/auth-capture-check`. Read from source and the API, it does not: `auth-capture-check` runs its workflows on `pull_request` and `workflow_dispatch` only (the last 30 runs of each show no `schedule` event). The scheduled sign-in is `.github/workflows/auth0-e2e.yml` in `a11ign/a11ign` itself, which is PUBLIC, daily at 06:37 UTC. The paragraph therefore names the check runs and says nothing about a nightly.

**The row's second premise was also not copied.** The row said a public repository's login workflow "will report `secret-missing` or be refused". `secret-missing` appears nowhere in `action.yml`, `src` or `docs`, so the paragraph says only what the code does: the Action refuses; the command-line form has no refusal (`auth-refused-public-repository` is only in `action.yml`).

## Verification

- Acceptance, run as written (`git grep -q "auth-capture-check" -- docs/try-it.md`): exit 0.
- `packages/cli/src/action/summary-md-output.test.ts` (it reads `docs/try-it.md` for its examples and links): 8 of 8 pass via `pnpm exec tsx --test`.
- `packages/guards/src/docs-release-pin-currency.test.ts` and `...real-tree.test.ts`: 26 of 26 pass via `pnpm exec tsx --test`.
- The two relative links resolve by path: `./adr/0038-authenticated-capture.md` and `./github-action.md#logging-in-flows-and-login-flow` (the anchor the file already uses in section 1).
- Not run: `pnpm run verify`, lint and typecheck: the diff is prose in one markdown file.

**Filed on the row, not fixed here:** `.github/workflows/auth0-e2e.yml` runs an authenticated scan daily on the public `a11ign/a11ign`. Its job writes the NVDA-read heading to `$GITHUB_STEP_SUMMARY`, uploads an evidence artifact, and posts to an issue on failure. That is the exposure the new paragraph describes, from a workflow outside this row's Region. It needs an owner's decision.

platform: nothing to check; a prose change to one docs page.

Acceptance:
```bash
git grep -q "auth-capture-check" -- docs/try-it.md
```

Closes #5273
