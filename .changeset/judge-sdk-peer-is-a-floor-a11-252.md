---
"@a11ign/judge": patch
---

**The optional `@anthropic-ai/sdk` peer is now `>=0.106.0`, where it was `>=0.106.0 <0.134.0` (A11-252).** The upper bound was a snapshot of the last release somebody checked by hand, so every later SDK minor produced an unmet-peer warning until the range was widened again. If you use the Anthropic backend you may now install any SDK from 0.106.0 up without that warning. No version that was supported is dropped, and `@anthropic-ai/sdk` stays optional: Codex and OpenAI-compatible users never need it. Compatibility with a newer SDK is shown by this repository's own suite running on the bumped SDK in Dependabot's pull request, not by a hand-written ceiling; calls to the live API are not exercised.
