The two Python tests that run the lab's emitters name them by their `.ts` paths (`emit-grants-map.ts`, `emit-unclosable-vetoes.ts`), so lab deleting the `.mjs` shims at a11ign#4798 does not redden them. Both now run the emitters with the upstream Node 24 at `~/.local/bin/node` (#4388) when that file exists and the PATH's `node` otherwise, with the reason written beside the line: the distro `/usr/bin/node` (22.22.1 here) does not run `.ts` reliably.

**Not in this diff, by the row's own re-scoping:** `packages/scorer/src/model-input.test.ts:64` and `packages/scorer/src/record-builders.test.ts:97` still name `build-realism-tier.mjs`; they move in a11ign#4797's pull request. So the row's literal command over all of `packages/scorer` still prints those two lines at this head, and passes once a11ign#4797 has merged. The Acceptance below is the same command narrowed to this row's Region.

Acceptance: `bash -c '! git grep -nE "lab/scripts/[a-zA-Z0-9_-]+[.]mjs" -- packages/scorer/tests'` exited 0 and printed nothing at this head (it printed the two `.mjs` lines on `main`). `pytest packages/scorer/tests/test_grants_map_is_current.py packages/scorer/tests/test_unclosable_map_is_current.py` printed `7 passed` against lab `v0.1.28` laid in this worktree (copied from the a11ign#4797 worktree's laid tree, `.layer-ref` reads `v0.1.28`; not the main pin `v0.1.27`).

Mutation: with the two `.mjs` shims moved out of the laid `packages/lab/scripts/`, the OLD tests (`git show HEAD:` copies) print `7 failed` and the NEW ones print `7 passed` (measured). Restored byte-identical (`diff` against a copy taken first). Not exercised: `pnpm run verify` and the full `test:python`; the change is two Python test files and nothing else reads them.

Closes #4804

🤖 Generated with [Claude Code](https://claude.com/claude-code)
