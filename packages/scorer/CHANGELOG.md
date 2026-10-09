# @a11ign/scorer

## 0.3.3

### Patch Changes

- 64b7ab0: The `a11ign-scorer-fetch-encoder` bin is built output, as ADR 0043 Decision 8 has every `bin`: `bin/fetch-encoder.mjs` (hand-written, importing `../dist/index.mjs`) is now `src/fetch-encoder.ts`, an Rslib entry that builds `dist/fetch-encoder.mjs`, and `package.json` names that file. The command does the same thing, and the tarball no longer carries a `bin/` directory. (#4275, sweep 3 of 3.) Nothing else published changes: the other converted files are `packages/cli/src/auth` fixtures and a hand-run spike, and `mjs-ratchet.baseline.json` fell from 56 files to 47 with six reasoned exceptions beside it.

## 0.3.2

### Patch Changes

- Updated dependencies [d2912d5]
  - @a11ign/evidence@0.3.2

## 0.3.1

### Patch Changes

- Updated dependencies [38d5ec9]
  - @a11ign/evidence@0.3.1

## 0.3.0

### Minor Changes

- f2e2697: `exports` and `bin` now point at `.mjs` (and `.d.ts` for types) where they pointed at `.js`, because the packages are built by Rslib instead of `tsc --build`: a deep import of `<package>/dist/<file>.js` stops resolving, and the CLI's `bin` is `./dist/cli.mjs`, so this is `minor` (a breaking change on a 0.x package) for each of the four. The CLI is also now one bundle that inlines `@a11ign/documents` (and the `pdf-lib` behind it) and `yaml`, so a consumer no longer installs them (#3580, ADR 0043).

### Patch Changes

- Updated dependencies [f2e2697]
  - @a11ign/evidence@0.3.0

## 0.2.1

### Patch Changes

- d665b89: A page whose screen-reader text contains an unpaired UTF-16 surrogate no longer fails the scorer with `TextEncodeInput must be Union[...]`. The character is replaced with U+FFFD before the text reaches the tokenizer, and a correctly paired one (an emoji) is kept.

## 0.2.0

### Minor Changes

- dcf4386: The first published version of `@a11ign/scorer`. Everything below landed before it: the rename first, then oldest first.
  
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
  
  - The Homepage link on each package's npm page now points at the project's repository rather than at `a11ign.com`, which does not resolve. Clicking it from npm previously went nowhere; it now reaches the source, the README and the issue tracker.
- 0d61149: Retrained scorer weights (`candidate`).
  
  **Minor, because no public package has reached 1.0 — the weights ARE the API all the same.** A consumer's
  build can go from passing to failing with no code change on their side. Under 0.x that ships as a minor, and
  from 1.0 every retrain is a major.
  
  Provenance, so a disputed finding can be traced to the model that produced it:
  
  - records: `3131`
  - in-distribution floor: `0.641`
  - derived floor: `0.641`
  - floor source: `training-set-minimum`
  - encoder: `53aa51172d142c89d9012cce15ae4d6cc0ca6895895114379cacb4fab128d9db`
  - feature schema: `screenreader-structured-v20`
  
  Per-subtype thresholds:
  
  - `1.1.1:filename-alt` threshold `0.47593995928764343`
  - `1.1.1:generic-alt` threshold `0.24921363592147827`
  - `1.1.1:missing-alt` threshold `0.29440420866012573`
  - `1.3.1:fake-heading` threshold `0.2815135717391968`
  - `1.3.1:no-headings` threshold `0.6153499484062195`
  - `1.3.1:unassociated-table` threshold `0.14784492552280426`
  - `1.4.13:focus-panel-undismissable` threshold `0.9634076952934265`
  - `2.1.1:control-unreachable-by-keyboard` threshold `0.9476061463356018`
  - `2.1.2:focus-trapped` threshold `0.9982160329818726`
  - `2.4.1:skip-link-inert` threshold `0.9926456809043884`
  - `2.4.2:route-title-stale` threshold `0.9887033700942993`
  - `2.4.3:focus-order-scrambled` threshold `0.9782115817070007`
  - `2.4.4:regex` threshold `0.09400103241205215`
  - `2.4.6:regex` threshold `0.5800648331642151`
  - `3.2.1:focus-context-change` threshold `0.979412853717804`
  - `3.2.2:input-context-change` threshold `0.9776179790496826`
  - `3.3.1:validation-error-silent` threshold `0.9703592658042908`
  - `3.3.3:error-remedy-missing` threshold `0.9668549299240112`
  - `4.1.2:state-change-silent` threshold `0.8793109059333801`
  - `4.1.2:unnamed-control` threshold `0.1964053362607956`
  - `4.1.3:form-activation-silent` threshold `0.8376579284667969`
  - `4.1.3:status-progress` threshold `0.8744080662727356`
  - `4.1.3:status-waiting` threshold `0.9200663566589355`
  
  Held-out acceptance: passed.
  
  **Accepted with a known regression against the previously shipped weights.** The held-out lines taken with `--accept-regression`:
  
  - 4.1.3 held-out precision 1.000 -> 0.875
  - 4.1.3 held-out recall 1.000 -> 0.609
  
  **Shipped with a silent head, by a `ceo` ruling (#2536).** These heads are silent at their operating point: the model does not detect what they exist to detect (for `4.1.3:status-waiting`, waiting-status announcements).
  
  - 4.1.3:status-waiting: SILENT — 0 of 29 positive record(s) found at threshold 0.9200663566589355. A head that reports nothing scores perfect precision, which is why this is checked apart from the false-positive bound.
- af3ca61: **2.4.6's heading feature now asks whether a heading relates to the content it introduces, not whether its string is on a word list (#2188).** WCAG 2.4.6 judges a heading against the content that follows it, and the old `generic_heading_present` judged the string alone: "Help" above help content fired, while "Info" and "General" above unrelated content did not. It now fires for a one-word heading at level 2 or deeper whose section never uses that word; a heading with no content, or no announced level, reads 0. The finding is still `cantTell`, never asserted, and a vague two-word heading ("General information") is not caught by this feature.
  
  Scorer breaking change: `FEATURE_SCHEMA_VERSION` moves v19 to v20, so the shipped v19 weights cannot score under this pipeline until the retrain is promoted, and any retrain is a major (minor while 0.x). `@a11ign/judge`'s 2.4.6 coverage note carries the same reading and the ACT rule it rests on.

### Patch Changes

- aa8118a: **`CaptureInteraction` now declares the fields a capture actually writes on its change entries, and every copy of
  that shape derives from it.** `formChanges` entries declare `kind`, `baselineQuiet` and `baselineWaitedMs`, and
  `stateChanges` entries declare `afterSource` and `error`. All are optional, because older captures do not carry them.
  `kind` was already read by 3.3.1 and the submit checks through hand-written copies while the published type omitted
  it.
  
  The declarations in `@a11ign/evidence` (verify, left-site), `@a11ign/judge` (`RuleInput`, local-judge) and
  `@a11ign/scorer` (evidence units) now derive from `CaptureInteraction` instead of restating it. This is a types-only
  change: nothing reads a capture differently.
- c5877db: `read_records` now refuses a record whose `provenance` is `null` with the named finding it always meant to give -- `record N has no grouping family` -- instead of `AttributeError: 'NoneType' object has no attribute 'get'`. `"provenance": null` is a different shape from an absent key, and the plain `get("provenance", {})` default covered only the second, so the one load point every reader shares turned its own refusal into a crash. Consumer-visible because this is the error a caller reading a malformed dataset sees: a stated contract failure naming the record, rather than a traceback from inside the featurizer (#2094).
- ffcd078: **A not-yet-readable `formChanges.after` is never turned into model evidence, either (#1105 consumer half, continued).** `evidenceUnits`'s `appendChangeUnits` (and its Python parity copy, `score.py`'s `append_changes`) now omit a `formChanges` entry entirely when the producer's `afterUnresolved` placeholder is set, so the encoder never sees NVDA's "unknown" document-title read as if it were an announcement. `structured_feature_values` reads the same filtered list (`resolved_form_changes`) for every feature built from `after`'s text or presence -- `form_change_present`, `form_change_nonempty`, `form_change_empty`, `status_update_announced`, `validation_error_announced`, and `validation_error_missing`'s silent-submit check -- and `applicability.py`'s precondition for `4.1.3:form-activation-silent` (`_measured_form_change`) no longer rules the subtype applicable on an entry nobody could yet read, the same shape `_measured_state_change` already closes for an errored disclosure probe.
  
  No `FEATURE_SCHEMA_VERSION` bump: `afterUnresolved` is written only by `capture-probes.mjs`'s CAPTURE_PROTOCOL_VERSION-20 producer (this row's own producer half, just merged), so no record at any earlier protocol can carry it -- every value this pipeline computes today is unchanged, the same "the function changed, the values on record cannot" reasoning the errored-probe fix used. Not independently confirmed against the real corpus from this checkout (no corpus data reaches this host); `orchestrator`'s post-deploy confirmation round is what verifies this against live captures.
- 0cbb56a: **`vague_link_lacks_context` (2.4.4) now recognises a bare "Click" link name, not only "Click here" (#1883).** The acceptance corpus's one two-word `vague`-link fixture (`b3-link-badge`, HTML text "Click here") announces as `"link, Click"` in NVDA's transcript on both repeat captures — confirmed against its eleven single-word siblings, which all announce and match exactly. A lone "Click" gives no more indication of a link's destination than "Here" or "Go" already in `VAGUE_LINKS`, so it joins that set.
- a3aa69e: **`3.3.1:validation-error-silent`'s precondition now needs a field with a field role, correcting the
  previous #1878 entry, whose `_has("formFields")` ruled nothing out on real captures.** NVDA's form-field
  sweep lists buttons, so `structure.formFields` is non-empty on any page with a button
  (`['Continue to dates, button']` on `status-progress-booking/bad`, `['Check consent, button']` on
  `b3-status-waiting-tree/bad`). The precondition now requires a `formFields` or `postSubmitFields` value
  matching `FORM_FIELD_ROLE` (edit, combo box, list box, checkbox, radio, spin button), still ANDed with a
  post-submit re-read. A page whose only "fields" are buttons is no longer a submitted form, and 3.3.1 no
  longer reports on it. `b3-button-market/bad`, which has a real `Reference number, edit` field, stays
  applicable. No retrain: the gate runs after scoring and touches neither `model.safetensors` nor
  `FEATURE_SCHEMA_VERSION`.
  
  Not yet checked against the corpus: `applicability-audit` and the acceptance run are tracked in #1906.
- 5f65fc8: **`3.3.1:validation-error-silent` is no longer reported when a button's outcome was never read (#1903).**
  When NVDA's re-read after an activation came back unresolved (`afterUnresolved`), #1105 correctly dropped
  that entry from the evidence, but the criterion stayed applicable. So the model scored the form as "a submit
  with no announced error" when the outcome had simply not been heard. `acceptance-b3-button-market/bad`, a page
  with no validation at all, false-positived on 3.3.1 in one repeat this way. The precondition now also
  requires that no `formChanges` entry is `afterUnresolved`. Otherwise 3.3.1 is unmeasured on that page instead
  of scored. It covers every entry, not only `kind: "submit"`, because `kind` is read from the button's name,
  and a real submit named for its task ("Apply for a berth") is recorded as `taskButton`. A read, silent
  submit, which is the true positive's shape, stays applicable. No retrain: the gate runs after scoring and
  touches neither `model.safetensors` nor `FEATURE_SCHEMA_VERSION`.
  
  Measured on the lab corpus (`with-realism` plus both acceptance repeats) with this rule: 171 labelled
  positives, 0 silenced, and `b3-button-market/bad` ruled out in repeat 2 only. The `applicability-audit` and
  `acceptance` jobs still need to confirm it.
- 4324f50: **`3.3.1:validation-error-silent`'s applicability precondition now requires an actual form field on the
  page, not just a `postSubmitFields` re-read (#1878).** `_interacted("postSubmitFields")` alone was
  satisfied by a bare `<button type="button">` re-read after any `probeForms` activation, with no `<input>`
  anywhere on the page — `waitingStatusPair`/`progressStatusPair` in `acceptance-matrix.mjs` produce exactly
  that shape. Three held-out cases false-positived on 3.3.1 as a result: `b3-status-waiting-tree`,
  `status-progress-booking`, and `b3-button-market` (an unrelated 2.1.1 case whose page also carries a real
  `<form>` submit). `validation_error_missing` already excludes them via `FORM_FIELD_ROLE`, but a linear head
  only ADDS — that 0 cannot veto whatever else in the trained weights read these pages as positive; only the
  applicability gate can. The precondition is now `_interacted("postSubmitFields") AND _has("formFields")`,
  matching `3.3.1:validation-error-silent`'s actual subject (a form was submitted) rather than the weaker "a
  `probeForms` activation was re-read". No retrain: the gate runs on top of the model's score and does not
  touch `model.safetensors` or `FEATURE_SCHEMA_VERSION`.
  
  Unverified against the authoritative corpus in this checkout — `test_no_precondition_silences_a_true_positive`
  reads `runs/`, which is not present here, and honestly skips. `npm run lab:job -- -e job=applicability-audit`
  still needs to run on the lab to confirm no `3.3.1:validation-error-silent` true positive is silenced,
  before this is treated as a settled result rather than a checkout-local fix.
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
- Updated dependencies [b816abd]
- Updated dependencies [aa8118a]
- Updated dependencies [c93c689]
- Updated dependencies [5bcaec2]
- Updated dependencies [1085534]
- Updated dependencies [276ef9b]
- Updated dependencies [edbb6ca]
- Updated dependencies [84c2ea2]
- Updated dependencies [ffb874f]
- Updated dependencies [def6aef]
- Updated dependencies [0e9b234]
- Updated dependencies [b53527b]
- Updated dependencies [3a8ee20]
  - @a11ign/evidence@0.2.0
