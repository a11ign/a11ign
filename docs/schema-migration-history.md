# Why each schema migration was opened, and how it closed

`packages/scorer/models/schema-migration.json` is the live TOGGLE: its presence blocks a release
(`scripts/check-schema-migration.mjs`), and closing a migration means promoting weights stamped the
pending schema and **deleting the file in the same commit** — that deletion is how `check-schema-migration`
reads "no migration open". So the file cannot be where the reasoning lives; the moment it does its job it
is gone.

This is that reasoning's permanent home, modelled on `docs/capture-protocol-version-history.md` for the
identical reason: the file that DECLARES a state (`CAPTURE_PROTOCOL_VERSION`'s current value there,
`schema-migration.json`'s presence here) is not a safe place to cite as "the whole record", because a
declaration file is designed to change or disappear. A citation to this document instead survives every
future migration, because a new `##` section is appended and nothing already here is edited or removed.

Filed as issue #340, after a citation to `schema-migration.json`'s own
`correctedBeforeTheVerdict_2026_09_05` key sent `orchestrator` to a file that had already been deleted by
the very commit that closed the migration it was reasoning about — and the missing record read identically
to a record that had never existed, producing a wrong answer about issue #35 that was relayed twice before
being corrected.

## v16 -> v17 (opened 2026-08-30, closed by `11f51f3a`)

`validation_error_missing` now requires the silent activation to be a SUBMIT. `kind` had travelled on every
`formChanges` entry since `CAPTURE_PROTOCOL_VERSION` 8 and nothing read it — not this featurizer and not
`rules.ts` — so a disclosure that announced nothing satisfied a feature about forms rejected without an
error. `capture-core` added the field after apache.org's search toggle was reported exactly that way, and
`3.3.1:validation-error-silent` is one of only three subtypes the model decides alone, so the defect
reached a report.

No recapture was needed: the field was already in the corpus. Closed by promoting weights stamped v17.

## v17 -> v18 (opened 2026-09-02, closed by `68e3ada6`)

The announcement grammar can now see a **check box** and a **menu button**. `CONTROL_ROLES` carried the
spelling "checkbox", which NVDA never produces, and was missing "check box", which it does — so
`parseAnnouncement` returned no objects at all for either control, name included, and every feature reading
`objects` was blind to them.

Found by pointing `--emit-form-config` at a W3C tutorial page, where a correctly-labelled "Subscribe to
newsletter, check box" was reported as an UNNAMED control: a false 4.1.2 against conformant markup.
Measured before bumping: 0 of 1,868 records in the export at the time changed, because the affected
announcements live only in `runs/real-page-corpus` and no synthetic case produces a checkbox. The bump was
still right — the version guards a risk the corpus at the time could not express, since the shipped model
is scored on somebody's live page and a page with a checkbox now yields a different feature vector from the
one the weights were fitted under.

Closed when the bundled recapture and retrain landed, riding with other changes rather than paying for a
second recapture. See `docs/backlog.md` for the fuller narrative at the time.

## v18 -> v19 (opened 2026-09-03, closed by `49cbfa19`)

**The observation FEATURE CROSS.** Ten structured features are `float(bool(channel))` and `any([])` is
`False`, so a `0` means both "the page has none" and "nothing looked". Measured on the authoritative
corpus: 61.7% of empty `formChanges`, 56.1% of empty `postSubmitFields` and 65.3% of the `formControl`
sweep were the second — so a head could take a free negative weight on a CAPTURE CONDITION rather than a
page fact, ADR 0015's subject.

Masking was refuted (`not-working.md`: it cost a real finding) and giving the model `observed` as its own
column was declined (the shortcut risk), so this crossed the existing fact with whether it was measured:
"asked and present" and "asked and absent" became two computed columns, and "never asked" the all-zeros row
carrying no weight of its own. A zero cannot veto, so the conjunction was computed rather than handed over
as two features.

**Corrected the same day it opened.** The first version also crossed `stateChanges`, and no capture carries
`observed['stateChanges']` — the disclosure probe is not gated on `probeForms`, so an empty channel there
means one thing and the capture declines to record a question it never had to ask. That column was
constant zero, a dead column that looks like coverage. The cross that shipped was `formChanges` (61.7%) and
`postSubmitFields` (56.1%) alone, both with real `observed` entries.

Four gates guarded the close: `scorer:shortcuts` (closable vetoes must fall, no head may gain one on a new
column), `rules:real-pages` (zero new findings on the 86 conformant pages), held-out acceptance (must not
regress), and — corrected from an earlier, structurally-blind naming of `corpus:distribution` —
`scorer:shortcuts`' own constant-column report, since a computed feature is neither an exported field nor
present where `corpus:distribution` looks.

### The correction made before the verdict, 2026-09-05 — this is the record the deleted file's citation pointed at

The `postSubmitFields` half of the cross was **withdrawn**, unconditionally, before any gate ran — decided
on the definitions, not in response to a refusal.

Two definitions of "asked" existed and disagreed. `observation-ambiguity.mjs` counted a channel as asked
whenever the form probe *ran*; the capture itself records `observed.postSubmitFields.asked` only when a
submit *happened and was re-read* — its own `why` states "probeForms ran and activated nothing, so there
was no submit to re-read after". The feature reads the capture's definition, so the 56.1% that justified
this half of the cross had measured the audit's definition, not the feature's. Measured on the 40 local
captures carrying the field: by the audit's mark, 18 asked and 10 asked-and-empty (68.8% of empties never
asked); by the capture's own record, 8 asked and **zero** asked-and-empty (100% never asked) — they
disagreed on exactly the 10 captures where the probe ran but activated nothing.

