---
"@a11ign/agent-org": patch
---

**`sweepDecision` refuses to arm a pull request whose review is off parity (#2195).** It gains one optional input, `parity`, taking `review-attribution.mjs`'s own three values: `violation` refuses, with a reason naming the parity owner and the reviewing session so the author can re-prompt the right reviewer, and `correct`, absent and `unobservable` arm exactly as before. #2079 was armed on `reviewer-2`'s approval at 08:45:06Z and the parity owner's refusal arrived 61 seconds later. This changes the decision function only: the sweep's own `main()` does not yet read a review or its attribution statuses, so nothing in production passes the field until a caller does.
