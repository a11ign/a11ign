---
"@a11ign/pdf": minor
"a11ign": minor
---

**A second layer, alongside the screen-reader and rule-based ones: `@a11ign/pdf` reads a PDF's own
accessibility tag tree (#68, ADR 0036).** Point `a11ign` at a URL ending in `.pdf` and it reads the
document's `/MarkInfo`, `/StructTreeRoot` and struct-element dictionaries directly -- no browser, no NVDA,
no fleet -- and reports whether the document is tagged at all, whether it declares a language, and whether
its `Figure` elements carry alt text. Findings appear in a new `-- PDF layer --` section of the report and
under `pdf` in `--json` output, labelled with their layer exactly as axe-core's findings already are.

This is #68's own test of the layer model ADR 0036 describes: a second, genuinely different evidence
source joining through the same `Report` shape, with no change to `@a11ign/evidence` or `@a11ign/judge`.
It held -- the PDF layer needed a new field on `a11ign`'s own `Report` type and nothing else.
