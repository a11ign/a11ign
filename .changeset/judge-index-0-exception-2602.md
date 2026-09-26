---
"@a11ign/judge": patch
---

**`focusLossVerdict` no longer treats a bare `focusout` at `log[0]` as `unpairable` (#2602).** The exception was brought back on 2026-09-06 (#62) because the captures then on disk had no listener-witnessed first event: `rules:real-pages` read 80 findings at exactly that position, and 37 conformant pages carried the shape. Protocol 22 (#2587) records the element that already held focus as an `initial: true` entry, and #2550's reading of the protocol-22 real-page captures found `focusout`-first in 0 of 98 with a log, beside 9 `initial` entries. An orphan at index 0 is now an ordinary orphan and a `secondary` 2.4.7 finding, so it reaches `cantTell` and never `violated`.

**The cost, named:** `RuleInput` carries no capture protocol, so a STORED capture at protocol 21 or below that opens on a bare `focusout` now produces a 2.4.7 finding where it produced silence. **Unchanged:** a same-id reversed pair at index 0 was already a finding and is byte-identical (pinned against the original `rules.ts`); an `initial` focusin followed by a `focusout` is still `clear` or `unpairable` by `initialHoldLossVerdict` and is never read for a hold time.
