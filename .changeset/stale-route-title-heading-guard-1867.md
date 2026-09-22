---
"@a11ign/judge": patch
---

**`addStaleRouteTitle` no longer reads a held-steady heading alone as "nothing navigated" (#1867).** Its
applicability guard bailed on `headingBefore === headingAfter`, which is a proxy for "the document moved"
that GOV.UK/mygov.scot pages defeat: their site-chrome heading holds steady across a real navigation even
when the title genuinely changes. The guard now also checks NVDA's own document-change confirmation
(`routeChange.navigated`, real since #1850) — a heading that changed is still evidence enough on its own,
but a heading that didn't now needs `navigated` to say a transition happened at all before the rule reaches
the title comparison. A capture with no `navigated` signal (or an unconfirmed activation) keeps the old,
conservative behavior.
