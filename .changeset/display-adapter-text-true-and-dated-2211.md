---
"@a11ign/worker-fleet": patch
"@a11ign/nvda-worker": patch
---

**`displayAdapter`'s operator-facing text now says what is true, dates every hardware reading, and is pinned (#2211).** #2246 had already replaced "no deployed worker reports it yet" in `fleet-consistency`'s exemption, but pinned only the field's behaviour and none of its text, so the correction held at one commit with nothing keeping it there. The exemption now dates the 640x480 fallback (2026-09-22, #1955) and the `UHD`/`HD` reading (2026-09-23); the worker's own `displayAdapter` comment no longer says the fleet reads the field as `unknown` "until this code is deployed" (deployed 2026-09-23T18:02Z) and dates its 640x480 clause. Three tests in `fleet-consistency.test.ts` hold this: neither text may claim the field is unreported, the exemption must state that 10 of 10 guests report it, and each hardware reading must sit beside a date. Each carries a positive control that the old sentence is caught. Comment-only in `server.mjs`: no behaviour, `CAPTURE_PROTOCOL_VERSION`, `provisionRevision` or `environmentKey` moved.
