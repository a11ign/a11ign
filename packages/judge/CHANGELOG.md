# @a11ign/judge

## 0.4.1

### Patch Changes

- Updated dependencies [38d5ec9]
  - @a11ign/evidence@0.3.1
  - @a11ign/scorer@0.3.1

## 0.4.0

### Minor Changes

- aed675e: 3.3.8 Accessible Authentication (Minimum) can now produce a finding: a password field whose paste event is cancelled is a REFERRED finding (`secondary`, so `cantTell`, never asserted), read from an optional `formInputs[].pasteCancelled` and silent when it is absent or false. The criterion's coverage note cites the Understanding page's own paste text and no longer cites F109, which is titled "preventing password or code re-entry in the same format" (#4259). No worker-side census populates the field on a real capture yet, so the rule has not fired on a real page.

## 0.3.0

### Minor Changes

- f2e2697: `exports` and `bin` now point at `.mjs` (and `.d.ts` for types) where they pointed at `.js`, because the packages are built by Rslib instead of `tsc --build`: a deep import of `<package>/dist/<file>.js` stops resolving, and the CLI's `bin` is `./dist/cli.mjs`, so this is `minor` (a breaking change on a 0.x package) for each of the four. The CLI is also now one bundle that inlines `@a11ign/documents` (and the `pdf-lib` behind it) and `yaml`, so a consumer no longer installs them (#3580, ADR 0043).

### Patch Changes

- Updated dependencies [f2e2697]
  - @a11ign/evidence@0.3.0
  - @a11ign/scorer@0.3.0

## 0.2.3

### Patch Changes

- be0f657: A scorer failure's reason is the END of the subprocess's stderr, not its first 400 characters. The head holds the harmless `transformers` "None of PyTorch..." import warning, so the log pointed at installing PyTorch and cut the traceback off mid-line; the tail holds the exception (#3615).

## 0.2.2

### Patch Changes

- Updated dependencies [d665b89]
  - @a11ign/scorer@0.2.1

## 0.2.1

### Patch Changes

- 95264dd: **The optional `@anthropic-ai/sdk` peer now accepts `>=0.106.0 <0.132.0`, where it accepted `>=0.106.0 <0.130.0` (#3473).** If you use the Anthropic backend you may now also install SDK 0.130.x and 0.131.x without an unmet-peer warning. No version that was supported is dropped, and `@anthropic-ai/sdk` stays optional: Codex and OpenAI-compatible users never need it. 0.130.0 and 0.131.0 were checked the way the rest of the range was, by compiling the judge's calls (`messages.stream`, `finalMessage()`, adaptive thinking, text blocks) against their type declarations; calls to the live API were not exercised at either version. 0.132.0 and later are outside the range until they are checked.

## 0.2.0

### Minor Changes

- dcf4386: The first published version of `@a11ign/judge`. Everything below landed before it: the rename first, then oldest first.
  
  - The product is renamed: formerly a11y-witness, now a11ign. The npm scope, the unscoped CLI package, the
    binary names and every cross-package import specifier change with it (issue #66). Nothing had been
    published under the old name, so this is a rename landing in the tree before the transfer to the
    `a11ign` GitHub organisation, not a migration for existing consumers.
  
  - The 2.4.2 (Page Titled) `stale-route-title` rule no longer fires on two shapes that read identically
    to a real route change under its "the first heading changed" proxy: a link announced as opening in a
    new window/tab (WCAG's own Understanding text calls this shape structurally inapplicable — activating
    it cannot change this document's title, because no navigation of this document occurred), and a
    heading announced inside a `dialog` container (a modal that just opened, or a consent overlay
    switching panels within itself). Both are read from NVDA's own announcement rather than inferred from
    page content.
  
    This rule has always mapped `secondary` (`cantTell`, a referral) — it has never asserted a conformance
    failure — so the change reduces false REFERRALS, not false assertions. A genuine stale-title route
    change is still reported exactly as before.
  
  - `CRITERION_COVERAGE["4.1.3"].status` (exported from `@a11ign/judge/internal`) changes from
    `"assessed"` to `"partial"`, with a `needs: ["screen-reader"]` field added. The criterion's note was
    already explicit that only one of its four categories (success/results of an action) is covered --
    waiting-state and progress status messages are not -- and the status field now agrees with it.
  
    This does not change what the shipped judge asserts: `assessedCriteria()` (the count of criteria that
    produce findings) is a separate, untouched export, and 4.1.3 still ships a finding exactly as before. A
    consumer reading `CRITERION_COVERAGE` directly to distinguish exact coverage from partial coverage will
    now see 4.1.3 correctly classified as the latter.
  
  - #168: removed each package's own `"prepare": "tsc --build"`. Nothing a consumer installing the published
    package observes -- `prepare` never ran for a registry install in the first place (only `prepack`, which
    still runs `tsc --build` unchanged, ships the tarball). This only affects `npm ci` inside this monorepo:
    three packages' own `tsconfig.json` reference the same `evidence` project, so npm firing all five
    workspaces' `prepare` scripts concurrently could start several independent `tsc --build` processes writing
    to `packages/evidence/dist/*` at once -- a real file-write race, source of the intermittent `ci/ts`
    failures. The root's own `prepare` now runs `npm run build` once, coordinating the same dependency graph
    through a single `tsc --build` invocation instead.
  
  - #811: fixed a bug where three or more genuinely distinct 2.4.7 focus-loss findings on the same control,
    occurring close together in time, could silently collapse into one reported finding — the evidence text
    for a repeated focusout carried no timestamp, so `ruleFindings`' own dedup treated identical-looking text
    from different real moments as the same finding. The evidence for this finding now includes the event's
    own timestamp, so a report undercounts less often. No change to any other finding's shape or count.
  
  - `action.yml`'s "the number that matters more on a REAL page" claim was hand-counted and wrong (#171):
    it said TWELVE and named only 3.3.3, 3.2.1 and 3.2.2 as exceptions to `RULE_CRITERIA`, while
    `criterion-coverage.ts` itself already declares `realPageEvidence.available: false` for two more
    rule-owned criteria — 1.4.2 (the probe runs and has simply never observed autoplaying media on a real
    capture) and 1.4.13 (the probe has not yet been turned on for real-page captures). The real count is
    ELEVEN.
  
    `coverage.ts` exports two new pure functions, `realPageUnfireableCriteria()` and
    `realPageAssessableCriteria()`, deriving the real-page-reachable set from `RULE_CRITERIA` and
    `CRITERION_COVERAGE`'s own `realPageEvidence` field rather than a hand-maintained list.
    `documented-criteria.test.ts` pins `action.yml`'s "still N" number and its except-clause against these
    derivations, so the two surfaces cannot drift apart again silently. `RELEASE.md`'s matching prose is
    corrected the same way.
  
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
  
  - The Homepage link on each package's npm page now points at the project's repository rather than at `a11ign.com`, which does not resolve. Clicking it from npm previously went nowhere; it now reaches the source, the README and the issue tracker.
- 3af2fa0: **A precedence reason now names the axe rule that violated the criterion (#1606).** Where axe-core's violation outranks or disagrees with the screen-reader layer on a criterion both cover (#1342), the reason read "axe-core reported a violation of 2.4.4". It now reads "axe-core reported link-name as a violation of 2.4.4", naming every violating rule. **Breaking for a consumer of `@a11ign/judge/outcomes`:** each `RuleLayerCoverage` entry is now `{ verdict, rules }` (the new `RuleLayerEntry` type) instead of a bare verdict string. `rules` lists the axe rule ids that violated the criterion, and is empty for a criterion that was not violated.

### Patch Changes

- e7db7fd: **The optional `@anthropic-ai/sdk` peer now accepts `>=0.106.0 <0.130.0`, where it accepted only `^0.106.0` (#3265).** If you use the Anthropic backend you may install any SDK release from 0.106.0 up to, but not including, 0.130.0 without an unmet-peer warning; before, only 0.106.x was in range, while the SDK this package is tested against had moved on to 0.129. No version that was supported is dropped, and `@anthropic-ai/sdk` stays optional: Codex and OpenAI-compatible users never need it. Every release in the range was checked by compiling the judge's calls (`messages.stream`, `finalMessage()`, adaptive thinking, text blocks) against its type declarations; calls to the live API were not exercised at each version. Nothing below 0.106.0 was checked, and 0.130.0 and later are outside the range until they are.
- 29fb2cf: **A criterion both layers cover now weighs axe-core's violation instead of ignoring it (#1342).** `criterionOutcomes` never read the rule layer for a criterion the screen-reader layer covers, so the V1 rehearsal's axe `link-name` violation reached neither 2.4.4 nor 4.1.2, and on a page whose sweeps had finished such a criterion read `passed`. Now a violation beside the screen-reader layer's `cantTell` is `failed`, asserted by axe-core; beside `passed` or `inapplicable` it is `cantTell`, a disagreement between the layers with no assessor; the screen-reader layer's own `failed` stands; and a criterion axe found no violation of keeps its screen-reader outcome. Each reason states both layers' facts.
- 643df20: **`CRITERION_COVERAGE`'s notes for 4.1.3 and 2.4.6 now say what round 15's capture (2026-09-12, #34/#1786) actually
  changed, and what it didn't.** No `status` or `channels` value changes — both stay `partial` and unwidened — but a
  consumer reading the note text directly now gets an accurate account instead of a stale one:
  
  - **4.1.3**'s note names `status-waiting` and `status-progress` (24 corpus cases each) as now corpus-covered, and
    says what is still open: the existence-of-errors category has no subtype of its own (only an overlap with 3.3.1),
    and real-page grounding remains a separate, unmet claim (`build-realism` still reports 4.1.3 as 0 of 39 real
    pages).
  - **2.4.6**'s note now explains why 10 `label-vague-*` cases sitting in the corpus since round 15 did not move
    `channels`: a case existing on disk is not a decider existing, and no `generic_label_present` feature or rule
    reads a label announcement yet.
- 8545734: **The focus-event log now records what already held focus (#2587, #2550 half 2), and `CAPTURE_PROTOCOL_VERSION` is 22.** A protocol-21 log opens on whatever the page does next, so a control that held focus first (a cookie-consent widget, on 8 of 100 protocol-21 real pages) shows as a bare `focusout` that 2.4.7's rule can only call `unpairable`. The install now pushes `document.activeElement` as the first entry, `type: "focusin"` with `initial: true`; focus on the body pushes nothing. `focusLossVerdict` reads no hold time off an `initial` entry, since its `atMs` is the install moment: its `focusout` is `clear` when focus lands on a different control inside the window and `unpairable` otherwise, and a witnessed pair asserts exactly as before. The `i === 0` carve-out stays for captures at protocol 21 and below. Deploying needs `--allow-protocol-change` and a recapture, which this change does not perform.
- ccc8f9c: **2.4.3 Focus Order no longer reports a reordering when the page's Tab order simply started part-way round.** The
  focus probe records a Tab walk that can begin past the page's first control, leave the page through the browser's own
  controls, and come back in at the start. Read as a straight line from its first stop, that walk put the page's first
  control last, and 2.4.3 fired on a page whose Tab order matches its reading order. On
  `ico.org.uk/action-weve-taken/enforcement/` it reported "Cookie options" as moved from first to last.
  
  The walk is now read from where Tab enters the document: the first page control after the browser's address bar. A
  walk with no address bar is read as before, because a control first in reading order and last in the walk may really
  be last in Tab order. A genuinely different Tab order still fires either way (#1514).
- aa8118a: **`CaptureInteraction` now declares the fields a capture actually writes on its change entries, and every copy of
  that shape derives from it.** `formChanges` entries declare `kind`, `baselineQuiet` and `baselineWaitedMs`, and
  `stateChanges` entries declare `afterSource` and `error`. All are optional, because older captures do not carry them.
  `kind` was already read by 3.3.1 and the submit checks through hand-written copies while the published type omitted
  it.
  
  The declarations in `@a11ign/evidence` (verify, left-site), `@a11ign/judge` (`RuleInput`, local-judge) and
  `@a11ign/scorer` (evidence units) now derive from `CaptureInteraction` instead of restating it. This is a types-only
  change: nothing reads a capture differently.
- 27d9f66: **`focusLossVerdict` no longer treats a bare `focusout` at `log[0]` as `unpairable` (#2602).** The exception was brought back on 2026-09-06 (#62) because the captures then on disk had no listener-witnessed first event: `rules:real-pages` read 80 findings at exactly that position, and 37 conformant pages carried the shape. Protocol 22 (#2587) records the element that already held focus as an `initial: true` entry, and #2550's reading of the protocol-22 real-page captures found `focusout`-first in 0 of 98 with a log, beside 9 `initial` entries. An orphan at index 0 is now an ordinary orphan and a `secondary` 2.4.7 finding, so it reaches `cantTell` and never `violated`.
  
  **The cost, named:** `RuleInput` carries no capture protocol, so a STORED capture at protocol 21 or below that opens on a bare `focusout` now produces a 2.4.7 finding where it produced silence. **Unchanged:** a same-id reversed pair at index 0 was already a finding and is byte-identical (pinned against the original `rules.ts`); an `initial` focusin followed by a `focusout` is still `clear` or `unpairable` by `initialHoldLossVerdict` and is never read for a hold time.
- 51cf542: **3.3.1 Error Identification no longer reads `inapplicable` when a submitted form was rejected with text the tool could not recognise.** An empty submit on `w3.org/WAI`'s search was rejected, the page stayed, and the browser's own "Please fill out this field." sat on the page, never announced. `criterionOutcomes` reported 3.3.1 as `inapplicable` ("the page exposed nothing of the kind"). That is not what happened.
  
  That shape now reads `cantTell`. The reason gives how many names were shown after the submit and how many were never spoken, and says that whether the page identified the error, including a browser's own validation message, needs a person. WCAG's Understanding 3.3.1 leaves whether native browser validation is accessibility supported to that judgement. The reason quotes no name, because which of them is the error cannot be told reliably.
  
  Error text the tool recognises, heard or not, is judged exactly as before. So is a page with no submit, or one whose submit navigated. No finding is added, and no rule changes. 4.1.3 Status Messages still reads `passed` on the page's own changes, and its reason now says a browser's own form validation message is not judged under 4.1.3 (#1519).
- b05d4b3: **1.4.13, 3.2.1 and 3.2.2 no longer read `inapplicable` when their probe never ran or checked something.** Each of these criteria is now read from its probe's own verdict (#1378):
  
  - **The probe never ran, or could not tell** (for example, the census was unavailable): `cantTell`, "not collected".
  - **The probe had nothing to act on** (nothing focusable, or no edit field): `inapplicable`, as before.
  - **The probe checked one control, one field, or a short run of tab stops and found no failure:** `cantTell`, saying one control was examined and not the page. It is never `passed`, because one control does not show that the page conforms.
  
  Previously, every one of these states read "The page exposed nothing of the kind".
- f22ae6e: Documentation-only: example commands and test fixtures now point at `a11ign/a11ign` instead of the pre-transfer `DanBeckDev/a11y-witness`, so copying them resolves to the repository's current location.
  
  - `packages/cli/README.md`'s example workflow's `uses:` line.
  - `packages/nvda-worker/src/README.md`'s `git clone` step.
  - `packages/judge/src/documented-criteria.test.ts`'s fixtures and comments, which assert the README's own snippet.
  
  No code, wire protocol, or capture behaviour changed.
- b05a296: **The job summary now shows a state change the screen reader announced correctly, as evidence observed.**
  When a disclosure control is announced `collapsed`, activated, and then announced `expanded` (or the reverse),
  the report quotes both announcements under "Evidence observed". Before this, a run could collect exactly that
  evidence and the report said nothing about it. The line never names a WCAG criterion or says anything passed: one
  control behaving correctly is not a result for the page.
  
  **`@a11ign/judge/rules` exports `announcedStateChanges(changes)`.** It lists the state-change pairs whose state
  changed, read through the same checks as the `4.1.2:state-change-silent` rule: a role whose activation is Enter,
  the same control named before and after, and an expandable state on both sides. A combo box, a pair naming two
  different controls, or a pair without an expandable state is never listed, exactly as the rule never reads it.
  The rule's own findings are unchanged.
- 276ef9b: **`sameControlAnnounced` is now exported from `@a11ign/evidence`, as its one definition.** It is the #812 check that asks whether a before/after announcement pair is about one control.
  
  - **Who imports it:** the judge's 4.1.2 rule and the lab's corpus signal both import it, instead of each keeping a copy pinned equal by a test.
  - **The decision is moved, not altered:** a pair is the same control when both sides announce the same non-empty name, whatever their roles.
  - **#1496's pairs** read the same before and after (#1498).
- a301ca0: **`SCORED_CRITERIA` now lists 1.3.5 and 1.4.2, the two criteria the v20 `training-report.json` gained (#2591).** The retrain wrote both as `modelHead: false` entries, the same shape 2.4.7 has had since v19, and the list is documented to equal the shipped report's own criteria. The weights landed without this line, so `coverage.test.ts`'s parity check failed on `main`. `RULE_CRITERIA` still says who decides, and `assessedCriteria()`, which is the union, is unchanged.
- 84c2ea2: **`addressBarHost` is now exported from `@a11ign/evidence`, as its one definition.** It reads the scheme and host NVDA's browser address bar announces, e.g. `"Address and search bar, ... selected https: slash slash www dot youtube dot com slash channel ..."` -> `"https://www.youtube.com"`, or `null` for any other announcement.
  
  - **Who imports it:** `leftSite()`'s own `spokenAddress()` helper, and the judge's 2.4.3 Tab-cycle check (`channel-comparison.ts`'s `fromDocumentEntry`, #1514), which used the address bar as the document-entry marker in a recorded Tab walk.
  - **Who used to keep a copy:** `channel-comparison.ts` kept its own copy of the pattern, pinned equal to evidence's private one by a parity test (#1514, route B) — a worktree resolves `@a11ign/evidence` to a built `dist`, so proving a new export from the judge meant rebuilding shared state at the time. #1559 ends the copy now that the export exists.
  - **The decision is unchanged:** the pattern and the scheme/host extraction are byte-identical to both the old private `SPOKEN_ADDRESS` match and the judge's former `SPOKEN_ADDRESS_BAR` copy.
- 37e540a: **`addStaleRouteTitle` no longer reads a held-steady heading alone as "nothing navigated" (#1867).** Its
  applicability guard bailed on `headingBefore === headingAfter`, which is a proxy for "the document moved"
  that GOV.UK/mygov.scot pages defeat: their site-chrome heading holds steady across a real navigation even
  when the title genuinely changes. The guard now also checks NVDA's own document-change confirmation
  (`routeChange.navigated`, real since #1850) — a heading that changed is still evidence enough on its own,
  but a heading that didn't now needs `navigated` to say a transition happened at all before the rule reaches
  the title comparison. A capture with no `navigated` signal (or an unconfirmed activation) keeps the old,
  conservative behavior.
- ffb874f: **A failed disclosure re-read is no longer printed as the word "null" (#1616).** When the probe's re-read after activating a disclosure control fails, the capture records the entry with `after: null` and `error` set. The published `CaptureInteraction` type now declares `stateChanges[].after` as `string | null`, and says what `null` means: the re-read failed, not that nothing was announced. The verifier's title check no longer matches the word "null" from such an entry, and the judge's prompt omits the pair instead of showing `-> "null"`.
- a929e85: **A not-yet-readable `formChanges.after` is never read as a real disclosure state, an announced error, or model-prompt evidence (#1105 consumer half).** `readDisclosurePair` now returns `null` when `after` carries the producer's `afterUnresolved` placeholder, so the `4.1.2:state-change-silent` gate can never mistake "not read yet" for a real announcement. `addErrorWithoutRemedy` excludes an `afterUnresolved` submit entry from the announced-error vocabulary match for the same reason, and the LLM-backend prompt builder (`formSubmitLines`) omits such an entry instead of printing it as the literal string `"unknown"`.
  
  **Round 2, the LLM-free local judge (`local-judge.ts`) had the identical gap.** `spokenText` no longer counts an `afterUnresolved` entry's `after` as something the screen reader actually said, so a genuinely silent error is not muffled by the placeholder text happening to match; the `4.1.3` evidence channel no longer treats an unresolved-only `formChanges` entry as evidence a form change occurred (the same shape `@a11ign/scorer`'s `applicability.py` closes for its own path); and `evidenceFor` never quotes an `afterUnresolved` entry as a finding's evidence text.
- af3ca61: **2.4.6's heading feature now asks whether a heading relates to the content it introduces, not whether its string is on a word list (#2188).** WCAG 2.4.6 judges a heading against the content that follows it, and the old `generic_heading_present` judged the string alone: "Help" above help content fired, while "Info" and "General" above unrelated content did not. It now fires for a one-word heading at level 2 or deeper whose section never uses that word; a heading with no content, or no announced level, reads 0. The finding is still `cantTell`, never asserted, and a vague two-word heading ("General information") is not caught by this feature.
  
  Scorer breaking change: `FEATURE_SCHEMA_VERSION` moves v19 to v20, so the shipped v19 weights cannot score under this pipeline until the retrain is promoted, and any retrain is a major (minor while 0.x). `@a11ign/judge`'s 2.4.6 coverage note carries the same reading and the ACT rule it rests on.
- 3a8ee20: **A form submit is now recognised by what it did, not only by what the button is called (#1918).** The worker named an activation `kind: "submit"` only when the button's announced name matched a submit word, so a real `<button type="submit">` named for its task ("Apply for a berth", "Renew the licence") was recorded as `taskButton`. Every check for 3.3.1 then treated it as not a submit. On the held-out acceptance set, that hid 3 of the 14 silent-validation-error pages in each repeat.
  
  Each button activation now carries `formChanges[].submitted`: `true` when it dispatched a form `submit` event, and `false` when a listener on the page saw none. The field is absent when that could not be measured, including on every capture made before `CAPTURE_PROTOCOL_VERSION` 21. The new `isSubmitActivation` (`@a11ign/evidence`) accepts `kind: "submit"` or a measured `submitted: true`. It is now what 3.3.1's applicability (`@a11ign/judge`), the 3.3.3 remedy rule, the navigation heuristic and the scorer's `validation_error_missing` feature (`@a11ign/scorer`) all read. A task button that submitted nothing, such as a filter, is still not a submit.
- Updated dependencies [db1e46c]
- Updated dependencies [2ba1576]
- Updated dependencies [8535de1]
- Updated dependencies [63704c7]
- Updated dependencies [405583c]
- Updated dependencies [11fab84]
- Updated dependencies [b721e51]
- Updated dependencies [dcf4386]
- Updated dependencies [dcf4386]
- Updated dependencies [b816abd]
- Updated dependencies [aa8118a]
- Updated dependencies [c93c689]
- Updated dependencies [c5877db]
- Updated dependencies [0d61149]
- Updated dependencies [5bcaec2]
- Updated dependencies [1085534]
- Updated dependencies [276ef9b]
- Updated dependencies [edbb6ca]
- Updated dependencies [84c2ea2]
- Updated dependencies [ffb874f]
- Updated dependencies [def6aef]
- Updated dependencies [0e9b234]
- Updated dependencies [b53527b]
- Updated dependencies [ffcd078]
- Updated dependencies [af3ca61]
- Updated dependencies [0cbb56a]
- Updated dependencies [a3aa69e]
- Updated dependencies [5f65fc8]
- Updated dependencies [4324f50]
- Updated dependencies [3a8ee20]
  - @a11ign/evidence@0.2.0
  - @a11ign/scorer@0.2.0
