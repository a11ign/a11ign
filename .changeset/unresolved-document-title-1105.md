---
"@a11ign/nvda-worker": patch
---

**`CAPTURE_PROTOCOL_VERSION` moves 19 -> 20.** `interaction.formChanges[].after` intermittently recorded
NVDA's `"unknown"` placeholder for a document whose title had not resolved yet, on a submit that
navigated -- measured at 11/32 (34.4%) across the four populations it was seen on. `activateAndCaptureDelta`
now retries once more when the delta reads as that placeholder (`waitPastUnresolvedTitle`), and records a
new `afterUnresolved: true` field on the entry whenever `after` still reads as the placeholder once that
retry has run, so a race the retry misses is marked as not-yet-readable rather than mistaken for a real
announcement. Both changes move what a capture's evidence means, so no capture is dispatched at this code
until the bump is on main and deployed; the confirming repeat-capture round is `orchestrator`'s, per
product-manager's 2026-09-20 re-laning ruling on #1105.
