---
---

The qualification decider no longer counts a `NO VERDICT` launch refusal as a failed run, so two refused launches read `wait` (and `qualification-overdue` once past the bound) instead of raising a false `regression` row (#4574). It only ever makes the decider slower to call a regression; nothing that was not `proceed` before is `proceed` now. Nothing published changes.
