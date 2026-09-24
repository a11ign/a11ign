---
"@a11ign/evidence": patch
---

**The capture request type names `auth`, the login a worker performs before a capture (#2359, PR 4 of 7).** `CaptureRequest.auth` is `{ login, flow?, upTo? }`: resolved flow steps whose secrets are environment-variable names, never values. A worker that predates the field ignores it and captures the login page, so a host must require `authApplied: true` in the answer.
