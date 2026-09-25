# CLAUDE.md — a11y-witness

## Where else to look

**THE POPULATION-SPECIFIC RULES ARE IN NESTED `CLAUDE.md` FILES (#1240)**, so a session pays only for the
directory it works in. [What moved →](docs/operational-lessons.md#the-nested-claudemd-split)

| | |
|---|---|
| [`packages/control/CLAUDE.md`](packages/control/CLAUDE.md) | the fleet: `fleet:deploy`, `fleet:provision`, Ansible, lab jobs |
| [`packages/nvda-worker/CLAUDE.md`](packages/nvda-worker/CLAUDE.md) | the worker and NVDA: `doctor`, readiness, the capture cache |
| [`packages/lab/CLAUDE.md`](packages/lab/CLAUDE.md) | the corpus: `gate:stability`, and who may report a gate reading `runs/` |
| [`.github/CLAUDE.md`](.github/CLAUDE.md) | verifying changes, the hooks, sharing this checkout |

This file is for working ON the repo: **rules only, each linking to its incident in `docs/`** (#458 cut
it from 228k chars). These came first and are not duplicated here:

| | |
|---|---|
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | the 60-second orientation, and the question that decides everything: **does your change need a Windows worker?** |
| [`SECURITY.md`](SECURITY.md) | what somebody must know before running it — `probeForms` presses buttons, the worker has no authentication |
| [`docs/README.md`](docs/README.md) | every guide and runbook, with [`docs/adr/README.md`](docs/adr/README.md) for the decision records |
| [`docs/backlog.md`](docs/backlog.md) | **The RECORD of what was found and what it cost**; [GitHub Issues](https://github.com/a11ign/a11ign/issues) answers "what is open". [Why both →](docs/operational-lessons.md#the-record-files-beside-github-issues) |
| [`docs/known-gaps.md`](docs/known-gaps.md) | **what this project does NOT do, or does not yet know.** Read it before claiming a thing is finished: **"all gates pass" and "everything is validated" are different claims** |
## What this is

a11y-witness drives a **real screen reader (NVDA)** through real navigation, **alongside** axe-core (the
rule/visual layer) rather than instead of it. See `README.md`, `PLAN.md`, `docs/adr/`.

**A finding is either ASSERTED or REFERRED, and knowing which is decided by which layer owns the subtype.**
Measured 2026-09-24 on the calibration set at protocol 21: **0 criteria asserted wrongly, 395 referred** — a reading at
a moment, so re-derive before quoting. README's claim block carries the current statement.
[The readings and the superseded 2026-08-24 figure →](docs/operational-lessons.md#what-asserted-versus-referred-was-measured-at)

| | |
|---|---|
| **rules** (`rule-ownership.json` → `decidedBy: "rules"`) | the only layer that MAY assert — but only 4 of the 18 rules-owned subtypes actually assert (`1.1.1:missing-alt`, `1.1.1:filename-alt`, `4.1.2:unnamed-control`, `4.1.2:state-change-silent`); the other fourteen map as `secondary`/`cantTell` because they INFER where the four READ directly. `asserting-subtypes.test.ts` pins both numbers, and the count has drifted three times. [Drift history →](docs/operational-lessons.md#the-asserting-subtypes-count-has-drifted-three-times) |
| **the trained scorer** (`judge-backend: local`, no rented LLM) | `findingsFromScores` sets NO `mapping`, and `RequirementMapping` defines absent as `secondary` — so every model finding becomes `cantTell`. It TRIAGES: finds the moment worth a human's attention and quotes the announcement. |

**axe-core beside the screen-reader layer (ADR 0021 + its #1342 addendum).** An axe-core `violated`
outranks the screen-reader layer's `cantTell` only — **asserted BY axe-core and attributed to it**.
**A DOM rule may override silence, not a contrary lived reading.** Pinned row by row in `outcomes.test.ts`
(`besideTheRuleLayer`). [The precedence table →](docs/operational-lessons.md#axe-core-beside-the-screen-reader-layer)
## Code conventions

The applicable subset of *Clean Code* (Martin), in two halves, enforced differently.

**Mechanical — enforced by ESLint (`npm run lint`); errors block CI:**
- Small functions doing one thing at one level of abstraction; the top-level reads as a top-down narrative (the Stepdown Rule). Gated by `max-lines-per-function` (70), `complexity` (15), `max-depth` (3).
- Few arguments, and **no boolean flag arguments** — bundle cohesive arguments into an object instead. Gated by `max-params` (4).
- **Never swallow an error** with an empty `catch {}` — record a diagnostic or rethrow with `{ cause }`. Gated by `no-empty`.
- `no-magic-numbers` is a non-blocking **warning**: name a number that is not self-explanatory (timeouts, budgets, limits); status codes and slice lengths are fine inline.

**Judgment — not machine-checkable, so honor these by hand:**
- Does the function *really* do one thing? A helper whose name restates its code is not progress.
- Comments explain **why** — intent, consequences, non-obvious domain facts (NVDA quirks, WCAG rationale). **Keep those.** Delete only comments restating what the code says.
- Intention-revealing names; rename freely when a better name appears.
- **Do NOT import the book's Java-OO machinery.** Class structure in this functional TS/MJS pipeline is over-engineering; match the surrounding style. [Why →](docs/operational-lessons.md#code-conventions--the-books-reasoning)
