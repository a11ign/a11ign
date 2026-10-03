---
"@a11ign/lab": patch
---

**A live keyed reviewer is re-pointed after a push, as the primary's is (#2991, found in #2969).** `repointedForReviewer` read `reviewerInstanceNumber`, which is `null` for every keyed instance, so a `reviewer-agent-org-<n>` re-prompted with `prompt:session` kept its OLD tree while its verdict header named the new head: the #2771 defect, for the one repository #2969 made reviewable. It now asks `reviewerInstance` and re-points a declared key's tree from its clone into its keyed ref; an undeclared key is still returned unchanged with nothing fetched, and the primary's behaviour is byte-identical. `host.json`'s `clones` is now read by `host-config.mjs` (`HostConfig.clones`, absent when undeclared, each path refused unless absolute), so the file has one reader again.
