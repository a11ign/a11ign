---
"@a11ign/judge": patch
---

**The optional `@anthropic-ai/sdk` peer now accepts `>=0.106.0 <0.130.0`, where it accepted only `^0.106.0` (#3265).** If you use the Anthropic backend you may install any SDK release from 0.106.0 up to, but not including, 0.130.0 without an unmet-peer warning; before, only 0.106.x was in range, while the SDK this package is tested against had moved on to 0.129. No version that was supported is dropped, and `@anthropic-ai/sdk` stays optional: Codex and OpenAI-compatible users never need it. Every release in the range was checked by compiling the judge's calls (`messages.stream`, `finalMessage()`, adaptive thinking, text blocks) against its type declarations; calls to the live API were not exercised at each version. Nothing below 0.106.0 was checked, and 0.130.0 and later are outside the range until they are.
