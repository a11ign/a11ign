---
"@a11ign/agent-org": patch
"@a11ign/guards": patch
---

**The clear's five-second settle is a dependency, and the PR gate's test step stops paying it (#2546).** `clearContext`, `clearBeforeOrder`, `deliver`, `deliverHandoffs`, `clearThenPrompt`, `promptOrQueue` and `performFiring` take a `sleep`, REAL BY DEFAULT: production still blocks for `CLEAR_SETTLE_MS` (5000, measured on the live org, unchanged), and a test that is not about the delay injects a no-op. `clearThenPrompt`'s fourth argument is now `{ sender, sleep }` where it was the bare `sender`. `wake-clear-settle.test.ts` pins `CLEAR_SETTLE_MS === 5000` exactly (the old pin allowed 2s to 15s), the order through `deliver` (`/clear`, wait, sleep(5000), then the order), and ONE test that injects nothing and measures the real wait. `stripComments` in `local-import-closure.mjs` blanks a comment a run at a time instead of a character at a time: the same bytes (3,000 sampled sources, 3,000 equal), a sixth of the cost, and the whole-suite closure walk behind `classifyCommand("npm run test:all")` falls from 106s to 34s under the same load.
