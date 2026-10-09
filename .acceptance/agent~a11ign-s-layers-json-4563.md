platform: none needed -- this moves the `lab` pin in layers.json and nothing else; no worker, Windows build or fleet path is touched.

Acceptance: `bash -c 'grep -E "\"lab\": \{[^}]*\"tag\": \"v0\.1\.(19|[2-9][0-9])\"" layers.json'` and `node --input-type=module -e 'import("./packages/lab/src/training/page-server.mjs")'` on a tree laid at the new pin (`node scripts/lay-layer.ts lab`).

Closes: #4563

Mutation: `layers.json` `lab` tag set back to `v0.1.18` (M1): the Acceptance grep finds no match and exits 1; restored byte-identical and exits 0 again at `v0.1.19`.

## What changed

- **layers.json:** `lab` moves from `v0.1.14` to **`v0.1.19`**. That is the first lab tag that carries both fixes in the row's blocked-by chain: a11ign/lab's `fix: page-server imports the product's CLI helper as .ts (#4561)` and `Lab scripts import the product's git-env and npm-cli-executable by their .ts names (a11ign/a11ign#4568)`, both released in v0.1.19 (cut 2026-10-09T19:23Z).
- **Not taken:** v0.1.20 to v0.1.24, which change lab's status page (#4567), the js-to-ts renames of `bench-capture` and related scripts (#4278), `referral-repeat-share` flags (#4580), `capture-screenreader-dataset` writes (#4462) and a lab rstest script (#4506). None of them is needed to unblock the release run, and each would be a larger change to the laid tree than this row asks for. The row's Change asked for the newest tag; the ceo's comment on the row asked for a tag carrying both fixes. v0.1.19 satisfies the comment and the Acceptance pattern, and the #4343 pin (`v0.1.17`, "not a later release") set the same precedent for this file.
- No lockfile moves: `lay-layer` reads `lab`'s pin from its own declaration in `layers.json` (the `lab` layer is `private` and never on the registry), so this file is the only pin to change.

## Evidence

- **Acceptance** (run in this worktree at the PR head): the grep exits 0 and prints the `lab` line with `"tag": "v0.1.19"`.
- **Import step** (`node --input-type=module -e 'import("./packages/lab/src/training/page-server.mjs")'`, Node v24.21.0, on `packages/lab` laid by `node scripts/lay-layer.ts lab` at v0.1.19): `IMPORT OK`, exit 0. The laid file's line 23 reads `import { pnpmCliInvocation } from "../../../../scripts/npm-cli-executable.ts";`, and this worktree has no `scripts/npm-cli-executable.mjs`.
- **Before the change** (inferred from the tag contents, not run here): v0.1.14's `src/training/page-server.mjs` imports `scripts/npm-cli-executable.mjs`, and v0.1.18's, which the earlier `git ls-remote`/`gh api` reads showed as `.mjs`, also does. That specifier names a file this tree no longer has, so the import step fails at the pin.
