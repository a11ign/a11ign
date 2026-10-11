# @a11ign/evidence

## 0.4.0

### Minor Changes

- 09851c2: `@a11ign/evidence` drops its `./source-text` subpath (`stripComments`): the helper lives in `@a11ign/toolchain/lib/source-text`, and `@a11ign/screenreader-fleet` 0.7.3, the last consumer of the subpath, imports it from there. A consumer of `@a11ign/evidence/source-text` imports it from the toolchain instead. `a11ign` raises its `@a11ign/screenreader-fleet` floor to `^0.7.3`, the first release that does not import the removed subpath (#4712, #4589, #4711, #4425 phase 3).

## 0.3.2

### Patch Changes

- d2912d5: `CaptureResult.formInputs` and `OracleCounts.formInputs` declare the three optional keys 3.3.7 Redundant Entry reads (#4355, #4362): `form?: number` (the owning `<form>`'s document-order index), `required?: boolean` and `populatedFromEarlier?: boolean`. Absent means not checked on each. A type-only addition; the worker census that fills them is #4361.

## 0.3.1

### Patch Changes

- 38d5ec9: `CaptureResult.formInputs` and `OracleCounts.formInputs` declare an optional `pasteCancelled?: boolean` (#4324): absent means not examined, `false` means a cancelable `paste` event was dispatched and not cancelled. A type-only addition; the worker census that fills it is #4314.

## 0.3.0

### Minor Changes

- f2e2697: `exports` and `bin` now point at `.mjs` (and `.d.ts` for types) where they pointed at `.js`, because the packages are built by Rslib instead of `tsc --build`: a deep import of `<package>/dist/<file>.js` stops resolving, and the CLI's `bin` is `./dist/cli.mjs`, so this is `minor` (a breaking change on a 0.x package) for each of the four. The CLI is also now one bundle that inlines `@a11ign/documents` (and the `pdf-lib` behind it) and `yaml`, so a consumer no longer installs them (#3580, ADR 0043).

## 0.2.0

### Minor Changes

- b721e51: **`domCensus()` now carries `headingHidden` through, not just `heading`.** #1549 split the worker's DOM heading count into `heading` (rendered) and `headingHidden` (CSS-hidden below a breakpoint, in a closed panel, `display: none`), but `domCensus()` never read the second field off the raw capture — so every consumer that wanted "how many headings does the DOM carry, reachable or not" saw only the rendered count, and a page whose headings are all hidden read `heading: 0` exactly like a page that never rendered. Absent on any capture taken before #1549, the same "cannot say" convention every other field here already follows (#1811).
- dcf4386: The first published version of `@a11ign/evidence`. Everything below landed before it: the rename first, then oldest first.
  
  - The product is renamed: formerly a11y-witness, now a11ign. The npm scope, the unscoped CLI package, the
    binary names and every cross-package import specifier change with it (issue #66). Nothing had been
    published under the old name, so this is a rename landing in the tree before the transfer to the
    `a11ign` GitHub organisation, not a migration for existing consumers.
  
  - #168: removed each package's own `"prepare": "tsc --build"`. Nothing a consumer installing the published
    package observes -- `prepare` never ran for a registry install in the first place (only `prepack`, which
    still runs `tsc --build` unchanged, ships the tarball). This only affects `npm ci` inside this monorepo:
    three packages' own `tsconfig.json` reference the same `evidence` project, so npm firing all five
    workspaces' `prepare` scripts concurrently could start several independent `tsc --build` processes writing
    to `packages/evidence/dist/*` at once -- a real file-write race, source of the intermittent `ci/ts`
    failures. The root's own `prepare` now runs `npm run build` once, coordinating the same dependency graph
    through a single `tsc --build` invocation instead.
  
  - #453: `stripComments` (`@a11ign/evidence/source-text`) no longer corrupts a template literal whose
    interpolation contains ANOTHER template literal with an odd total backtick count — a real bug, not a
    hypothetical one: it silently swallowed a whole function body (including a real `refuseUnknownFlags(`
    call) in `scripts/select-changed-tests.mjs`, and a guard reading the stripped output reported an
    already-guarded file as unguarded. `skipInterpolation` now walks a `${...}` interpolation as real code
    (nested strings, templates and comments included) so the true end of the outer literal is always found,
    regardless of what its interpolation contains. The existing, documented limitation — a comment *inside* an
    interpolation is not itself stripped — is unchanged.
  
    `@a11ign/worker-fleet` adds `command-line-census.mjs`: the tree-walk that discovers every argv-reading
    `.mjs` under this repo's known CLI roots, extracted from `cli-flags.test.ts`'s own census so a second
    consumer asking a different question about the same file population (which scripts declare a runnable
    entry-point, say) can reuse the walk without re-deriving it. `cli-flags.test.ts` itself is unchanged in
    behaviour: it now imports the walk instead of defining it locally, and its long-standing hand-typed
    `GUARDED` registry is replaced by deriving "guarded" from each file's own source (does it call
    `refuseUnknownFlags(`) — a new guarded CLI registers itself by calling the guard, with no census file to
    edit. `UNGUARDED` remains the one hand-typed list, for genuine, reasoned exemptions.
  
  - `npm run witness` now prints an early, in-flight notice within roughly a minute of capture start when a
    page looks like it is heading toward a "contained" doubt (a consent overlay Escape could not dismiss) —
    previously this warning only appeared after the whole capture finished, which could be several minutes
    later with no intervening output.
  
    The early reading uses the SAME threshold `captureDoubt`'s finished-capture verdict already applies
    (`@a11ign/evidence/verify`'s new `earlyContainmentVerdict`), read off marks the worker's `/progress`
    endpoint already reports — nothing new is recorded by a capture, and no cached evidence is affected. The
    notice is purely informational: it never changes whether or how a capture proceeds, and prints at most
    once per capture. `earlyContainmentVerdict` and its `EarlyContainmentVerdict` type are additive exports.
  
  - The conformance report now distinguishes a structural type that was **never examined** from one that was
    examined and found nothing. A sweep that ran out of time reported the same `0 of 340` as a page with no
    links, and the two need opposite responses: the first means the capture is truncated and every conclusion
    drawn from it is bounded by the same budget. A type that was examined and then ran out is reported as
    partial, which is neither of those. Existing captures without stop reasons are unaffected and continue to
    report as examined.
  
  - Fixes a real defect that produced a nonsensical, published "44 headings swept against a ground truth of 1"
    report — a capture of calendly.com whose form probe activated its own "Continue with Google" button,
    navigating to `accounts.google.com`'s sign-in screen before the browser's element census was taken. NVDA's
    sweep had genuinely read calendly's real 44 headings; the census, taken after the whole sweep at the time,
    described Google's page instead — and the report treated the census's tiny count as calendly's real total,
    printing "reached in full".
  
    Two changes:
  
    - `packages/nvda-worker/src/capture-probes.mjs`: the census is now taken before ANY probe capable of
      navigating the page (previously only before `probeRouteChange`, which missed the opportunistic form
      probe's own activation — the actual cause here). The census reads the accessibility tree over an
      already-open DevTools socket, never NVDA, so this changes WHEN a diagnostic snapshot is taken, not what
      a capture hears; `CAPTURE_PROTOCOL_VERSION` is untouched.
    - `@a11ign/evidence/conformance`: a census whose CDP target could not be confirmed (`targetMatch:
      "fallback"`) is now refused for any sweep-versus-census comparison, and the report states plainly that
      the census likely describes a different document rather than treating its count as ground truth. New
      export `censusTargetMismatchReason`; `censusFromDiagnostics` also refuses a fallback-target census.
  
  - The early consent-overlay-style notice `npm run witness` prints during a capture (added in #676) now
    reads a different, earlier diagnostic mark and no longer names "consent" specifically.
  
    `earlyContainmentVerdict` previously waited for `structureCensus`, which #426's own fleet measurement
    found lands at the very END of a capture — its timestamp equalled the total capture duration in all nine
    real captures measured, so a verdict waiting on it is never early. It now reads `pageState`'s raw DOM
    element count (recorded immediately before the structural sweep, well before a capture's later probes
    run) against the same `structural` mark as before, discriminating the identical real cases 80-90 seconds
    sooner: verified against three real captures (theregister.com and hubspot.com as positives from two
    different mechanisms, en.wikipedia.org — the slowest of the three — as a control that must not fire).
  
    The notice's own wording no longer names a consent overlay as the cause: hubspot.com fired it from an
    unrelated mechanism, so a consent-specific sentence would have been wrong on a real page that triggered
    the same, honest "reached almost none of this page" finding.
  
  - Every capture can now say WHICH document it was served, and two captures of one URL are no longer
    indistinguishable (#687).
  
    `environmentKey()` keys a capture on everything about the environment — browser, OS, architecture, NVDA,
    guidepup, screen-reader settings, the provisioning revision, the protocol version — and, for corpus
    pages, on the page directory. It recorded nothing about what the server actually sent. Measured on
    `https://calendly.com/`, two captures eight minutes apart on one worker: one was served Google's sign-in
    wall (the form probe activated "Continue with Google"), the other `calendly.com/scheduling`. Both records
    say `url: "https://calendly.com/"`.
  
    `documentIdentity()` derives that identity from marks the capture already carries — the served URL from
    the census marks, the title from `titleSource` — so **every capture already on disk has one**, including
    the two above. Nothing new is observed and no second copy is stored.
  
    - **`evidence:check` and `gate:stability` refuse rather than compare.** A pair served different documents
      is a distinct outcome (`DIFFERENT_DOCUMENT`), never a list of field differences: those differences are
      all true and all irrelevant, and they send a reader after the capture pipeline when the cause was the
      page. `summarise` excludes such a pair from the sample and reports the run inconclusive.
    - **The report says which render it describes.** WCAG Requirement 2's limitation has always read "one
      viewport, one state, one document" without ever saying which; it now names the served path, the title
      and the element counts.
    - **The document identity is NOT a cache key,** and two tests now say so with the reason. Adding it would
      invalidate 2,122+ captures to guard a population that is empty: real-page captures never cache, and the
      corpus's pages are generated into a directory the key already covers.
  
    The counts are reported and deliberately not compared: a real page recaptured an hour later has moved
    links and is the same document, so deciding identity on counts would refuse most of the population this
    runs against.
  
    The served path is origin + path, because a sign-in URL carries per-request nonces and two captures of one
    wall would otherwise differ every time. Each capture records HOW MANY query parameters were dropped —
    the count, never the values — so a "same document" verdict says where it rests on origin and path alone.
    `docs/known-gaps.md` §46 records what that costs: a site whose documents differ only by query string reads
    as one document here.
  
    One finding fell out of measuring the records rather than reasoning about them: the 10:42 capture carries
    eleven `titleSource` marks, ten saying "Sign in - Google Accounts" and the last saying "Privacy Notice
    Calendly". A capture whose own marks name two documents has no single identity, and the report now says
    so rather than silently taking the first.
  
  - The per-field activation gets its own budget, and a control it never reached is no longer reported as a
    control that said nothing (#677 part 2).
  
    `formField` is the third of eight sweeps and the only one carrying an `onItem`, and that `onItem`
    activates a control and waits for speech. Measured over three real captures, taking 180 ms/trip — what
    every other sweep type costs — as the sweep's own price and attributing the excess:
  
    | capture | fields | sweep | attributable to the activation |
    |---|---|---|---|
    | calendly, `probeForms` on | 18 | 57.2 s | 49.0 s (86%) |
    | calendly, `probeForms` off | 46 | 138.7 s | 119.3 s (86%) |
    | ikea | 100 | 322.3 s | 283.0 s (88%) |
  
    On IKEA that consumed the whole capture: `formField` stopped on `deadline` and the five sweeps after it —
    `graphic`, `link`, `list`, `frame`, `postSubmit` — each returned `deadline` having examined nothing. **Two
    structural types out of eight**, and `postSubmit` is where 3.3.1 and 4.1.3 live.
  
    The activation now stops at **half of what remains when its sweep begins**, so the sweeps after it keep at
    least as much as it takes. One number, and it is the one that moves if the fleet measurement disagrees.
    **The unit is a five-second wait, not a millisecond**: the cost divides out at 4.5–8.8 s per activation
    against `STATE_WAIT_MS` of 5,000, so a budget buys a count of waits and covers fewer controls than a
    reader would expect.
  
    Controls the budget refused are **counted and reported**. A refused control produces no `formChanges` and
    no `stateChanges` — byte-for-byte what a control that announces nothing produces — so the report now says
    `40 of 100 form control(s) were NOT ACTIVATED`, and says every control was offered when none were refused.
  
    **Also corrected: the coverage sentence was comparing unlike with unlike, and said it was not.** It
    promised "distinct announcements against DISTINCT NAMES the browser reports — like compared with like",
    but `distinct` collapses by name and an element with **no** name counts as its own. Measured: calendly
    `graphic=63, graphicUnnamed=38, distinct=61` (two collapsed); ikea `graphic=205, graphicUnnamed=0,
    distinct=165` (forty collapsed, correctly). So the reach denominator invented a shortfall in our own
    report on any page with unnamed elements.
  
    The two sentences now use two denominators, because they ask different questions:
  
    - **`NOT EXAMINED (of N)`** counts every element on the page. An unnamed graphic that was never examined
      is unexamined.
    - **`reach R/N`** counts only what a sweep could ever have announced — `distinct` minus the unnamed.
  
    A nameless element is excluded from **reach** and never from **assessment**: 1.1.1 is one of the four
    subtypes this project may assert, and its evidence is the unnamed count itself. Captures predating the raw
    census fall back to exactly what they reported before.
  
  - Every sweep now fingerprints the document it is about to walk, and the report can say **which** sweep a
    mid-run navigation happened during (#758).
  
    `documentIdentity` (#687) gives a capture one identity; `targetMatch` (#699) says whether the census
    described the requested page. Neither localises a navigation that happens *during* the run — and two
    fingerprints per capture bracket **eight** sweeps, so a capture that moved could be seen to have moved and
    not to have moved anywhere in particular.
  
    `documentChangedDuring` reads the served URL from each `pageState` mark and names every boundary the
    document changed across. On the two calendly captures already on disk:
  
    ```
    probeForms ON    sweep -> focus   calendly.com/  ->  accounts.google.com/v3/signin/identifier
    probeForms OFF   sweep -> focus   calendly.com/  ->  calendly.com/scheduling
    ```
  
    **Both arms navigated** — the "probeForms off" arm reached another calendly page, so it did not hold
    still, and only the per-sweep `found` counts (link 82 against a census of 76, versus link 5) say the ON
    arm's sweeps were the ones walking the other document. That correction came from writing the reader: the
    first version compared element counts and reported a change in both arms, which is true and useless
    because a page that lazy-loads content changes its counts without changing document. **Identity is the
    served URL, not the shape** — the same distinction #687 had to draw, one level in.
  
    `collectByType` now calls the existing `markPageState` as `sweep:<type>`, at the **one** place every sweep
    reaches the page, so `sweepEveryStructuralType`, `sweepExtraTypes` and `rescanFormFieldsAfterSubmit` are
    all covered by a single line and `probeStates` groups them for free — no new mark, no new comparator, and
    `FINGERPRINT_KEYS` still spelled once.
  
    The granularity is reported rather than assumed: with per-probe marks the answer is "between sweep and
    focus", a window containing eight sweeps; with per-sweep marks it names the sweep. Reporting the first as
    though it were the second would be invented precision.
  
    `pageState` also records `tookMs`. Its own header calls the fingerprint cheap, and this adds one per
    sweep to what is already the largest phase of a real page — so the cost of the instrument is now a number
    in the next capture rather than a claim in a comment.
  
  - The consent-overlay doubt is reported as soon as the heading sweep has a result, rather than after every
    structural sweep has finished.
  
    `earlyContainmentVerdict` read the `structural` mark, which is written only after the heading, landmark AND
    formField sweeps — and `formField` is the expensive one. Measured across the 14 most recent real captures,
    `structural` lands between 23.1s and 402.5s (the latter on a 453-second capture). The heading sweep's own
    `found` is identical to `structural.headings` on all 14, so the verdict is unchanged and only its arrival
    moves: 402.5s to 99.0s on the worst case, 238s to 85s on calendly.
  
    Additive and fallback-only: a capture with no heading-sweep mark still decides off `structural` exactly as
    before, so no cached capture is invalidated and no protocol bump is needed.
  
    #426's bar moved with this, from "inside the first minute" to "as soon as the first sweep has a result".
    The minute is unreachable at any gate — `pageState`, the denominator, does not itself land until 61-68s on
    10 of the 14 captures, because the read-through ahead of it is 81-86% of that window.
  
  - #869: `OracleCounts`/`oracleCounts()` now pass through an optional `formInputs` field (form controls'
    `autocomplete` attribute) for 1.3.5 Identify Input Purpose, mirroring `media`'s existing contract exactly.
    Absent on every capture that exists today — no worker-side census populates it yet (issue #170) — so this
    is additive only and changes nothing for an existing consumer.
  
  - `censusElementCounts` and `censusFromDiagnostics` no longer report `candidates` (a fact about how many
    CDP page targets the census's read had to choose from) as an element type. Both readers now share one
    predicate (`censusNumericCounts`) instead of two copies of the same denylist. `graphicUnnamed` and
    `graphicExempted` are unaffected — they are genuine sub-counts, not incidental leakage.
  
  - A sweep that reports reaching the end after finding far less than the page's census is no longer read as
    the page having nothing more. `Completeness` gains `"elsewhere"`, and the new `sweptElsewhere(capture)`
    returns the sweeps it applies to. It covers a link sweep that reached `exhausted` in both directions having
    announced under `LINK_SWEEP_OF_THE_PAGE_FROM` (0.54) of the census's distinct links, on a page with at
    least `LINK_CENSUS_FLOOR` (10) of them. Below that floor the rule does not judge. Something held that
    sweep: a chat widget, a consent overlay, or a cause nobody has read. This is a verdict about coverage, not
    a widget detector. A graphic sweep in the same capture follows the link verdict. The first container the
    sweep announced is reported as a hint, or `null`. `sweepCompleteness` reports the verdict,
    `captureSupports` refuses to support absence and says what held the sweep, and the new `whatHeldTheSweep`
    is the one wording both use.
  
    `@a11ign/judge` now fails closed. `assertableSweep` and the criterion outcomes treat a sweep as examined
    only when its verdict is `exact` or `unknown` (`EXAMINED_IN_FULL`). Any other verdict, including one added
    later, refuses an absence claim and withdraws a pass. Before this change, a verdict the judge did not list
    fell through to "absence allowed" and "examined in full".
  
    Nothing changes in what a capture records. A capture is never rejected for this: a keyboard-trap page
    traps its sweeps by design, and that trap is the finding. If you switch exhaustively over `Completeness`,
    add the new case.
  
  - A capture now carries `formInputs`: one `{ tag, type, autocomplete }` entry for each form control on the
    page (`input` except `type=hidden`, `select` and `textarea`). The value is read from the DOM at the same
    moment as `media`.
  
    - `autocomplete` is the **attribute** as the author wrote it, or `null` when the control has none. It is
      never the normalised property, which returns `""` for a token the browser does not recognise.
    - `null` for the whole field means the census did not run, and `[]` means the page has no form control.
    - A `formInputCensus` diagnostic mark records `count`, `total` (the list is capped at `FORM_INPUT_CAP`) and
      which document was read.
  
    This is the evidence 1.3.5's rule (`addUnidentifiedInputPurpose`) has been declared against, and it had no
    source until now. `CAPTURE_PROTOCOL_VERSION` moves from 16 to 17, because a new field that a rule and a
    signal read is that constant's trigger. Deploying it needs `--allow-protocol-change` and forces a full
    recapture.
  
    `@a11ign/evidence`'s `CaptureResult` type now names `formInputs` beside `media`, with the same contract.
  
  - The Homepage link on each package's npm page now points at the project's repository rather than at `a11ign.com`, which does not resolve. Clicking it from npm previously went nowhere; it now reaches the source, the README and the issue tracker.
  
  - **When a probe's activation takes the browser off the page's site, a11ign now ends the examination there.**
    That includes a new window or tab, or a URL on another origin. Nothing observed after that point is reported
    as the page's.
  
    **What a report says about it.** The log line reads `examination ENDED -- left the site at "<control>"`
    before the finding count. The summary leads with the same, and Conformance Requirement 2 names what was not
    examined. The JSON result carries a new top-level `leftSite` naming the control, and where the browser went
    when that is known.
  
    **Controls inside an embedded frame or object are no longer activated.** On the page the docs recommend,
    `https://www.w3.org/WAI`, the probe used to open the W3C's embedded YouTube player. Every sweep after it ran
    on youtube.com, and its one serious finding was reported against w3.org.
  
    **For the published types:** `@a11ign/evidence` exports `leftSite()` and `withinTheSite()`, and
    `CaptureInteraction` gains an optional `leftSite`. A capture made before this is still recognised from its own
    announcements ("Opening new window").
- 84c2ea2: **`addressBarHost` is now exported from `@a11ign/evidence`, as its one definition.** It reads the scheme and host NVDA's browser address bar announces, e.g. `"Address and search bar, ... selected https: slash slash www dot youtube dot com slash channel ..."` -> `"https://www.youtube.com"`, or `null` for any other announcement.
  
  - **Who imports it:** `leftSite()`'s own `spokenAddress()` helper, and the judge's 2.4.3 Tab-cycle check (`channel-comparison.ts`'s `fromDocumentEntry`, #1514), which used the address bar as the document-entry marker in a recorded Tab walk.
  - **Who used to keep a copy:** `channel-comparison.ts` kept its own copy of the pattern, pinned equal to evidence's private one by a parity test (#1514, route B) — a worktree resolves `@a11ign/evidence` to a built `dist`, so proving a new export from the judge meant rebuilding shared state at the time. #1559 ends the copy now that the export exists.
  - **The decision is unchanged:** the pattern and the scheme/host extraction are byte-identical to both the old private `SPOKEN_ADDRESS` match and the judge's former `SPOKEN_ADDRESS_BAR` copy.
- 3a8ee20: **A form submit is now recognised by what it did, not only by what the button is called (#1918).** The worker named an activation `kind: "submit"` only when the button's announced name matched a submit word, so a real `<button type="submit">` named for its task ("Apply for a berth", "Renew the licence") was recorded as `taskButton`. Every check for 3.3.1 then treated it as not a submit. On the held-out acceptance set, that hid 3 of the 14 silent-validation-error pages in each repeat.
  
  Each button activation now carries `formChanges[].submitted`: `true` when it dispatched a form `submit` event, and `false` when a listener on the page saw none. The field is absent when that could not be measured, including on every capture made before `CAPTURE_PROTOCOL_VERSION` 21. The new `isSubmitActivation` (`@a11ign/evidence`) accepts `kind: "submit"` or a measured `submitted: true`. It is now what 3.3.1's applicability (`@a11ign/judge`), the 3.3.3 remedy rule, the navigation heuristic and the scorer's `validation_error_missing` feature (`@a11ign/scorer`) all read. A task button that submitted nothing, such as a filter, is still not a submit.

### Patch Changes

- db1e46c: **A run whose form probe left the page now says it spans more than one document (#3293).** On `https://www.gov.uk/` the census was read from the home page, `probe-forms` then submitted the search form, and the one title mark was read afterwards, so the record held two pages while every identity component had a single value and the `THIS CAPTURE NAMED MORE THAN ONE DOCUMENT` sentence never fired. `documentIdentity` now also reads the `from` and `to` of `interaction.navigatedOnSubmit` as served pages: a submit that moved the document to another path makes `servedPath` unstable, so the log and the PR comment carry the sentence. A submit can only contradict a census read, never supply an identity where none was read, and a self-reload (same path, new query) changes nothing. A consumer sees a new, accurate warning on runs where the probe submitted a form that navigated; no input, option or output field changes.
- 2ba1576: **The capture request type names `auth`, the login a worker performs before a capture (#2359, PR 4 of 7).** `CaptureRequest.auth` is `{ login, flow?, upTo? }`: resolved flow steps whose secrets are environment-variable names, never values. A worker that predates the field ignores it and captures the login page, so a host must require `authApplied: true` in the answer.
- 8535de1: **Every capture's `environment` now records the CSS viewport the page was read at: `innerWidth`, `innerHeight`
  and `devicePixelRatio`.** They are read from the page after it settles and before any probe runs.
  
  **Why.** Captures launch the browser maximized with no window size, so the width is whatever each worker's display
  is. Responsive pages show different content either side of a breakpoint. Two captures of one page yielded different
  findings at different widths, and nothing recorded which width produced which evidence (#1513).
  
  **What changes.**
  - The fields are absent when the width was not measured, whether by an older worker or a read that failed. They are
    never zero.
  - A capture retried after a recoverable fault records the retry's read.
  - `/health` is unchanged.
  - The published `CaptureResult.environment` type declares all three as optional.
  
  **What does not.** The width is not part of the capture cache key, and it is not a fleet-consistency field. The
  capture protocol is unchanged, and so is the browser's command line. Pinning the window size is separate work.
- 63704c7: **The capture window is pinned to 1024x768, and the width it was pinned to is part of the capture cache
  key (#1561).** Captures launched the browser with `--start-maximized` and no window size, so the CSS width
  the page under test was read at was a property of whichever box ran the capture. Responsive pages show
  different content either side of a breakpoint: two captures of `caselaw` matched a `<768px` layout and a
  `>=992px` layout and yielded different findings (#1043), and weather.metoffice.gov.uk's CSS hides its `h1`
  below 1280px (#1522). #1513 made the width visible by recording it; this makes it the same on every guest.
  
  **What changes.**
  - Every browser now launches with `--window-size=1024,768` instead of `--start-maximized`. The two are not
    combined: Chromium's resolution of one against the other under `--app` is undocumented and was never
    measured on this fleet, and an unsettled precedence is the variable this removes.
  - `/health`'s `environment` and every `CaptureResult.environment` carry `windowSize`, the size the worker
    asks the browser for, as `"<width>x<height>"`.
  - `environmentKey` hashes `windowSize`, so a pinned capture and a maximized one cannot share a cache entry.
    An absent value reads as `"maximized"`, which is what every capture taken before this is.
  - `fleet-consistency`'s `MUST_MATCH` compares it, so a half-deployed fleet reads INCONSISTENT instead of
    blending two populations. `captureProtocol` cannot do that job here: a guest still on the pre-pin worker
    code reports the same protocol as a pinned one.
  
  **The value is 1024x768 because that is what the fleet's displays hold.** Provisioning sets one display
  mode on all ten guests (#1567) and all ten report `displayMode: 1024x768`. A Windows browser window is
  clamped to the display work area, so asking for more than the desktop holds yields the desktop; a wider pin
  is a fleet change first, not a flag change.
  
  **The cost: every cached capture misses once.** Adding a field to the cache key re-keys the whole corpus,
  and that is the intended effect rather than a side effect — evidence taken at an unpinned width is not
  evidence taken at a pinned one. There is no CDP emulation here: whether
  `Emulation.setDeviceMetricsOverride` changes what UIA or IAccessible2 report has never been measured, and
  NVDA reads the accessibility tree.
  
  **What does not change.** `CAPTURE_PROTOCOL_VERSION` is untouched — the bump that carries this meaning
  change is #1573's 18->19, which names this row. `innerWidth`/`innerHeight`/`devicePixelRatio` (#1513) stay
  recorded and unkeyed: they are what the page was actually read at, which is the outcome of the request
  rather than something a cache lookup can know in advance. `displayMode` (#1953) stays unkeyed too.
- 405583c: **Conformance requirement 1 states the run's own examined count (#3307).** It used to give the screen-reader layer's reach ("N of 55") and send the reader to `outcomes` for the split, so a report's `conformance` and `outcomes` could not be compared. `conformanceFor` now hands the criteria axe-core returned a verdict for to `conformanceScope` (new optional `ruleLayerCovered`), and requirement 1 reads "examined N of 55: M by the screen-reader layer and scorer, K further by axe-core alone". N is the non-`untested` count of `outcomes`. Without `ruleLayerCovered`, or with no rule layer, the earlier wording stands.
- 11fab84: **The worker reports the screen it captures on, and `MUST_MATCH` compares it (#1953).** `fleet:status`
  printed "fleet CONSISTENT across 10 of 10 -- these workers are interchangeable for capture" at
  2026-09-22T18:21Z over a fleet running 1024x768 on five guests and 640x480 on the other five. That was a
  uniformity claim over a property nothing checked: `MUST_MATCH` had nine fields and none was the display,
  and it could not have had one -- `/health`'s `environment` reported the browser, the screen reader, the
  OS, the architecture, the protocol, the profile, the settings and the provision stamp, and nothing about
  the screen. `provisionRevision` does not cover it: the provisioning script writes that stamp itself, so
  it records which provisioning RAN rather than what it achieved, and a guest whose display-driver install
  failed still gets the new stamp.
  
  `displayMode` is read from the worker's own process (`SystemInformation.PrimaryMonitorSize`, which is
  `GetSystemMetrics(SM_CXSCREEN/SM_CYSCREEN)`), because that is the only place it can be read honestly: a
  display call over the fleet's SSH path lands in session 0, which has no interactive window station and
  answers for no desktop (#1955), while the `a11ysrv` task runs with `logon_type: interactive_token`. It is
  not memoised -- the display changes under a running worker, and noticing that is the point.
  
  **NOT a capture-cache-key input, deliberately.** `environmentKey` is an allowlist and this field is not on
  it, so **no cached capture is invalidated and no recapture is owed**. Whether the display belongs in the
  key is a question this raises and does not answer; #1561 pins the capture WINDOW and carries its own
  protocol bump for that reason.
- b816abd: **Conformance Requirement 2 now says what each layer examines inside iframes.** Before, it said "iframes not
  entered" or "content inside iframes is not entered".
  
  That was false for both layers. The rule layer (axe-core, through `@axe-core/playwright`) examines iframe documents,
  so its findings can come from inside one: V1 rehearsals 3–5 reported three, addressed `["iframe", …]`. The screen
  reader's read-through and sweeps can pass into a frame's content.
  
  The sentence, shared by all five branches of Requirement 2, now reads:
  - **The screen-reader layer:** its read-through and sweeps can pass into a frame's content, but nothing inside a
    frame or embedded object is operated, and the page's element counts come from the top document only.
  - **The rule layer:** when it ran, it examines iframe documents too; when it did not run, the sentence says so.
  
  Nothing about what either layer examines has changed (#1438).
- aa8118a: **`CaptureInteraction` now declares the fields a capture actually writes on its change entries, and every copy of
  that shape derives from it.** `formChanges` entries declare `kind`, `baselineQuiet` and `baselineWaitedMs`, and
  `stateChanges` entries declare `afterSource` and `error`. All are optional, because older captures do not carry them.
  `kind` was already read by 3.3.1 and the submit checks through hand-written copies while the published type omitted
  it.
  
  The declarations in `@a11ign/evidence` (verify, left-site), `@a11ign/judge` (`RuleInput`, local-judge) and
  `@a11ign/scorer` (evidence units) now derive from `CaptureInteraction` instead of restating it. This is a types-only
  change: nothing reads a capture differently.
- c93c689: **When a capture left the page's site during its sweep, the probes that never ran now read NOT EXAMINED.** Before, 1.4.13
  (content on focus), 3.2.1 (on focus) and 3.2.2 (on input) read "the page exposed nothing of the kind".
  
  **Why they read that way.** `withinTheSite` named a skipped probe's channel only when its key was in the capture. The
  worker writes those probes' fields only when they ran, so a skipped probe left no key and was never named. Now every
  interaction channel of a step after the excursion is named, whether or not its key is present, and those criteria read
  `cantTell`, naming the control where the examination ended. A sweep's structure key is still named only when present:
  the worker writes every sweep's key, `[]` when it found nothing, so an absent one means the capture's code had no such
  sweep.
  
  Nothing that ran before the excursion is affected, and `withinTheSite`'s exports are unchanged (#1377).
- 5bcaec2: **The CLI text report now glosses bare sweep-stop codes and states what the Support line's number measures.** #1855's own closing blind-read named two more bare terms out of its Region and declined to widen scope to fix them: a sweep-stop code like `deadline`/`channelReset`/`focusModeStuck`, printed bare in the "Full pages" conformance-requirement sentence, and the Support line's cosine-similarity number, printed with no stated scale.
  
  `packages/evidence/src/conformance.ts`: `fullPages()`'s truncated-sweep detail string now appends one plain-language gloss per stop code (`exhausted`/`repeat` are excluded -- those mean the page ran out, not us). `packages/cli/src/report.ts`'s shared legend (`howToReadThisSection`) now states the Support number is a cosine similarity to the closest training page, from -1 to 1, with the scorer's own training pages named as a reference band. Nothing machine-readable changes -- no new field, no `--json` output change.
- 1085534: **A report's Conformance Requirement 1 now says which count it states (#3296).** When the rule layer ran, "Assessed N of 55" read as a tally of the run while being the screen-reader layer's and scorer's reach, and the limitation called every other criterion "NOT assessed … unchecked", which was false for the ones axe-core covered. It now names the figure as that layer's reach, points at the per-criterion `outcomes` for the run's own split, and no longer calls criteria the rule layer covered unchecked. A run without the rule layer reads as before.
- 276ef9b: **`sameControlAnnounced` is now exported from `@a11ign/evidence`, as its one definition.** It is the #812 check that asks whether a before/after announcement pair is about one control.
  
  - **Who imports it:** the judge's 4.1.2 rule and the lab's corpus signal both import it, instead of each keeping a copy pinned equal by a test.
  - **The decision is moved, not altered:** a pair is the same control when both sides announce the same non-empty name, whatever their roles.
  - **#1496's pairs** read the same before and after (#1498).
- edbb6ca: **The "Full pages" conformance sentence no longer claims the screen reader failed when a sweep just stopped hearing new speech.** #1873's own reviewer flagged the `silent` sweep-stop gloss (`packages/evidence/src/conformance.ts`) as a stronger, definitive claim than the producer supports: `awaitLateSpeech` retries at the same log offset specifically because late speech is not the end of the page, and only reports `silent` once nothing arrives after every retry -- the code's own comment calls this an ambiguity, not a screen-reader failure. `SWEEP_STOP_GLOSS.silent` now reads "no new speech arrived after retries, cause unknown" instead of "the screen reader stopped responding". Nothing machine-readable changes -- no new field, no `--json` output change.
- ffb874f: **A failed disclosure re-read is no longer printed as the word "null" (#1616).** When the probe's re-read after activating a disclosure control fails, the capture records the entry with `after: null` and `error` set. The published `CaptureInteraction` type now declares `stateChanges[].after` as `string | null`, and says what `null` means: the re-read failed, not that nothing was announced. The verifier's title check no longer matches the word "null" from such an entry, and the judge's prompt omits the pair instead of showing `-> "null"`.
- def6aef: `stripComments` now recognises REGEX LITERALS, so a quote character inside one is content rather than a string's opening delimiter. It had no notion of a regex, so `text.match(/message `([^`]+)`/)` opened a phantom template literal on its third backtick and scanned for a partner hundreds of lines away -- and every guard reading that file through `stripComments` saw prose where the code was, from that point to the end. Measured 2026-09-23 over all 1005 tracked `.ts`/`.mjs` files under `packages/` and `scripts/`: 100 came out still carrying real `//` comment lines, all 100 the same mechanism -- an apostrophe (40 files), a double quote (39) or a backtick (21) written inside a regex literal. Against the TypeScript parser as an oracle, agreement went from 803 of 1005 files to 952, and the 31 files the old scan had deleted real code from (a regex containing `//` read as a comment start) went to 0; the 53 that still differ all differ in the one already-documented direction, a comment inside a `${...}` interpolation. Telling a regex from a division is a heuristic on the previous token, biased so that its two errors are unequal: failing to see a regex leaves the old behaviour, and a candidate that does not close on its own line is abandoned rather than allowed to swallow code. `packages/lab/src/packaging/strip-comments-scan-sync.test.ts` holds the tree-wide reading as a standing guard (#2131).
- 0e9b234: **A document identity that read nothing no longer carries a render label (#2116).** `documentIdentity(null)`, `documentIdentity({})`, a result object and a capture wrapper one level too high all returned `digest: "811c9dc5"` — the hash of an empty string, shaped like a render id — so an identity assertion written against the wrong object passed by comparing nothing while printing what looked like a reading. `digest` is now `null` when `read` is empty, and `identitySentence` opens `No document identity was read:` instead of `Document 811c9dc5:`; the conformance limitation that splices that sentence says the same. `read`, `components`, `verdict` and the `UNCOMPARABLE` semantics are unchanged, and an identity that read a component is labelled exactly as before. The module header now tells the next test author that `fixtures/calendly-687.json` is the fixture that can fail and the `rehearsal*` result fixtures cannot answer identity.
- b53527b: **`CAPTURE_PROTOCOL_VERSION` moves 19 -> 20.** `interaction.formChanges[].after` intermittently recorded
  NVDA's `"unknown"` placeholder for a document whose title had not resolved yet, on a submit that
  navigated -- measured at 11/32 (34.4%) across the four populations it was seen on. `activateAndCaptureDelta`
  now retries once more when the delta reads as that placeholder (`waitPastUnresolvedTitle`), and records a
  new `afterUnresolved: true` field on the entry whenever `after` still reads as the placeholder once that
  retry has run, so a race the retry misses is marked as not-yet-readable rather than mistaken for a real
  announcement. Both changes move what a capture's evidence means, so no capture is dispatched at this code
  until the bump is on main and deployed; the confirming repeat-capture round is `orchestrator`'s, per
  product-manager's 2026-09-20 re-laning ruling on #1105.
  
  **`@a11ign/evidence`'s published `CaptureInteraction["formChanges"]` now declares `afterUnresolved?: boolean`**,
  the new field above -- present only when set, absent on every capture taken before this bump.
