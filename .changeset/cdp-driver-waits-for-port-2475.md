---
"@a11ign/nvda-worker": patch
---

**The authenticated-capture driver waits for Edge's DevTools port instead of asking once (#2475).** `openCdpDriver` asked `/json/list` a single time right after `openPage` spawned Edge, and Edge listens about half a second later, so every authenticated capture on a real worker failed with `connect ECONNREFUSED 127.0.0.1:9222` before the login began (12 of 12 on `a11y-worker-3`, #2399). It now retries a REFUSED connection until the port answers, bounded by the same 60 s the reusable launch gives it (`CDP_READY_TIMEOUT_MS`, now exported from `browser-session.mjs`), and refuses with `CDP: the DevTools port <n> did not open within <ms> ms`. Any other failure, and any HTTP status, still surfaces at once.
