Deletes the core's copy of the `a11ign/control` playbook checks (#4425, row 2 of the next tranche). The `ansible` job, its `changed` output, its `gate` entry and `needs.ansible.result` argument leave `ci.yml`; the `ansible` category leaves `scripts/ci-changed.ts` and its test; the two comments that described the job (`trunk.yml`'s KNOWN GAP, `verify.ts`'s `CI_ONLY.ansible`) go with it.

**Precondition (Done-when 2): the same check has run green in the layer's own CI.** #4919 is closed; `a11ign/control#47` merged as `e6283db`, and its `ansible` job passed in the merge-queue run that produced that commit: run `38107707954`, job `114376625987` (`success`). The `gate` of that run needs `[changeset, checks, ansible]` and passed. `control`'s `ci.yml` has no `push` trigger (the same rule as this repository's), so the merge-queue run is the run on its `main`.

platform: nothing to build; this removes a job GitHub Actions ran.

Acceptance:
```bash
bash -c 'test "$(grep -cE "^  ansible:|needs\.ansible|outputs\.ansible" .github/workflows/ci.yml)" = 0'
bash -c '! grep -qE "ansible[:=]" scripts/ci-changed.ts packages/guards/src/ci-changed.test.ts'
```
## Evidence

Both commands exit 0 at this head. `packages/guards/src/ci-changed.test.ts` passes (35 tests, rstest). `eslint` is clean on the three changed `.ts` files. `gate`'s `needs` list and its result loop name the same ten jobs, so no required check names `ansible` (Done-when 3).

Closes #4920

🤖 Generated with [Claude Code](https://claude.com/claude-code)
