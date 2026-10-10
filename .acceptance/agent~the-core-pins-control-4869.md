Pins control `v0.3.9` in `layers.json` (from `v0.3.7`): `pinned.control.tag` is the only line that moves. `pinned.lab.tag` is NOT touched (`v0.1.28`, as on `main`). Same shape as a11ign#4852.

**The tag is `v0.3.9`** (commit `fe31aef28cc841bd28e31674a7d6a1d9b5007a49`, `Release v0.3.9`, 2026-10-10T17:19:31Z; the fix is control#44, merged as `263f682`, for a11ign#4866). Read for a11ign#4858: the control host's laid copy is `v0.3.7` and still holds the literal `"--"` after `scorer:explain-feature`, so `lab:job -e job=explain-feature` exits 2 there with `the following arguments are required: --subtype, --feature`.

**What v0.3.7..v0.3.9 holds** (`git diff --stat v0.3.7 v0.3.9` in a clone of `a11ign/control`, read at claim; the row's own account holds, nothing more):
- `ansible/lab-job.yml` (+7 -1): the `"--"` after `scorer:explain-feature` is gone, with a comment saying why. This is v0.3.9.
- `src/fleet-layer/lab-job.test.ts` (+20) and `src/lab-job.test.ts` (+1 -1): the test pinning it.
- **v0.3.8 (a11ign#4863) changes what a `qualify-sha` run does:** `src/qualification-run.ts` (+136 -13) and `src/qualification-pin-skew.test.ts` (+222). `lab:job --qualify-sha` now refuses a `gate-stability` launch whose sha pins a lab tag older than the script this copy of `lab-job.yml` runs, BEFORE `pending` is posted, so it leaves no `failure` for the release to read as a regression. It reads the sha's own `layers.json` lab tag and fetches that tag one commit deep. A `qualify-sha` run against a sha with an old lab pin is therefore refused where v0.3.7 would have dispatched it.
- `package.json` (version), `CHANGELOG.md`, and `.acceptance/` files for control#44 and the v0.3.8 change: release bookkeeping.

`git show v0.3.9:ansible/lab-job.yml` around `scorer:explain-feature` (the argv goes straight to `--subtype`, no `"--"`):

```
      # NO `--` between the script and its flags: the lab's pnpm forwards it to `explain_feature.py`, where
      # argparse reads it as the end of options and `--subtype`/`--feature` arrive as positionals, so the
      # job exited 2 with "the following arguments are required" (a11ign#4866). The package script ends in
      # the script's own path, so the flags are appended to it as they are.
      explain-feature:
        params: {subtype: required, feature: required}
        argv: ["/usr/bin/corepack", "pnpm", "run", "--silent", "scorer:explain-feature",
               "--subtype", "{{ subtype }}", "--feature", "{{ feature }}"]
        timeout: 900
```

The same read against the tree `pnpm install --frozen-lockfile` laid here: `packages/control/.layer-ref` read `v0.3.9`, and `grep -cE '"scorer:explain-feature",\s*"--"' packages/control/ansible/lab-job.yml` printed `0`.

**Not exercised:** no playbook was RUN and no host was deployed (the resource ban). The deploy of the control host's checkout, the read-back of the laid `lab-job.yml` and the `explain-feature` runs are `orchestrator`'s, on a11ign#4858.

Measured at this head, with `packages/control` laid at `v0.3.9`: `pnpm run test:org` printed `VERDICT pass: 1251 tests in 83 files (1 skipped)`, and `pnpm run test:ts` printed `VERDICT pass: 1410 tests in 124 files (20 skipped)`. `pnpm run lint` 0 errors (575 warnings); `pnpm run typecheck` clean.

platform: nothing built; one pin bump.

Acceptance: `bash -c 'test "$(printf "%s\nv0.3.9\n" "$(node -p "require(\"./layers.json\").pinned.control.tag")" | sort -V | head -1)" = v0.3.9'` exited 0 at this head, from `/home/agent/repos/wt-4869` (rc 1 at `origin/main`, pin `v0.3.7`).

Closes #4869

Mutation: none -- this diff changes no test file and no guard; it moves one tag string.
