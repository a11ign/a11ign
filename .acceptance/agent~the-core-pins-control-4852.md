Pins control `v0.3.7` in `layers.json` (from `v0.3.6`): `pinned.control.tag` is the only line that moves. `pinned.lab.tag` is NOT touched (`v0.1.28`, as on `main`). Same shape as a11ign#4801.

**The tag is `v0.3.7`** (commit `ad8aee4f58cf4b5370130309e9676741bd37868d`, `Release v0.3.7`, published 2026-10-10T14:48:38Z; the fix is control#42, merged as `311ba0b5d`, for a11ign#4844). Read for a11ign#4552: the control host's laid copy is `v0.3.6` and still holds the literal `"--"` after `scorer:shortcuts`, so `lab:job -e job=shortcuts` exits 2 there.

**What v0.3.6..v0.3.7 holds** (`gh api repos/a11ign/control/compare/v0.3.6...v0.3.7`, read at claim; the row's own account holds):
- `ansible/lab-job.yml` (+6 -1): the `"--"` after `scorer:shortcuts` is gone, with a comment saying why.
- `src/fleet-layer/lab-job.test.ts` (+19): the test pinning it.
- `package.json` (version), `CHANGELOG.md`, and the consumed `.changeset/*.md` deletions: release bookkeeping.
- `.acceptance/agent~the-lab-s-shortcuts-4844.md`: control's own acceptance file for control#42, not code.

The compare reports `diverged` (`behind_by 1`): the one commit in `v0.3.6` and not in `v0.3.7` is `ccb10be3c` `Release v0.3.6`, which deleted the same `.changeset/*` files and wrote the same CHANGELOG section that `ad8aee4f5` `Release v0.3.7` carries, so the `v0.3.7` tree holds all of it. No code is lost.

`git show v0.3.7:ansible/lab-job.yml` around `scorer:shortcuts` (the argv goes straight to `--model`, no `"--"`):

```
        # NO `--` BEFORE THE FLAGS. The lab's pnpm forwards a `--` to the script, where Python's argparse
        # reads it as the end of options and refuses every flag after it (`unrecognized arguments: --
        # --model ...`, exit 2, a11ign#4552). The package script already ends in the audit's own
        # arguments, so what follows `scorer:shortcuts` here is appended to them directly.
        argv: ["/usr/bin/corepack", "pnpm", "run", "--silent", "scorer:shortcuts",
               "--model", "runs/model-{{ out | default('candidate') }}",
               "--data", "runs/screenreader-dataset/with-realism.jsonl",
               "--no-baseline"]
```

The same read against the tree `pnpm install --frozen-lockfile` laid here: `packages/control/.layer-ref` read `v0.3.7`, and `grep -cE '"scorer:shortcuts",\s*"--"' packages/control/ansible/lab-job.yml` printed `0`.

**Not exercised:** no playbook was RUN and no host was deployed (the resource ban). The deploy of the control host's checkout, the read-back of the laid `lab-job.yml` and the `shortcuts` re-run are `orchestrator`'s, on a11ign#4552.

Measured at this head, with `packages/control` laid at `v0.3.7`: `pnpm run test:org` printed `VERDICT pass: 1240 tests in 81 files (1 skipped)`, and `pnpm run test:ts` printed `VERDICT pass: 1410 tests in 124 files (20 skipped)`. `pnpm run lint` 0 errors; `pnpm run typecheck` clean.

platform: nothing built; one pin bump.

Acceptance: `bash -c 'test "$(printf "%s\nv0.3.7\n" "$(node -p "require(\"./layers.json\").pinned.control.tag")" | sort -V | head -1)" = v0.3.7'` exited 0 at this head, from `/home/agent/repos/wt-4852` (rc 1 at `origin/main`, pin `v0.3.6`).

Closes #4852

Mutation: none -- this diff changes no test file and no guard; it moves one tag string.
