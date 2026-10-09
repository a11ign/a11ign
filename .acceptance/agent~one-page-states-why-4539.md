## What

Adds `## Why an authenticated run refuses, and how to opt in` to `docs/try-it.md`: both refusals by fault name, the reason, the opt-in where one exists, and what it risks. SECURITY.md links to it from both refusals.

- **`auth-refused-judge-backend`:** the opt-in is `--send-authenticated-transcript-to-judge-vendor` (the Action's `send-authenticated-transcript-to-judge-vendor: "true"`). The page says what it risks: the signed-in page's transcript leaves the machine for the named vendor, credentials are redacted either way, and everything else on the page is still sent.
- **`auth-refused-remote-worker`:** **no opt-in, by design** (done-when 2, first reading). ADR 0038 Constraint 1 refuses until the channel is authenticated and encrypted. I read the code to check the SSH-tunnel candidate: `isRemoteWorker` (`packages/cli/src/auth/refusals.ts:61`) judges only the address it was given, so a tunnel's `127.0.0.1` passes unasked. That is a tolerance and not a safe opt-in (ADR amendment 5: it is a real session on a shared machine if that worker holds the variable), so the page says so and names the two supported routes (the Action; a worker on your own machine). No row filed, because the missing piece is an authenticated, encrypted channel, not a small change.

## Verification

- Acceptance, run as written, exits 0 (both commands).
- The page's four in-page anchors, and the two anchors SECURITY.md now links to, resolve with `headingAnchors` (measured, not read off the text).
- **`pnpm run verify` is NOT green, and not because of this diff:** its `ts` step stops at `pnpm run docs:coverage`, which runs `packages/lab/scripts/generate-coverage-doc.ts`; `packages/lab` is not in `origin/main`'s tree (`git ls-tree origin/main packages/`). `rstest run --changed=origin/main` ran 0 tests (docs only). Not run: lint, typecheck, `test:org`.

platform: nothing to check; a prose change to two docs.

Acceptance:
```bash
grep -q '^## Why an authenticated run refuses' docs/try-it.md
bash -c 'grep -q auth-refused-remote-worker docs/try-it.md && grep -q send-authenticated-transcript-to-judge-vendor docs/try-it.md'
```

Closes #4539

🤖 Generated with [Claude Code](https://claude.com/claude-code)
