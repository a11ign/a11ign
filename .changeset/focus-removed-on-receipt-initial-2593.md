---
"@a11ign/lab": patch
---

**`focusRemovedOnReceipt` no longer manufactures `focus-removed-on-receipt` from a protocol-22 `initial` focusin (#2593).** An `initial` focusin is a hold the install found, not one it saw arrive, so a fast `focusout` of the same id read as "held N ms" and fired the signal from the capture's own timing. The predicate now reads no hold time off it, matching `initialHoldLossVerdict` in the judge; a non-initial pair inside `SCRIPT_BLUR_WINDOW_MS` fires exactly as before.
