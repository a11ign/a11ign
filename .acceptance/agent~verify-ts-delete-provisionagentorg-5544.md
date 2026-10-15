Row #5544: `scripts/verify.ts` deletes `provisionAgentOrg` and `refreshAgentOrgClone`, the clone path #5459 left unused. `presentAgentOrg` (which never clones, fetches or moves a checkout) is the only reader of the tool's checkout. `agentOrgSource` returns the directory; its clone and refresh fields, `AGENT_ORG_REMOTE`, `FETCH_TIMEOUT_MS` and the `sh` helper go with the clone. The cache path stays read, since a clone an earlier run left is still a checkout `presentAgentOrg` finds. `scripts/verify-agent-org-cache.test.ts` is deleted; `packages/guards/src/verify-present-agent-org.test.ts` covers the same resolution order.

Acceptance: `test -z "$(git grep -l -E 'provisionAgentOrg|refreshAgentOrgClone' -- scripts)"`

Mutation: appending `const _m = provisionAgentOrg;` to `scripts/verify.ts` makes the Acceptance exit 1; restored from a copy, the file is byte-identical (`cmp`) and the Acceptance exits 0 again.

## Evidence

Measured at head `2270ca84c` (the code and tests as committed; this file is the commit after it):

- The Acceptance exits 0. Before the change, the same `git grep` listed `scripts/verify.ts` and `scripts/verify-agent-org-cache.test.ts`.
- `pnpm run typecheck` exits 0.
- `pnpm run lint`: 0 errors (677 warnings, all `no-magic-numbers`, non-blocking).
- `node --test packages/guards/src/verify-present-agent-org.test.ts packages/guards/src/agent-org-src-reach.test.ts`: 25 pass, 0 fail. This covers `presentAgentOrg` returning null with no checkout, and the sibling, explicit and cache paths.
- `pnpm run verify`: GREEN at `2270ca84c`. The affected set is 4 test files and 59 tests, against `origin/main`. The tree-wide guards run in CI only.
