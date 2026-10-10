The two Python tests that run the lab's emitters name them by their `.ts` paths (`emit-grants-map.ts`, `emit-unclosable-vetoes.ts`), so lab deleting the `.mjs` shims at a11ign#4798 does not redden them. Both now run the emitters with the upstream Node 24 at `~/.local/bin/node` (#4388) when that file exists and the PATH's `node` otherwise, with the reason written beside the line: the distro `/usr/bin/node` does not run `.ts` reliably.

**The row's literal command still prints three lines at this head, and they are not this row's.** `packages/scorer/src/model-input.test.ts:67` and `packages/scorer/src/record-builders.test.ts:99,117` name `build-realism-tier.mjs`, deliberately: a11ign#4806 (landed) made them find the builder under EITHER spelling and fail when exactly one is not present, with a comment that the `.mjs` spelling goes when a11ign#4798 deletes the shims. They are outside this row's Region and do not redden when the shims go (the `.ts` is found first). The Acceptance below is the row's command narrowed to its Region.

Acceptance: `bash -c '! git grep -nE "lab/scripts/[a-zA-Z0-9_-]+[.]mjs" -- packages/scorer/tests'` exited 0 and printed nothing at this head (on `main` it printed the two `.mjs` lines in the Python tests). `pytest packages/scorer/tests/test_grants_map_is_current.py packages/scorer/tests/test_unclosable_map_is_current.py` printed `7 passed` with lab `v0.1.28` laid by `scripts/lay-layer.ts lab` (the pin on `main`, `.layer-ref` reads `v0.1.28`). `pnpm run test:python` printed `293 passed, 11 skipped`.

Mutation: with the two `.mjs` shims moved out of the laid `packages/lab/scripts/`, the OLD tests (`git show origin/main:` copies) print `7 failed` and the NEW ones print `7 passed` (measured). Restored: the four `emit-*` files are present again and `git status` is clean. Not exercised: `pnpm run verify`; the change is two Python test files and nothing else reads them.

Closes #4804

🤖 Generated with [Claude Code](https://claude.com/claude-code)
