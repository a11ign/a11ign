## What

The release-pin guard measured a doc's pin against the NEWEST `a11ign@<x.y.z>` tag. A tag can run ahead of the release `v0` names while that release is in flight, so a correct pin went red for an unpromoted release (2026-10-11: `a11ign@0.8.0` was tagged while `v0` and `latest` were still on 0.7.0).

- `Reader` gains `v0Commit()`: the commit `refs/tags/v0^{commit}` points at, or `undefined` when the checkout has no `v0`. The checkout reader catches the non-zero `rev-parse` for a missing tag and returns `undefined`; that is a verdict, not an error.
- `pinFaults` resolves that commit to its `a11ign@<x.y.z>` tag (`releaseV0Points`) and measures every pin against that release. `MINORS_ALLOWED_BEHIND` stays 1; a pin newer than `v0` is not a fault.
- `v0` absent, or at a commit no qualified `a11ign@<x.y.z>` tag names (untagged, or a prerelease), is `cannot-tell` and FAILS, with `CANNOT_TELL_V0` naming the remedy. It is never a pass or a skip.
- The fault text names `v0`'s release: `v0 points at a11ign@<x.y.z>`.
- The remedy text says `git fetch --tags --force`: `v0` moves, and a plain `git fetch --tags` refuses to move a tag the checkout already has. This checkout's local `v0` was exactly that stale (it pointed at 0.3.1 while origin's `v0` is 0.7.0), so the real-tree case read the wrong release until the tag was refreshed.

## Evidence

- Baseline before the change: `node --test packages/guards/src/docs-release-pin-currency.test.ts` passed 10/10 on the unchanged code.
- After: the same command passes 14/14 (`ℹ pass 14`, `ℹ fail 0`).
- Real-tree case, after refreshing the local tag with `git fetch origin '+refs/tags/v0:refs/tags/v0'` (`v0` now `0f481d193` = `a11ign@0.7.0`, which is origin's `v0`): `node --test packages/guards/src/docs-release-pin-currency.real-tree.test.ts` passes 1/1. The pins in `README.md` and `docs/*.md` are all `0f481d19…` (0.7.0), so they are on `v0`'s release.
- `pnpm run lint`: 0 errors (655 pre-existing warnings, none in the three changed files). `pnpm run typecheck`: 0 errors.
- Mutation checks (guard file backed up to the scratchpad and restored byte-identical with `cmp`):
  - M1, measure against the newest tag (ignore `v0`): 2 red, both the 2026-10-11 case and the cannot-tell case for an untagged or prerelease `v0`.
  - M2, `v0` absent treated as the newest tag: 1 red, the `v0 absent` case.
  - M3, a prerelease or untagged `v0` accepted (no release filter): 4 red, including the pin-two-behind case and the whole-major case.
  - Each mutation turns only its own named cases red.
- `pnpm exec rstest run packages/guards/src/docs-release-pin-currency` reports "No test suites found" for these files. They import `test` from `node:test`, as the unchanged file did, and 85 of the guards test files use that runner, so this is the existing runner setup and was not changed here.

## Acceptance

```bash
bash -c 'node --test packages/guards/src/docs-release-pin-currency.test.ts'
```

Closes #5070
