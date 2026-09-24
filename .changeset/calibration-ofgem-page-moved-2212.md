---
"@a11ign/lab": patch
---

**The Ofgem calibration entry moves to `…/your-energy-supply/your-energy-bill/energy-price-cap-and-standing-charges-explained`**, the address the publisher moved the page to on 2026-09-24 (same content: `curl -L` ends at the new address, HTTP 200, 198,599 bytes at both). Its role, `publishedClaim` and `claimExcludes` are unchanged, so the calibration split stays 49; the old address is appended to `movedFrom`, and the findings baseline is re-keyed to the new URL with its value (`["2.4.3"]`) untouched (#2212).
