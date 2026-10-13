Sets `routing.sonnetVetoMinP` to `0.95` in a11ign's `.agent-org/project.json`, so a Sonnet pick must reach P 0.95 before it vetoes Haiku on a Tests-first row (was 0.85 under #5209). The chairman's ruling was to raise it ONLY once the row-review reviewer is live: a11ign#5325 closed at 03:59Z on 2026-10-13, with `review.rowReviewSkill` turned on at 02:09:10Z by `machinery:flag` (its closing comments say so; this diff does not turn it on). The key sits beside `question: "choice"`; no other key changes. Revert is setting it back to `0.85`.

platform: this is a declaration key agent-org already reads (`readRouting` and `readVetoThreshold` in agent-org's `src/project-config.ts`, merged under #5208); nothing to build.

Acceptance:
```bash
bash -c 'node -e "process.exit(require(\"./.agent-org/project.json\").routing.sonnetVetoMinP===0.95?0:1)"'
```

Mutation: run against scratch copies of the file, the command exits 1 with the value at 0.85 and at 0.9, and 0 at 0.95, so the check moves with the value. The real file was never mutated.

Guards: `packages/guards/src/dora-declaration.test.ts`, `layer-repository-protection.test.ts`, `no-stored-github-token-readers.test.ts` and `octo-sts-trusted-issuers.test.ts` read this file; `pnpm run test:org` passes (1306 tests in 93 files, 1 skipped) at this head.

Done-when 2 (the first routing decision that names 0.95) is a post-merge reading and is not claimed by this PR.

Closes #5327
