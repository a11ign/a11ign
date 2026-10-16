## What

#5553: the re-pin writer refused every release at `docs/github-action.md:49`. `planRepin` moved `pins release X` but not the sentence `The release is tagged \`a11ign@X\` and the commit is the one the tag names`, so the writer's shape check (`docs-pin-write.yml`, every changed non-pin line must contain `a11ign@<new>` or `commit of release <new>`) refused the whole re-pin.

- `packages/guards/src/docs-release-pin-currency.ts`: a MOVABLE restatement added to `RESTATEMENTS`, matching `a11ign@X` in that sentence when the wrap breaks before `names` (`> names;`). The `[#>]` allowance is needed because `moveRestatements` matches the raw joined text, where the blockquote marker is present.
- `packages/guards/src/docs-release-pin-currency.test.ts`: a fixture test (the sentence moves, and `pinFaults` reports nothing); `refusalOf`, the writer's shape check mirrored as a helper, with a negative control (a line naming `a11ign@0.10.3` beside a re-pin to `0.10.8` is refused) and positive controls; and a real-tree test that plans a re-pin of the real `docs/` and `README.md` and asserts every changed line is an action pin of the new commit or names `a11ign@<new>` or `commit of release <new>`.

## Evidence

**planRepin output, real docs, re-pinned to `0.10.8`** (`a11ign@0.10.8^{commit}` = `b403bc726b3ba0896ba94284240fa8ba4a5ecf92`; script at the scratchpad, output at `/tmp/claude-1000/-home-agent-repos-wt-5553/0f6b742c-6653-4789-a750-d90eae103974/scratchpad/repin-demo.out`):

```
status: rewrite promoted: {"version":"0.10.8","commit":"b403bc726b3ba0896ba94284240fa8ba4a5ecf92"}
faults: []
unmoved: ["docs/github-action.md:22","docs/github-action.md:142","docs/try-it.md:354"]
docs/github-action.md:49
  - > **This pins release `0.10.3`, by its commit.** The release is tagged `a11ign@0.10.3` and the commit is the one the tag
  + > **This pins release `0.10.8`, by its commit.** The release is tagged `a11ign@0.10.8` and the commit is the one the tag
```

Changed lines in all: README.md 178, 179, 198; docs/github-action.md 21, 49, 356, 357, 413, 500; docs/try-it.md 56, 57, 335. Line 49 is planned, and the sentence continues `names;` on the next line.

**Fails at origin/main.** The origin/main planner, swapped in from a copy and restored byte-identical, makes 2 tests fail; the failure message names the line: `docs/github-action.md:49 is neither an action pin nor names a11ign@0.10.4: > **This pins release …The release is tagged \`a11ign@0.10.3\``.

**Mutations** (each restored from a copy and `diff`ed byte-identical, never `git checkout --`):
- The new entry set to `movable: false`: 2 tests fail (the fixture case and the real-tree case).
- The test helper `refusalOf` made to accept everything: 1 test fails (the refusal test).

**Finding, out of scope for #5553: a merged re-pin leaves the guard red.** After the re-pin above, `pinFaults` over the planned real docs still reports:
- `docs/github-action.md:22` names release 0.10.3 in a sentence that restates the pin, but the pin is on a11ign@0.10.8
- `docs/github-action.md:142` (same)
- `docs/try-it.md:354` (same)

These are the three `unmoved` lines. They are dated or behavioural prose, which `#5468` keeps non-movable. The writer (`docs-pin-write.yml`) never reads `unmoved` and never runs the guard on its output, so nothing in the re-pin pass catches this. That is why the real-tree test asserts the writer's shape check, not `pinFaults` over the output. Closing it needs a decision on the dated prose (move it, or teach the guard to accept it), which is not this row's change.

Acceptance: bash -c 'pnpm exec rstest run --config scripts/rstest/rstest.config.ts packages/guards/src/docs-release-pin-currency.test.ts'

Mutation: each restored from a copy and `diff`ed byte-identical, never `git checkout --`, against `docs-release-pin-currency.test.ts` (31 tests): (A) the origin/main planner swapped in -> 2 fail, and the failure names `docs/github-action.md:49`; (B) the new `RESTATEMENTS` entry set to `movable: false` -> 2 fail (the fixture case and the real-tree case); (C) the test helper `refusalOf` made to accept every line -> 1 fails, the refusal test.