And the column was **unreachable, not merely rare**: `CASES` declared a `formState` on zero of 1,645 cases,
and the only `formState` anywhere was one real page in the `error` state — `SECURITY.md` forbids a
`success` state on a stranger's site. Nothing in the corpus could produce a submit that navigates to a
fieldless confirmation, the only path to asked-and-empty for this channel — so the withdrawal was not
conditional on any gate; the corpus settled it by construction, and a gate reading it would have measured
certainty rather than evidence.

**v19 shipped as the `formChanges` cross alone**, all four gates applying to it unchanged, and one
condition preserved: `formChanges`' own 61.7% had come from the same audit under the same mark, so it was
re-derived under the feature's own definition on the recaptured corpus before being kept, rather than
carried over on the strength of the same measurement that had just been shown wrong once.

Two follow-on rows this correction raised, for the record: a synthetic case with a SUCCESS `formState`
navigating to a fieldless confirmation (the only thing that would make asked-and-empty reachable for
`postSubmitFields`, and also the 4.1.3 success-message case the corpus lacked); and retiring
`provision.yml` from fleet use in favour of the Ansible `provision-role.yml`, since every measured
divergence between them favoured the role.

## v19 -> v20 (opened 2026-09-24, #2188)

**`generic_heading_present` now asks WCAG 2.4.6's question.** It tested a heading's STRING against a
hand-written word list; the criterion tests a heading against the content it introduces, and on the
held-out set the two gave opposite answers. `acceptance-b3-icon-help` (whose only heading is "Help", above a
button named "Open help") scored `2.4.6:regex` 0.980 and 0.870 — four false positives — while
`b3-heading-recycling` and `b3-heading-taxi`, whose vague headings "Info" and "General" were not on the list,
scored 0.086 and 0.048 against a cut of 0.605, and both declared pairs ranked the conformant page ABOVE the
vague one. No threshold classifies all three, so the feature changed rather than the cut.

The ruling (`product-manager`, 2026-09-23, read from WCAG 2.4.6, its Understanding page and ACT rule b49b2e):
declaring a co-occurring 2.4.6 failure on `icon-help` is refused because "a word, or even a single
character, may suffice" and "Help" above help content is descriptive; de-scoping the pair is refused because
it is an unintended NEGATIVE CONTROL that the model fails, and removing it would improve the number without
improving the model. What is left is a feature that relates the heading to what it introduces.

It now fires for a ONE-WORD heading at level 2 or deeper whose section never uses that word; the word list
survives only as a veto on that relation (a repeated "section" still says nothing), and "help" came off it.
Each restriction was measured: an h1 names the page and what follows it is chrome (3 conformant pages read
one-word "Archive" as vague), a phrase carries its own topic, and a heading with nothing under it has
nothing to be unrelated to.

**No recapture.** No case definition changed and features are computed Python-side at train and score time,
so the close is a retrain over the exports already on the lab and a `job=acceptance` reading over the same
stored captures.

Measured before opening, as the FEATURE's reading rather than a head score: acceptance 16 of 16 positives and
0 of 420 negatives (was 14, with 2 false positives); training export 211 of 221 positives with 4 false
positives (was 211, with 0). The four are one conformant family (`headings-none-guide`, the one-word h2
"Afterwards"), a cost the criterion leaves to a person and the reason 2.4.6 is `cantTell` and never asserted.
The ten misses on both readings are the `label-vague-*` cases: labels, not headings, which nothing reads.
