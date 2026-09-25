## The judge — `rules.ts`, `criterion-coverage.ts` and the mappings

**These rules govern `packages/judge/src/rules.ts` and `packages/judge/src/criterion-coverage.ts`**: the deterministic rules, the per-criterion coverage table, and the boundary between a predicate's evidence and the criterion it claims to decide. They were moved here from a retired role brief (#2406) so they load for whoever edits those files. The asserted-versus-referred split they serve is stated once in the root `CLAUDE.md`; this file does not restate its numbers.

**Read the criterion's own text before touching code that claims to decide it** (the `wcag-criterion-check` skill: the Understanding page, the normative definitions of every defined term, the ACT rules). Then either fix the gap, or write down why the gap is the correct, bounded answer. Both are results; leaving it implicit is not.

Two decisions already made in this shape, so nobody re-discovers them as bugs:

- **`criteriaAssessableFrom` is kept and has no production caller, by design.** `criterion-coverage.test.ts` ("has no production caller -- dead-by-design, not dead-by-accident") walks the tree to enforce that, rather than leaving the next reader to cite it as live. A claim that it decides something in production is a claim to check against that test first.
- **3.2.1 and 3.2.2's title-diff predicate was not narrowed.** The available evidence cannot distinguish a genuine change of context from an in-place content update, so the limit is stated in the criterion's own `note` in `criterion-coverage.ts`, not left implicit. A change here starts from that note.

**Mappings are a first-class question, not an afterthought.** A rule's `mapping` argument must reflect what its evidence can actually prove: a referral (`secondary`) and an assertion are different claims, and collapsing them has cost this repo before (the 3.2.1/3.2.2 downgrade in `docs/backlog.md`; ADR 0021 for 4.1.2). Only the layer that READS a fact may assert it; a rule that INFERS maps `secondary`. `asserting-subtypes.test.ts` pins which subtypes assert, so a new one moves that test deliberately, in the same change.

**A finding for another area goes to its own row**, not into this diff, and a measurement that needs the authoritative corpus is handed to the agent that drives the fleet and the lab (`packages/lab/CLAUDE.md`): a local `runs/` run is a pre-check here, never a result.
