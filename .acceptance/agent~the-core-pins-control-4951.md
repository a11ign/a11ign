Pins control `v0.5.2` in `layers.json` (from `v0.5.1`): `pinned.control.tag` is the only line that moves. `pinned.lab.tag` is NOT touched (`v0.1.28`, as on `main`). Same shape as a11ign#4949.

**The tag is `v0.5.2`** (commit `66077c439f2a6c20e89fd1b0997b7cd46d99b368`, read at claim with `git ls-remote --tags https://github.com/a11ign/control.git v0.5.2`). It carries the `probeWorker` retry from a11ign#4944: `git show v0.5.2:src/fleet-status.ts` holds `retryOnce` (commit `8cec908`, `fleet:patch: probeWorker retries once before it says unreachable`), and `9a0b976` makes the call site pass the worker alone (the `map` index was being read as the options argument). It also keeps the 155.0.4283.45 Edge pin: `git show v0.5.2:ansible/roles/worker/defaults/main.yml` gives `worker_edge_version: "155.0.4283.45"` (line 166).

**What v0.5.1..v0.5.2 holds** (`git diff --stat v0.5.1 v0.5.2` in a blobless clone of `a11ign/control`, read at claim; 3 commits): `5 files changed, 105 insertions(+), 6 deletions(-)`, all in `src/fleet-status.ts` and its test, `CHANGELOG.md`, `package.json` (version `0.5.2`) and one `.acceptance/` file. No playbook and no `ansible/` file changes in the range.

**The laid copy:** `pnpm install --frozen-lockfile` at this head, `packages/control/.layer-ref` reads `v0.5.2`, and `packages/control/src/fleet-status.ts` contains `retryOnce`.

**Suites at this head, with `packages/control` laid at `v0.5.2`:**
- `pnpm run test:org`: `VERDICT pass: 1254 tests in 84 files (1 skipped)`, rc 0.
- `pnpm run test:ts`: `VERDICT pass: 1419 tests in 125 files (20 skipped)`, rc 0.
- `pnpm run lint`: `✖ 575 problems (0 errors, 575 warnings)`, rc 0.
- `pnpm run typecheck`: clean, rc 0.

**Not exercised:** no playbook was RUN and no host was deployed (the resource ban). The live run that the retry is for is a11ign#4937 (`lane:orchestrator`), and the `fleet:patch` and `fleet:provision` runs that would use this pin are `orchestrator`'s, on a11ign#4948.

Acceptance: `bash -c 'test "$(printf "%s\nv0.5.2\n" "$(node -p "require(\"./layers.json\").pinned.control.tag")" | sort -V | head -1)" = v0.5.2'` exited 0 at this head (rc 1 at `origin/main`, pin `v0.5.1`, where `sort -V` puts `v0.5.1` first).

Closes #4951

Mutation: none -- this diff changes no test file and no guard; it moves one tag string.
