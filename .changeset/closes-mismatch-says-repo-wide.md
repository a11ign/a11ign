---
"@a11ign/lab": patch
---

**The Closes check now says so when GitHub resolves no closing reference for every recent open PR (#2810).** `closes-mismatch-check.mjs` told each author their own body was wrong ("confirm #N exists ...") during a window when `closingIssuesReferences` came back empty for every PR opened. When a PR declares a number, resolves none, and the 3 newest other open PRs that declare a `Closes` (drafts included) resolve none either, the refusal now names the condition as repo-wide: do not edit the body, do not rerun, do not write `Closes: none`, the merge stays blocked, tell `product-manager`. The verdict is unchanged: the exit stays 1, and a lone mismatch, fewer than 3 siblings, an unreadable sibling lookup or an accidental closure all keep today's message byte for byte. Cost: ONE more GraphQL query, and only on a refusal whose own facts already fit.
