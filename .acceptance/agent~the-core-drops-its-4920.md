Deletes the core's copy of the `a11ign/control` playbook checks (#4425, row 2 of the next tranche). The `ansible` job, its `changed` output, its `gate` entry and `needs.ansible.result` argument leave `ci.yml`; the two comments that described the job (`trunk.yml`'s KNOWN GAP, `verify.ts`'s `CI_ONLY.ansible`) go with it, and so do the `ci.yml -> packages/control` entry in `layer-edges.baseline.json` and the positive control in `layer-edges.test.ts` that asserted it (both named a line that no longer exists).

**Scope, as split by `product-manager` on this row (2026-10-11):** the `ansible` category in `scripts/ci-changed.ts` is NOT touched here. It is a behavioural copy of `@a11ign/toolchain@0.7.1`'s `lib/ci-changed`, pinned equal by `bootstrap-copies-gate-match-toolchain.test.ts` (#4591), so it goes with the toolchain's drop (#4932) and the pin bump (#4933).

**Precondition (Done-when 2): the same check has run green in the layer's own CI.** #4919 is closed; `a11ign/control#47` merged as `e6283db`, and its `ansible` job passed in the merge-queue run that produced that commit: run `38107707954`, job `114376625987` (`success`). `control`'s `ci.yml` has no `push` trigger (the same rule as this repository's), so the merge-queue run is the run on its `main`.

platform: nothing to build; this removes a job GitHub Actions ran.

Acceptance:
```bash
bash -c 'test "$(grep -cE "^  ansible:|needs\.ansible|outputs\.ansible" .github/workflows/ci.yml)" = 0'
```
## Evidence

The command exits 0 at this head. `gate`'s `needs` list and its result loop name the same ten jobs, so no required check names `ansible` (Done-when 3).
