---
"@a11ign/agent-org": patch
---

**`prompt:session` now records an order it delivered straight to an idle session (#2500).** Only the queued path wrote a line, so an order that WAS sent read as one that never was: #2494 grepped the ledger for `reviewer-2`'s prompts, found none, and read nobody-asked from a file that was silent by construction. A direct delivery now appends `{session, sender, sentAt, prompt (first 300 characters), cleared}` to `prompt-session-direct` beside the queue, after the prompt landed. It is a separate file because a queue-shaped line would be read back by `readHandoffs` as an order still waiting and delivered again; a queued or last-moment-refused order leaves a queue entry and no direct line; and a failed append is one stderr line, never a failed delivery. The delivery tail of `main` moved into `promptOrQueue` so it can be tested with an injected `run`.
