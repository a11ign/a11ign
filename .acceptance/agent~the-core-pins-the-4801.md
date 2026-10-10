Pins control `v0.3.6` in `layers.json` (from `v0.3.5`): `pinned.control.tag` is the only line that moves (step 4 of a11ign#4551, core PR 2). `pinned.lab.tag` is NOT touched (`v0.1.28`, as on `main`).

**The tag is `v0.3.6`** (commit `ccb10be3c27316680225116266b3ae932d9951fa`, the newest tag by `git ls-remote --tags https://github.com/a11ign/control | sort -V`, and the one the row's promotion comment names, released by a11ign#4796). Measured with a depth-1 fetch of `a11ign/control` at that tag:

```
$ git ls-tree v0.3.6 ansible/lab-job.yml
100644 blob 2e023d913770f61c642be8e4a07d467c783a6aca	ansible/lab-job.yml
$ git show v0.3.6:ansible/lab-job.yml | grep -cE 'lab/scripts/[a-z0-9-]+[.]mjs'
0
```

The same count against the tree `pnpm install --frozen-lockfile` laid here (`packages/control/.layer-ref` reads `v0.3.6`): `grep -cE 'lab/scripts/[a-z0-9-]+[.]mjs' packages/control/ansible/lab-job.yml` printed `0`. The row's Open-check read `10` at the `v0.3.5` pin.

**Not exercised:** no playbook was RUN and no host was deployed (the resource ban), so what is established is that the pinned tag's `lab-job.yml` names no `.mjs`, not that it runs. The lab host's deploy is `orchestrator`'s to schedule; lab `v0.1.28` is the tree it names the `.ts` scripts in.

Measured at this head, with `packages/control` laid at `v0.3.6` by `pnpm install --frozen-lockfile`: `pnpm run verify` printed GREEN (affected set against `origin/main`; its `ts` leg was NOT-NEEDED for a JSON-only diff, so the wider suites were run by hand), `pnpm run test:org` printed `VERDICT pass: 1240 tests in 81 files (1 skipped)`, and `pnpm run test:ts` printed `VERDICT pass: 1410 tests in 124 files (20 skipped)`. `pnpm run lint` 0 errors; `pnpm run typecheck` clean.

platform: nothing built; one pin bump.

Acceptance: `bash -c 'test "$(printf "%s\nv0.3.6\n" "$(node -p "require(\"./layers.json\").pinned.control.tag")" | sort -V | head -1)" = v0.3.6'` exited 0 at this head, from `/home/agent/repos/wt-4801` (rc 1 at `origin/main`, pin `v0.3.5`).

Closes #4801

Mutation: none -- this diff changes no test file and no guard; it moves one tag string.
