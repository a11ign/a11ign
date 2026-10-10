Pins lab `v0.1.28` in `layers.json` (from `v0.1.27`) and names the lab scripts by their `.ts` paths: the 34 `packages/lab/scripts/*.mjs` script lines in `package.json`, and the `ExecStart` line and the comment naming the script in `.agent-org/units/a11ign-corpus-release-nightly.service` (step 2 of a11ign#4551, core PR 1). `pinned.control.tag` is NOT touched (`v0.3.3`), and neither lab nor control is.

**The tag is `v0.1.28`** (commit `3978e3a36cfcc159eecdc2c227fc5198fc7f4084`, the newest tag by `git ls-remote --tags https://github.com/a11ign/lab | sort -V`, and the one the row's promotion comment names). Proof it carries the renames, measured with `git ls-tree` over a depth-1 fetch of `a11ign/lab` at that tag: `scripts/` holds 45 `.ts` and 35 `.mjs`, the `.mjs` being lab's one-release running shims (the one for `corpus-release-nightly` re-exports and then RUNS the `.ts`, and says it is deleted by a11ign#4798).

```
$ git ls-tree --name-only v0.1.28 scripts/corpus-release-nightly.ts scripts/corpus-release.ts scripts/stability-gate.ts scripts/explain-scorer.ts
scripts/corpus-release-nightly.ts
scripts/corpus-release.ts
scripts/explain-scorer.ts
scripts/stability-gate.ts
```

Every `packages/lab/scripts/*.ts` name now in `package.json` and the unit (37 distinct) exists in the tree `pnpm install --frozen-lockfile` laid at `v0.1.28` (`packages/lab/.layer-ref` reads `v0.1.28`): checked with `[ -f ]` per name, none missing.

**Runner per caller is unchanged, only the extension moved.** `node` stays `node` and `tsx` stays `tsx` in `package.json`, and the unit's `ExecStart` is `%h/.local/bin/node` as before (upstream Node 24, #4388), which runs a `.ts` directly; the distro `/usr/bin/node` 22.22.1 does not, so nothing here names it. Not exercised: no script was RUN (the resource ban: most of these reach the lab or the corpus), so what is established is that the file exists at the pin, not that it runs.

**The lab host must not be deployed between this merge and control's release (#4796).** Control's `ansible/lab-job.yml` still names the `.mjs` by `/usr/bin/node` or `{{ lab_tsx }}`, and a `.mjs` shim run by `/usr/bin/node` stops on the `.ts` import. That is `orchestrator`'s to schedule; control's pin is the core's second pull request (a11ign#4801).

**The pin reds two scorer tests, and they are NOT in this diff: they are a11ign#4806, which lands first (`product-manager`, a11ign#4797 comment of 2026-10-10 10:41Z; #4797 is blocked by #4806).** Measured at an earlier head of this branch (204 files): with `layers.json` at `v0.1.28` and the two test lines untouched, `pnpm run verify` failed exactly 2 of 2641 tests, `packages/scorer/src/model-input.test.ts` ("NOBODY builds the model's input except this module") and `packages/scorer/src/record-builders.test.ts` ("the builders discovered are the ones we think"), both naming `build-realism-tier.mjs` where `v0.1.28` holds `.ts`. #4806 makes them accept either spelling, so they are green at `v0.1.27` and `v0.1.28`; this branch is rebased onto it and `verify` re-run before it is opened. The two Python tests (`test_grants_map_is_current.py`, `test_unclosable_map_is_current.py`) name shims that still run at this release and are a11ign#4804's, which must land before a11ign#4798 deletes them.

Host-install: `.agent-org/units/a11ign-corpus-release-nightly.service` (the installed copy is `orchestrator`'s, never the claimant's).

platform: nothing built; one pin bump and name changes.

Acceptance: `bash -c '! git grep -nE "lab/scripts/[a-z-]+[.]mjs" -- package.json .agent-org/units'` exited 0 and printed nothing at this head, from `/home/agent/repos/wt-4797` (it printed 34 + 2 lines at `origin/main`). `jq -e '.pinned.lab.tag == "v0.1.28" and .pinned.control.tag == "v0.3.3"' layers.json` printed `true`. `pnpm run lint` 0 errors; `pnpm run typecheck` clean.

Closes #4797

Mutation: none -- this diff changes no test file; the two scorer tests the pin reds are a11ign#4806's, which carries their own mutation record.
