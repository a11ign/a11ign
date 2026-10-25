---
"@a11ign/judge": patch
---

**The optional `@anthropic-ai/sdk` peer, `>=0.106.0`, is now checked against SDK 1.1.0 (A11-265).** The range itself does not change: it has accepted every SDK from 0.106.0 up since A11-252, so 1.1.x is already inside it, and no version that was supported is dropped. What changes is that 1.1.0 has now been checked the way 0.133.0 was: the judge's calls (`messages.stream`, `finalMessage()`, adaptive thinking, text blocks) compile against its type declarations with `tsc --noEmit` (clean), and `anthropic-backend.test.ts` passes against it (4 of 4). Both passed with no change to the judge's code. SDK 1.0.0's breaking change is that the SDK now sends API version `2026-10-21`; the test answers from a local stand-in for the API, so how the live API answers under that version was not exercised. `@anthropic-ai/sdk` stays optional: Codex and OpenAI-compatible users never need it.
