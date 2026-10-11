/**
 * THE PRODUCT'S OWN CASES FOR THE RULES-FITNESS CHECK (#4936, epic #4425, `ceo`'s option 3).
 *
 * `rules-check.ts` runs the deterministic rules (`../rules.ts`) over one captured transcript per case and fails on any criterion the rules assert
 * on a page that conforms. It used to read its cases out of the lab's tree (`src/eval/cases.ts` in `a11ign/lab`, laid at a pinned tag), which made the
 * core's `rulesFitness` job depend on another repository's source. It reads THIS file and `./fixtures/` instead.
 *
 * WHAT MOVED IS WHAT `rules-check` OPENED, and nothing more (measured at #4936, not grepped): an `id`, a `fixture` and the criteria the rules should
 * catch. The lab's `task`, `allow`, `notes`, `groundTruth` and `notApplicableTo` are read by its judge-quality eval (`run.ts`) and stay there.
 *
 * WHAT DID NOT MOVE, and why. `contamination-fresh-page` and `fixtures/contamination-test.json` stay in the lab: the case is "authored fresh, never
 * published" so no model can have memorised it, and a copy in this tree would be a copy a model can read. Dropping it from THIS check took one
 * absence case out of both the numerator and the denominator (the lab's list expects 1.1.1 and 4.1.2 of it and the rules caught both), so
 * `rules-check` prints 8/10 where the lab's copy of the runner printed 9/11 at `47113639e` (measured, same rules, same fixtures).
 *
 * NOTHING HERE SHIPS. `@a11ign/judge`'s `files` whitelist is `dist`, `README.md` and `LICENSE`, and `fitness/` is not an entry of its build, so these
 * fixtures are in the repository and in no tarball. `rules-fitness-cases.test.ts` pins that.
 *
 * THE FIXTURES ARE ALSO THE LAB'S, so each lives in two places: `run.ts` scores the same transcripts and the lab keeps them (a copy by version from a
 * published package was ruled out above: nothing here ships). The two copies were pinned byte for byte by a test that read the lab's laid tree;
 * ADR 0045 cut 2 (#5080) deleted it, because a repository does not read another's source, so NOTHING NOW
 * PINS THE PAIR: a fixture edited on one side is not noticed on the other.
 */

/** One captured transcript the rules are run over. */
export interface RulesFitnessCase {
  id: string;
  /** Path under `./fixtures/`, `{ url, screenReader, transcript, ... }`: a RAW capture, so the oracle counts are extracted when it is read. */
  fixture: string;
  /** The criteria a reading should catch on this page. EMPTY means the page conforms, and any rule finding on it is a false positive. */
  expect: string[];
  /**
   * The page is authored and its NVDA capture has not been taken (it waits for the worker, which is the lab's). The fixture is absent, and the
   * case is DECLARED skipped: a missing fixture with no declaration fails the check rather than shrinking the population quietly.
   */
  pendingCapture?: true;
}

export const FITNESS_FIXTURES_DIR = new URL("./fixtures/", import.meta.url);

export const RULES_FITNESS_CASES: RulesFitnessCase[] = [
  { id: "w3c-bad-before", fixture: "nvda/nvda-w3c-bad-before.json", expect: ["1.1.1", "1.3.1", "2.4.4"] },
  { id: "w3c-bad-after", fixture: "nvda/nvda-w3c-bad-after-content.json", expect: [] },
  { id: "w3c-bad-before-survey", fixture: "nvda/nvda-w3c-bad-before-survey.json", expect: ["4.1.2"] },
  { id: "w3c-wai-home", fixture: "nvda/nvda-w3c-wai-home.json", expect: [] },
  { id: "tut-images-good", fixture: "tutorials/images-good.json", expect: [] },
  { id: "tut-images-bad", fixture: "tutorials/images-bad.json", expect: ["1.1.1"] },
  { id: "tut-forms-good", fixture: "tutorials/forms-good.json", expect: [] },
  { id: "tut-forms-bad", fixture: "tutorials/forms-bad.json", expect: ["4.1.2"] },
  { id: "tut-structure-good", fixture: "tutorials/structure-good.json", expect: [] },
  { id: "tut-structure-bad", fixture: "tutorials/structure-bad.json", expect: ["1.3.1"] },
  { id: "tut-tables-good", fixture: "tutorials/tables-good.json", expect: [] },
  { id: "tut-tables-bad", fixture: "tutorials/tables-bad.json", expect: ["1.3.1"] },
  { id: "tut-menus-good", fixture: "tutorials/menus-good.json", expect: [] },
  { id: "tut-menus-bad", fixture: "tutorials/menus-bad.json", expect: ["4.1.2"] },
  { id: "tut-carousels-good", fixture: "tutorials/carousels-good.json", expect: [] },
  { id: "tut-carousels-bad", fixture: "tutorials/carousels-bad.json", expect: ["4.1.2", "1.1.1"] },
  { id: "tut-disclosure-good", fixture: "tutorials/disclosure-good.json", expect: [] },
  { id: "tut-disclosure-bad", fixture: "tutorials/disclosure-bad.json", expect: ["4.1.2"] },
  { id: "tut-forms-validation-good", fixture: "tutorials/forms-validation-good.json", expect: [] },
  { id: "tut-forms-validation-bad", fixture: "tutorials/forms-validation-bad.json", expect: ["3.3.1"] },
  { id: "planted-contact-form", fixture: "planted-contact-form.json", expect: ["1.1.1", "4.1.2"] },
  { id: "book-links-good", fixture: "books/links-good.json", expect: [] },
  { id: "book-links-bad", fixture: "books/links-bad.json", expect: ["2.4.4"] },
  { id: "book-headings-good", fixture: "books/headings-good.json", expect: [] },
  { id: "book-headings-bad", fixture: "books/headings-bad.json", expect: ["2.4.6"] },
  { id: "book-alt-quality-good", fixture: "books/alt-quality-good.json", expect: [] },
  { id: "book-alt-quality-bad", fixture: "books/alt-quality-bad.json", expect: ["1.1.1"] },
  { id: "book-custom-control-good", fixture: "books/custom-control-good.json", expect: [] },
  { id: "book-custom-control-bad", fixture: "books/custom-control-bad.json", expect: ["4.1.2"] },
  { id: "book-filter-status-good", fixture: "books/filter-status-good.json", expect: [] },
  { id: "book-filter-status-bad", fixture: "books/filter-status-bad.json", expect: ["4.1.3"] },
  { id: "book-layout-table-good", fixture: "books/layout-table-good.json", expect: [], pendingCapture: true },
  { id: "book-layout-table-bad", fixture: "books/layout-table-bad.json", expect: ["1.3.1"], pendingCapture: true },
];
