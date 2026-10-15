Decision for #5361: option (a), publish the refusal-owner reader from `@a11ign/toolchain`, which `a11ign/lab` already depends on (ADR 0045 rule 2: the producer exports, the consumer bumps). The follow-up row is a11ign/agent-org#1415; the core and lab deletions wait on its release. Until then this file is authoritative and a rule change is made in both.

The only diff is the header comment of `scripts/refusal-owners-are-open.ts`, which recorded "a11ign/a11ign#5361 decides" on the lab side and now says what was decided.

Acceptance: `git grep -q "export function ownersOf" -- scripts/refusal-owners-are-open.ts` exits 0.

Mutation: none -- a comment-only change, no guard touched.

platform: checked npm/pnpm workspace publishing; the toolchain is already a published `@a11ign/*` package the lab consumes, so no new package is created.
