Makes `a11ign@<version>` the documented release tag, says what `v<version>` is, and adds `scripts/release-tags-complete.ts`, which prints every published version lacking the contract tag.

- **Contract:** `a11ign@<version>`, because `release.yml` cuts it for every release and the GitHub Release hangs off it. Stated in one sentence in `packages/cli/README.md` ("Which version you get", which `cli-readme-release-channels.test.ts` still passes) and in the root README beside the Action pin; patch changeset for `a11ign`.
- **What `v<version>` is, read where it is written** (`release.yml`, `promote-action-tag`, #4058): an exact tag written at the same commit only so Dependabot can see the Action. The READMEs say it is not the contract.
- **The script** reads `npm view a11ign versions --json` against `git ls-remote --tags origin` (never the local tag list), prints each version lacking `a11ign@<version>`, exits 1 if any, and throws when either reading cannot be taken. The test pins a fixture with one missing version, a fixture with none (the control), a `v`-form tag not standing in for the contract, and the prefix read from `release.yml` rather than retyped.
- **Mutation check, both directions:** `versionsWithoutTag` made to return `[]` fails 2 of 9 tests (the missing-version fixture and the `v`-form one); made to return every version fails 4 of 9 (including the none-missing control). Restored from a copy, `diff` identical.

**Not done, and why Done-when 2 is open:** run at `origin/main` `791552a77`, the script prints

```
0.1.0 (no tag a11ign@0.1.0)
1 of 11 published versions of a11ign lack their a11ign@<version> tag
```

and exits 1. `0.1.0` has only `v0.1.0`; 0.3.0 to 0.5.4 all have the contract tag. Cutting a public tag is not this row's Region, so it is filed as #4543. The row's first Acceptance line therefore exits 1 until #4543 lands, which is the script doing its job; the Acceptance below is the test.

**Filed, not touched:** #4544, `promote-action-tag` writes `v<version>` (#4058) yet `v0.5.2` and `v0.5.4` do not exist (a `.github/workflows/` Region, so not edited here).

Verification: `pnpm run verify` printed `VERDICT pass: 2654 tests in 199 files (21 skipped)`; the affected set passed at this head against `origin/main`.

Acceptance: npx rstest run --config scripts/rstest/rstest.config.mjs --include packages/guards/src/release-tags-complete.test.ts

Closes: none -- Done-when 2 (the script reads no missing version) waits on #4543, which cuts `a11ign@0.1.0`; the row stays open until that run is quoted.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
