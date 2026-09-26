---
"@a11ign/agent-org": patch
---

**A stuck row is escalated to `ceo` with `answer:ceo`, no longer to the chairman with `needs:chairman` (#2636).** `escalateStuck` labelled every cause six deliveries did not clear `needs:chairman`, which now reads "only what the chairman alone can do (accounts, admin, money, legal)"; a row the sessions could not clear is `ceo`'s to unstick. The label is now `ESCALATION_LABEL` (`answer:ceo`), so the existing `answer-owed` cause delivers it and removing it is the act of answering; `CHAIRMAN_LABEL` is set by nobody automatically. #2462's behaviour is unchanged (a removed label stays off until the causeKey changes) and so is the outage clause. Reader side: an open row or open pull request carrying the label reaches `ceo`; a MERGED pull request (`trunkRedOrders`' subject) is read by nothing, as it was not for `needs:chairman`. `stuck-escalation-goes-to-ceo.test.ts` pins both.
