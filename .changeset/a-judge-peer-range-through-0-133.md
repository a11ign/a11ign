---
"@a11ign/judge": patch
---

**The optional `@anthropic-ai/sdk` peer now accepts `>=0.106.0 <0.134.0`, where it accepted `>=0.106.0 <0.132.0` (#5414).** If you use the Anthropic backend you may now also install SDK 0.132.x and 0.133.x without an unmet-peer warning. No version that was supported is dropped, and `@anthropic-ai/sdk` stays optional: Codex and OpenAI-compatible users never need it. 0.133.0 was checked the way the rest of the range was, by compiling the judge's calls (`messages.stream`, `finalMessage()`, adaptive thinking, text blocks) against its type declarations with `tsc --noEmit` (clean) and running `anthropic-backend.test.ts` against it (4 of 4); calls to the live API were not exercised. 0.134.0 and later are outside the range until they are checked.
