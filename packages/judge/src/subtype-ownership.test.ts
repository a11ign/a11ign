/**
 * THE PROSE IN `criterion-coverage.ts` DOES NOT ENUMERATE WHO DECIDES EACH SUBTYPE, because the declaration is
 * `a11ign/lab`'s `rule-ownership.json` and prose must not restate it.
 *
 * `criterion-coverage.ts` used to enumerate "the nine subtypes the head decides alone". By 2026-08-29 that
 * sentence listed TEN, named several that had since moved to the rules — including
 * `4.1.2:state-change-silent`, which ADR 0021 moved deliberately and which the file went on citing as
 * head-owned — and omitted that two of the real three are decided by NOBODY.
 *
 * That is the fact-stated-twice defect in the file whose whole purpose is honesty about what this tool
 * covers. The prose no longer enumerates, and this reads for the four lists that went stale.
 *
 * What left with ADR 0045 cut 2 (#5080): the vocabulary of `decidedBy` and the counts of each owner read the
 * declaration through this repository's laid copy of the lab, by path, which a repository does not do to another's
 * source. They are `a11ign/lab`'s `src/product-checks/rule-ownership.test.ts`, over the declaration it holds.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("THE PROSE NO LONGER ENUMERATES, because the enumeration went stale", () => {
  // Delete a copy is this repo's first remedy for a fact stated twice, ahead of deriving or pinning.
  const source = readFileSync(resolve(import.meta.dirname, "criterion-coverage.ts"), "utf8");
  const stale = ["1.1.1:generic-alt", "1.3.1:fake-heading", "3.3.1:validation-error-silent",
    "4.1.3:form-activation-silent"];
  assert.ok(source.length > 0, "criterion-coverage.ts read as empty, so the scan below would examine nothing");
  const found = stale.filter((subtype) => source.includes(subtype));
  assert.ok(stale.length > 0,
    "#1160: if `stale` is empty this assertion passes having compared nothing -- "
    + "the control belongs on the population, not on `found`");
  assert.deepEqual(found, [],
    "criterion-coverage.ts must not list subtype owners — rule-ownership.json declares them, and the "
    + "last copy of that list named subtypes which had moved to the rules");
});
