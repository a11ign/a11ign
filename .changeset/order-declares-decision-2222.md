---
"@a11ign/agent-org": patch
---

**A bundled `prompt:session` delivery now says which of its orders their senders declared as asking for an answer (#2222).** `prompt:session` takes `--decision` (this order asks for an answer) or `--fyi`; an order with neither is recorded as FYI and the author is told so. The declaration is written on the queue entry, the bundle header lists the declared orders by the numbers on their headings (each is also tagged `(DECISION)`), and the tick's backlog line counts them per target. `--needs-decision` remains as an alias of `--decision`. Re-sending the same words with `--decision` upgrades the queued order rather than duplicating it.
