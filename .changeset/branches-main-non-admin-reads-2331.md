---
"@a11ign/agent-org": patch
---

The three reads of `main`'s required status checks (`merge-guard/lookups.mjs`, `queue-table.mjs`, `work-gate.mjs`) now ask `branches/main` and take `.protection.required_status_checks`, instead of the repository-ADMIN-only `branches/main/protection[/required_status_checks]`, so no agent session needs the chairman's account for a read (#2331, #1950). `work-gate.mjs`'s `refusedProtectionDiagnosis` and `branchProtectedFlag` are deleted: the discriminator read the same endpoint the primary read now uses, so it could no longer answer anything the primary had not. The "cannot read the required checks" report stays, since `branches/main` can still be refused.
