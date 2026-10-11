A signed-in check is refused if it already matches the signed-out start page, and a page is audited only while it still matches. The pure decision: `packages/cli/src/auth/signed-in-check.ts`, with its controls in `signed-in-check.test.ts`. No browser; nothing calls it yet, so no run changes behaviour.

Acceptance:
```bash
git grep -q "POSITIVE CONTROL" -- packages/cli/src/auth/signed-in-check.test.ts
git grep -q "NEGATIVE CONTROL" -- packages/cli/src/auth/signed-in-check.test.ts
npx rstest run --config scripts/rstest/rstest.config.ts --include packages/cli/src/auth/signed-in-check.test.ts
```

Closes #4983
