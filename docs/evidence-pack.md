# The evidence pack

An accessibility programme writing its own conformance report (an ACR, in the VPAT format) needs assistive-technology
evidence for each WCAG criterion. a11ign has that evidence in a result JSON (`outcomes`, `earl`, `transcript`). The
evidence pack is that JSON as one Markdown document an assessor can attach to the report. `renderEvidencePack(result)`
in `packages/cli/src/evidence-pack.ts` produces it.

**It is evidence, not a statement of conformance.** The README says a11ign is not a VPAT or ACR generator, and the
document says so in its first line.

## How to get it

Ask for it on the run that produces the result JSON, so the pack and the JSON describe the same capture (#4252):

```bash
npm run witness -- https://example.com --json --evidence-pack ./a11ign-evidence-pack.md > a11ign-result.json
```

`--evidence-pack <file.md>` needs `--json` and takes ONE capture: it is refused with a list of pages (`--urls`) or a
forms config that makes more than one capture, before anything is captured, and a PDF page or a failed page has no
screen-reader outcomes and writes no pack (stderr says so). A run without the flag writes none.

In the GitHub Action the `evidence-pack` output is the path of that file (empty where none is written: a `urls` list, a
`forms` config, a PDF), to upload beside `result-json`:

```yaml
path: |
  ${{ steps.a11ign.outputs.result-json }}
  ${{ steps.a11ign.outputs.evidence-pack }}
```

## What is in it

1. **A header:** the page, the date measured, the a11ign version, the screen reader and its version, the browser, the
   capture protocol, and the sentence above. A field the result did not record reads `not recorded in this result`,
   never a guess. The version is the one the result's own EARL assertor records; a result written by a build that
   did not stamp one shows `0.0.0`, which means "unstamped", not release zero.
2. **One row per criterion in `outcomes`**, in the order the result lists them (55 for the WCAG 2.2 A/AA set a11ign
   tracks): the criterion and its name, the ACT outcome, which layer decided it, and up to three NVDA announcements
   quoted from `transcript`.
   - *Decided by* is the assessor the outcome records (`axe-core`), else the screen-reader layer; `none` for `untested`.
   - A quoted announcement is a whole line of the transcript, verbatim, chosen because it announces the kind of element
     the criterion concerns (graphics for 1.1.1, links for 2.4.4, and so on). It is a pointer for the assessor to read.
     It is **not** a finding and does not mean the announcement is adequate. Criteria with no such element kind
     (colour, timing, pointer gestures) carry no quote.
   - Only `|`, `<` and `>` are escaped, so the Markdown table survives.
3. **"Not covered or not determined":** every `untested` criterion (no assessor of a11ign covers it) and every
   `cantTell` criterion (examined, not determined), each with the reason the result gives. The WCAG 2.2 additions are
   marked `(new in WCAG 2.2)`. Nothing here is a pass, and the rows keep their `untested` / `cantTell` outcome in the
   table too.

## A rendered example

Excerpt of the pack for `packages/cli/src/fixtures/rehearsal3-34774183433-a11ign-result.json` (NVDA, 2026-09-13), rows
elided with `…`. `evidence-pack.test.ts` checks every line below against what the renderer prints for that fixture.

````markdown
# a11ign evidence pack

> This is assistive-technology evidence for an assessor to use; it is not a VPAT or an ACR and it does not state conformance.

- **Page:** https://www.w3.org/WAI
- **Date measured:** 2026-09-13T18:24:19.309Z
- **a11ign version:** 0.0.0
- **Screen reader:** NVDA 2026.1.1
- **Browser:** Microsoft Edge 151.0.4129.72
- **Capture protocol:** 18

## Criteria

One row per WCAG 2.2 A/AA criterion this result records. An announcement quoted in a row is a line of the NVDA transcript about the kind of element the criterion concerns, for the assessor to read; it is not a finding.

| Criterion | Outcome | Decided by | NVDA announcements |
| --- | --- | --- | --- |
| 1.1.1 Non-text Content | passed | NVDA layer | “out of list, banner landmark, link, graphic, W 3C homepage”<br>“same page, link, graphic, Web Accessibility Initiative (WAI) homepage”<br>“button, graphic, Submit Search” |
| … | … | … | … |
| 2.4.4 Link Purpose (In Context) | cantTell | NVDA layer | “same page, link, Skip to Content, link, Change Text Size or Colors, link, All Translations”<br>“out of list, banner landmark, link, graphic, W 3C homepage”<br>“same page, link, graphic, Web Accessibility Initiative (WAI) homepage” |
| … | … | … | … |
| 2.5.7 Dragging Movements | untested | none |  |
| … | … | … | … |
| 3.3.8 Accessible Authentication (Minimum) | untested | none |  |
| … | … | … | … |

## Not covered or not determined

None of these is a pass. The assessor must evaluate them by other means.

### Untested: no assessor of a11ign covers the criterion

- **2.5.7 Dragging Movements** (new in WCAG 2.2): No assessor in this tool covers this criterion. It is unchecked, not clean.
- **3.2.6 Consistent Help** (new in WCAG 2.2): No assessor in this tool covers this criterion. It is unchecked, not clean.
- **3.3.7 Redundant Entry** (new in WCAG 2.2): No assessor in this tool covers this criterion. It is unchecked, not clean.
- **3.3.8 Accessible Authentication (Minimum)** (new in WCAG 2.2): No assessor in this tool covers this criterion. It is unchecked, not clean.
- …
````

## What an assessor may and may not claim from it

**May:**
- Cite a row's outcome as what a11ign concluded for that criterion on that page, at that date, with that screen reader
  and browser, and name the layer that decided it.
- Quote an announcement as what NVDA spoke for that page during the capture, with the transcript line verbatim.
- Cite the "Not covered" list as the criteria this run does not establish, and take them to other methods.

**May not:**
- Claim conformance, a conformance level, or "supports" in a VPAT column, from this document. It states no conformance.
- Read `passed` as "the whole criterion is met": it means content of the relevant kind was examined in full and no
  failure was found, on one page, in one viewport and one state.
- Read `cantTell` or `untested` as a pass. They are the opposite of clean.
- Read a quoted announcement as a finding, or its absence as a finding that nothing was announced.
- Generalise from one page to a site, or to other assistive technology: one screen reader, one browser, one capture.
- Rely on the WCAG 2.2 additions the "Not covered" list names: nothing here checks them.
