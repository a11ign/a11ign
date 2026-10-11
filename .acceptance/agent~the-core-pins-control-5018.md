Pins control `v0.5.3` in `layers.json` (from `v0.5.2`): `pinned.control.tag` is the only line that moves. `pinned.lab.tag` is NOT touched (`v0.1.28`, as on `main`). Same shape as a11ign#4951.

**The tag is `v0.5.3`** (commit `bff6e02cab5136d5ccea086054aabf3a77e6f727`, read at claim with `git ls-remote --tags https://github.com/a11ign/control.git v0.5.3`). It carries the feature-update switch from a11ign#5002: `git show v0.5.3:ansible/patch.yml` holds the commit of a staged feature update's switch and the failure of a box that staged without switching (control `3a80e807`, merged by control#50).

**What v0.5.2..v0.5.3 holds** (`gh api repos/a11ign/control/compare/v0.5.2...v0.5.3`, read at claim; 5 commits): 42 files changed, 362 insertions(+), 202 deletions(-). The code moves are `ansible/patch.yml` (+76), `src/fleet-layer/patch-playbook.test.ts` (+65 -1), `package.json` (version `0.5.3`) and `CHANGELOG.md`. The rest are removed `.changeset/` files (consumed by the release) and one added `.acceptance/` file.

**The laid copy:** `pnpm install --frozen-lockfile` at this head, `packages/control/.layer-ref` reads `v0.5.3`.

**Suites at this head, with `packages/control` laid at `v0.5.3`:**
- `pnpm run test:org`: `VERDICT pass: 1265 tests in 86 files (1 skipped)`, rc 0.
- `pnpm run test:ts`: `VERDICT pass: 1513 tests in 132 files (20 skipped)`, rc 0.
- `pnpm run lint`: `✖ 624 problems (0 errors, 0 in packages/control)`, rc 0.
- `pnpm run typecheck`: clean (`tsc --noEmit`), rc 0.

**Not exercised:** no playbook was RUN and no host was deployed (the resource ban). The patch window that the switch is for is a11ign#4405's, `orchestrator`'s.

Acceptance: `bash -c 'test "$(printf "%s\nv0.5.3\n" "$(node -p "require(\"./layers.json\").pinned.control.tag")" | sort -V | head -1)" = v0.5.3'` exited 0 at this head (rc 0), and exits 1 with the pin at `v0.5.2` (`sort -V` puts `v0.5.2` first).

Closes #5018

Mutation: none -- this diff changes no test file and no guard; it moves one tag string.
