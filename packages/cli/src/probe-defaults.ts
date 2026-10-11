/**
 * What the CLI asks of a page it does not own, before any user flag changes it.
 *
 * Its own module, not `cli.ts`, because `cli.ts` is the `bin` and importing it runs it: `index.ts` can re-export
 * this and stay a library. Exported so the lab's `probe-consent` check compares these against its real-page
 * request body by READING them, rather than scraping this package's source (ADR 0045, Decision 1 rule 2).
 */
export const DEFAULT_PROBE_FLAGS = Object.freeze({
  // OFF here, ON in the GitHub Action, and the asymmetry is deliberate. `--probe-forms` ACTIVATES
  // controls: a submit-like button, or one your task names. A workflow runs against your own
  // application, where submitting is the intended act and an unannounced error is only reachable by
  // submitting. This CLI can be aimed at any URL on the internet, and pressing *Book* or *Send* on
  // somebody else's production site is not a review. So the risky default follows who owns the page.
  probeForms: false,
  // ON, unlike probe-forms, and the difference is side effects: Tab moves focus and activates nothing,
  // so it is safe on a page you do not own. 2.1.2 is also a NON-INTERFERENCE criterion — WCAG §5.2.5
  // applies it to all content whether or not it is relied upon — and a keyboard trap is total: a user
  // who cannot leave a control cannot use the rest of the page. It costs ~8 s per capture.
  probeFocus: true,
  // ON, on the same side of the consent line as `probeFocus` and for the same reason: following a
  // link is ordinary browsing -- the thing this tool already did to reach the page -- where
  // submitting a form writes to somebody's system. On essentially every real page the first link IS
  // the skip link, which is exactly what 2.4.1 exists to test.
  //
  // These two defaulted to ABSENT until 2026-09-02, and the cost was the shape this repo names most
  // often: a gate that does not exercise what ships. `capture-real-pages.mjs` has set both since
  // 2026-08-24, so the 86-conformant-page validation behind `addInertSkipLink`, `addStaleRouteTitle`
  // and 3.2.1 was gathered with flags THE PRODUCT COULD NOT SEND. Three criteria the README headlines
  // as unreachable by a static analyser were unreachable by this CLI too, silently, because an
  // un-asked probe returns an empty channel and an empty channel is what a clean page looks like.
  // `observed` is why that was merely invisible rather than a false pass -- it recorded `asked: false`
  // the whole time, and nothing in the product read it back to the user.
  probeNavigation: true,
  probeFocusContext: true,
  // ON as of 2026-09-05, and the FIRST probe here that presses ESCAPE on a page the user does not own.
  // The Tab half is free — `probeFocus` already walks the whole ring. Escape is the new keystroke and
  // it sits with Tab rather than with typing: it enters nothing into a field, submits nothing, and
  // writes to nobody's system; the most it can do is dismiss a dialog, which is a thing a visitor does.
  //
  // SET HERE AND IN `capture-real-pages.mjs` IN THE SAME COMMIT, because `probe-consent.test.ts`
  // requires it and its own header says what happens otherwise: those two copies drifted for nine days
  // and three criteria were validated on real pages through a path the product does not take.
  probeFocusReveal: true,
});
