---
"@a11ign/judge": patch
---

**The optional `@anthropic-ai/sdk` peer now accepts `>=0.106.0 <0.132.0`, where it accepted `>=0.106.0 <0.130.0` (#3473).** If you use the Anthropic backend you may now also install SDK 0.130.x and 0.131.x without an unmet-peer warning. No version that was supported is dropped, and `@anthropic-ai/sdk` stays optional: Codex and OpenAI-compatible users never need it. 0.130.0 and 0.131.0 were checked the way the rest of the range was, by compiling the judge's calls (`messages.stream`, `finalMessage()`, adaptive thinking, text blocks) against their type declarations; calls to the live API were not exercised at either version. 0.132.0 and later are outside the range until they are checked.
