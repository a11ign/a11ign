ADR 0045 records where the core reads each layer from once it stops laying them: a section `## How a host launches and the core reads a layer`, answering the four questions `ceo` ruled on #5075 (2026-10-11), each answer naming the cut that made it true.

- **Measured** (the Acceptance, `git grep -q` on the heading): exit 1 at the base `39ea569ef`, before the section was written; exit 0 at this head.
- **Premise, re-read**: the ruling's facts were read at a11ign `d9f5404c1`. Since then cuts 2, 4, 6, 8 and 9 (#5080, #5082, #5084, #5086, #5087) landed on `main`, so the section records the answers as landed. `scripts/test-support/stamp-files.ts`, which the ruling names, no longer exists: cut 9 deleted it. `layers.json` is gone with it.
- **Deviation from the ruling, named in the section**: the ruling's first draft moved `rules-check` to lab's CI; `#4936` had already moved the product's own cases into the core, and `rules-check` runs from `packages/judge/src/fitness/rules-check.ts` with no edge into lab.
- **Paths named in the section, measured at this head**: `packages/judge/src/fitness/rules-check.ts` exists; `package.json` has the `worker` script (line 22), `guest:run` (line 35), `fleet:normalise` (line 39) and `gate:lab-held` (line 37).
- **Mutation**: the heading changed to `## How a host launch` with `sed -i`; the Acceptance exited 1. Restored from a copy, `diff -q` identical; the Acceptance exited 0.

Acceptance: bash -c 'git grep -q "^## How a host launches and the core reads a layer" -- docs/adr/0045-a-repository-uses-another-only-through-its-published-package.md'

Mutation: the grep notices its own target. With the heading broken to `## How a host launch`, the Acceptance exited 1; restored byte-identical (`diff -q`), exit 0.

Closes #5075
