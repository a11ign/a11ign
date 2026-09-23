---
"@a11ign/agent-org": patch
---

**The `verdict-not-convinced` profile's rationale now names BOTH recipients of the order it prices, and says which is the common one.**

**Why.** The comment and `why` justified `sonnet`/`high` as "this one WEIGHS a refusal -- does the objection stand, does the row survive it, who holds the rework". That describes a recipient the cause usually no longer has. #2001 (PR #2015) made `notConvincedOrder` address the session the PR's `session:` label names, and that prompt tells the owner the rework is theirs — disputing the verdict is explicitly the escalation back to `product-manager`, not the owner's call. So the common instance is REWORK, not adjudication, and only the unlabelled branch still weighs anything. The refusal on #1957 named a surviving mutant at a `file:line`: nothing to weigh, everything to fix correctly the first time.

**What changes.** Prose only. The comment now carries the two arguments separately — the owner reworking (the `pr-checks-failing` argument: reading a refusal and fixing what it names is debugging against an argument, and a wrong guess costs a full CI cycle) and `product-manager` weighing a refusal on an unlabelled PR (the original argument) — and records that both land on `high`, which is why the recipient split changed no setting. The `why` string, which is what `worker-profile` prints with no `--cause` and the only thing the next person tuning this table reads, states both.

**What does not.** `kind`, `model` and `effort` are untouched; so is every other profile, `profileFor`, `agentArgs` and the refusal behaviour. A rationale that names one of two recipients is how a correct setting gets changed for a wrong reason — that, and not the tier, was the defect (#2017).
