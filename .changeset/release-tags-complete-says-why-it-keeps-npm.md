---
---

`scripts/release-tags-complete.ts` says why it spawns `npm`: `npm view` reads the registry a consumer's `npm install` reads, so the lab's `no-npm-spawn.test.ts` pin now carries a reason, not a bare allowlist entry (#4594). A comment only; nothing published changes.
