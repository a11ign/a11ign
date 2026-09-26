---
"@a11ign/nvda-worker": patch
"@a11ign/judge": patch
"@a11ign/lab": patch
---

**The focus-event log now records what already held focus (#2587, #2550 half 2), and `CAPTURE_PROTOCOL_VERSION` is 22.** A protocol-21 log opens on whatever the page does next, so a control that held focus first (a cookie-consent widget, on 8 of 100 protocol-21 real pages) shows as a bare `focusout` that 2.4.7's rule can only call `unpairable`. The install now pushes `document.activeElement` as the first entry, `type: "focusin"` with `initial: true`; focus on the body pushes nothing. `focusLossVerdict` reads no hold time off an `initial` entry, since its `atMs` is the install moment: its `focusout` is `clear` when focus lands on a different control inside the window and `unpairable` otherwise, and a witnessed pair asserts exactly as before. The `i === 0` carve-out stays for captures at protocol 21 and below. Deploying needs `--allow-protocol-change` and a recapture, which this change does not perform.
