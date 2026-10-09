Moves the lab pin in `layers.json` from v0.1.19 to v0.1.24, whose `scripts/referral-repeat-share.ts` calls `refuseUnknownFlags` (line 131), so control's `cli-flags.test.ts` has nothing unguarded to fail on.

What else the newer lab moved: its files are `.ts` now. Measured with `git grep` for `packages/lab/(scripts|src)/*.mjs` outside `packages/lab` and `docs`, then `[ -e path ]` against the laid tree: the only paths that do not exist are fixtures (`a.mjs`, `d.mjs`, `x.mjs`, `training/a.mjs`) and two already-moved names in `lab-delete.test.ts`'s old-to-new map and a doc comment (`packaging/leak-patterns.mjs`, `packaging/gh-api-read.mjs`). No live reader names a missing lab `.mjs`.

Not run here: control's `cli-flags.test.ts` lives in the control repository and is not laid into this tree (the laid `packages/control` holds `src` without tests), so that half of done-when 1 is for `ci.yml`'s `CORE_REF` bump in control. This PR does not touch control's tests.

platform: nothing built; one-line pin bump.

Acceptance: `bash -c 'grep -Eq "\"lab\".*\"tag\": \"v0[.]1[.](2[4-9]|[3-9][0-9])\"" layers.json && grep -q refuseUnknownFlags packages/lab/scripts/referral-repeat-share*.ts'` printed nothing and exited 0 at this head, after `pnpm install --frozen-lockfile` laid v0.1.24.

Closes #4652
