## What

#5224 (#5153 item 3, #5121 option A, `ceo` 2026-10-11): a successful `release` run that moves `v0` now opens or updates ONE draft pull request that re-pins the guarded docs to it.

- `.github/workflows/docs-pin-write.yml`: `workflow_run` on `release` (conclusion `success`) plus `workflow_dispatch`. `decide` (`contents: read`, no `id-token`, no `pnpm install`) plans the rewrite with `planRepin`; `write` (`id-token: write`, no checkout) mints the token, shape-checks the handed docs against the commit they were read at, writes one commit of the changed docs and its own `.acceptance/` file onto `automation/docs-pin-write`, and opens the pull request as a DRAFT unless one is open. A pin the rewrite cannot match is a red `decide` naming file and line.
- `.github/chainguard/docs-pin-write.sts.yaml`: `contents: write` and `pull_requests: write`, bound to that workflow as it is on `main`; no `workflows`.
- `packages/guards/src/docs-release-pin-currency.ts`: `planRepin` (all or nothing, same reader and `GUARDED_DOC` population as `pinFaults`) and `repoReader` (the reader over git, with `git` and `read` injected).

`release.yml` and `release-promotes-by-evidence.test.ts` are untouched, and the real-tree guard stays as it is.

**Row Change 3, read and said:** the Octo STS installation already holds `pull_requests` write on this repository. Measured 2026-10-12: `gh api 'repos/a11ign/a11ign/pulls?state=all'` lists #5210 (`consumer-gate.yml: regenerate the pin`) authored by `octo-sts[bot]`, created 2026-10-12T11:07:00Z; `consumer-gate-pin-write`, `acceptance-sweep` and `auto-arm` policies all grant it. `contents` write is what `promote-action-tag` uses. So no `needs:chairman` brief.

**Not measured, and routed:** the `sub` a `workflow_run` run presents. The policy's header says so; a different `sub` makes the mint red (the safe direction), and a `workflow_dispatch` on `main` is the live reading of the same authority. The first `release` success after this merges is the reading, and Done-when 2 quotes the resulting pull request on the row.

## Evidence

- Acceptance, run at this head: 24 of 24 pass (14 existing, 10 new). New cases: docs pinning the release before are rewritten to the promoted release and commit (label included); the guard reads the rewrite as `ok` and a second plan finds nothing to move; only the pin's own commit and its own version label move; an install pin moves and a scoped package does not; a pin on or ahead of the promoted release is left alone; a pin the rewrite cannot match is a named failure that holds back the pins that could have moved; a prerelease commit is no release; no tags and no `v0` are refusals, never `current`; a path outside the guarded docs is never rewritten; `repoReader` over a fake git.
- The workflow's own scripts, extracted from the YAML and run: `decide` on this tree answered `keep` (`v0` is a11ign@0.9.0 and every pin is on it); on a scratch clone with `v0` moved to a11ign@0.10.0 it wrote README.md, docs/github-action.md and docs/try-it.md with the commit and label moved on the pin lines only. `write`, with `gh` replaced by a recorder: a good hand-off made one tree of those three files plus its acceptance file, one commit on the base, a branch, and `POST pulls` with `draft=true`; with a PR open it made `PATCH pulls/<n>`. Refused, with no git write: an extra `.github/workflows/ci.yml`, a path under `docs/nested/`, changed prose on a line, an added line, a file identical to base, and a pin naming a commit other than the promoted one. **The first run found a real defect**: the docs were passed through `jq --argjson`, past the kernel's limit on one argument (`Argument list too long`); the entries now live in a file.
- `actionlint` is not on the runner (`docs/pipeline.md`), so the workflow was read by the repository's own tests and by the runs above, not by it.

Outside the Region, forced by the work: `packages/guards/src/force-rerun-triggers-cover-the-27.test.ts` counts the policies in `.github/chainguard/` (six; it is seven), the same one-number change #4570 made.

Acceptance: pnpm exec rstest run --config scripts/rstest/rstest.config.ts packages/guards/src/docs-release-pin-currency.test.ts

Mutation: in `docs-release-pin-currency.ts`, each restored from a copy and `diff`ed byte-identical, run against the Acceptance file: (A) `repinLine` never rewrites -> 5 of 24 fail (the rewrite, loop, line-scope, install and guarded-path cases); (B) the `isOlder` guard removed, so a newer pin is moved too -> only the on-or-ahead case fails; (C) an unmatched commit produces no fault -> only the two named-failure cases fail; (D) the `GUARDED_DOC` filter dropped -> only the guarded-path case fails; (E) a fault no longer refuses the whole plan -> only the two named-failure cases fail; (F) the version label never moves -> 4 of 24 fail. All six differ from the unmutated 24 of 24.

platform: GitHub's own `workflow_run` event and Octo STS, the shape of `consumer-gate-pin.yml` and `release.yml`'s `refresh-outsider-pin`; nothing built that a platform feature does (a Renovate regex manager over the pins, #5153 item 1, is the alternative this row's `ceo` ruling did not take).
