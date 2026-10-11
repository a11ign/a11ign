Pins control `v0.5.1` in `layers.json` (from `v0.3.9`): `pinned.control.tag` is the only line that moves. `pinned.lab.tag` is NOT touched (`v0.1.28`, as on `main`). Same shape as a11ign#4869.

**The tag is `v0.5.1`** (commit `4da98dd7921838d69b321f053f9bc66bf3b31c8d`, read at claim with `git ls-remote --tags https://github.com/a11ign/control.git v0.5.1`). It carries the 155.0.4283.45 Edge pin: `git show v0.5.1:ansible/roles/worker/defaults/main.yml` gives `worker_edge_version: "155.0.4283.45"` (line 166). Without this bump a whole-fleet `fleet:provision` from the control plane would lay 152.0.4191.66 (a11ign#4939, control#48).

**What v0.3.9..v0.5.1 holds** (`git diff --stat v0.3.9 v0.5.1` in a blobless clone of `a11ign/control`, read at claim; 12 commits): `16 files changed, 1001 insertions(+), 90 deletions(-)`, including `src/fleet-playbook.ts` and `src/fleet-patch.test.ts`. The range carries the `patch.yml` and `fleet-playbook` changes from control#45 and control#46 as well as #48. This note does not assume they are safe; the suites below are the reading.

**The laid copy:** `pnpm install --frozen-lockfile` at this head, `packages/control/.layer-ref` reads `v0.5.1`.

**Suites at this head, with `packages/control` laid at `v0.5.1`:**
- `pnpm run test:org`: `VERDICT pass: 1254 tests in 84 files (1 skipped)`, rc 0.
- `pnpm run test:ts`: `VERDICT pass: 1419 tests in 125 files (20 skipped)`, rc 0.
- `pnpm run lint`: `✖ 575 problems (0 errors, 575 warnings)`, rc 0.
- `pnpm run typecheck`: clean, rc 0.

**Not exercised:** no playbook was RUN and no host was deployed (the resource ban). The `fleet:deploy` of the control plane and the `fleet:provision` run are `orchestrator`'s, on a11ign#4948.

Acceptance: `bash -c 'test "$(printf "%s\nv0.5.1\n" "$(node -p "require(\"./layers.json\").pinned.control.tag")" | sort -V | head -1)" = v0.5.1'` exited 0 at this head (rc 1 at `origin/main`, pin `v0.3.9`, where `sort -V` puts `v0.3.9` first).

Closes #4949

Mutation: none -- this diff changes no test file and no guard; it moves one tag string.
