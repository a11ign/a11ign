---
"@a11ign/nvda-worker": patch
---

`routeChange.navigated` is now derived from NVDA's own document-change announcement instead of always reading `true` on a successful activation, so a control that activates but never moves the document reads `false`.
