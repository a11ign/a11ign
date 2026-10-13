The reviewer role file states the outside-pull-request rule (the a11ign half of agent-org#1311): an OUTSIDE pull request is read, never run, and its Acceptance evidence is CI's token-less acceptance job. A new section, `An outside pull request is read, never run (#1311)`, sits before `Before anything`; steps 2 and 4 and the escalation section now say they apply to INSIDE pull requests only, so no older line tells the reviewer to run what the new one forbids. The trust rule it relies on is the one agent-org's `src/review-trust.ts` already decides (`isCrossRepository === false` AND a declared author login).

- **The row's Acceptance does not separate this change from its absence.** Run as written against `origin/main`'s copy of the file (`git show HEAD:.agent-org/roles/reviewer.md`), it already prints PASS, because `outside` and `never run` were in the file before this change (`Never run anything that reads runs/`, and `outside` in several sections). Reported on #5393 for `product-manager`; the Acceptance is not edited here.
- **The Open-check does separate it:** `grep -ci "outside pull request" .agent-org/roles/reviewer.md` reads 0 at `origin/main` and 5 with this change.
- **Regression check on the org suite:** `pnpm run test:org` (94 files, the guard tests that read role files included) passes at this head: 1317 passed, 1 skipped, 0 failed, after `pnpm run build` supplied the `packages/judge/dist` that `judge-exports-on-disk` needs.

Acceptance: bash -c 'grep -qi "outside" .agent-org/roles/reviewer.md && grep -qi "never run" .agent-org/roles/reviewer.md'

Closes #5393
