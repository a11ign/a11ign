Sets `routing.sonnetVetoMinP` to `0.85` in a11ign's `.agent-org/project.json`, so a Sonnet pick must reach P 0.85 before it vetoes Haiku on a Tests-first row (#5208 made the bar a project setting; absent it stays 0.7). The key sits beside `question: "choice"`; no other key changes. Revert is removing `sonnetVetoMinP` from the block.

platform: this is a declaration key agent-org already reads (`readRouting` and `readVetoThreshold` in agent-org's `src/project-config.ts`, merged under #5208); nothing to build.

Parse check: agent-org's `parseProjectDeclaration`, run on the edited file from agent-org's `main` checkout, accepts it and returns `routing` as `{"question":"choice","routes":["haiku/high","sonnet/medium","sonnet/high"],"guidance":{},"cheaperMinP":0.5,"dearerMinP":0.7,"sonnetVetoMinP":0.85}`.

Acceptance:
```bash
bash -c 'node -e "process.exit(require(\"./.agent-org/project.json\").routing.sonnetVetoMinP===0.85?0:1)"'
```

Mutation: the command exits 1 with the key absent (the state before the change) and with the value at 0.7 or 0.9, and 0 at 0.85, so the check moves with the value. Run against scratch copies of the file; the real file was never mutated.

Guards: `packages/guards/src/dora-declaration.test.ts`, `layer-repository-protection.test.ts`, `octo-sts-trusted-issuers.test.ts` and `no-stored-github-token-readers.test.ts` read this file and pass (87 tests, 4 files).

Closes #5209
