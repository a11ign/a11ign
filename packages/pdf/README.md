# `@a11ign/pdf`

The PDF layer ([ADR 0036](../../docs/adr/0036-the-layer-model.md), #68). Reads a PDF's own accessibility
**tag tree** directly -- the structure a screen reader or a checker like PAC reads -- rather than
rendering the document or driving any assistive technology. No browser, no NVDA, no fleet.

```js
import { scanPdfTagTree } from "@a11ign/pdf";

const result = await scanPdfTagTree("https://example.com/report.pdf");
if (result.ok) {
  for (const finding of result.findings) {
    console.log(finding.rule, finding.wcag, finding.help);
  }
} else {
  console.error(result.error);
}
```

`looksLikePdfUrl(url)` tells a caller whether a target is this layer's to run, by extension, before
anything is fetched -- the CLI (`a11ign`) uses it to route a `.pdf` URL here instead of leasing a
screen-reader worker.

## What it checks

Three structural facts, read straight from the catalog and struct-element dictionaries with
[`pdf-lib`](https://github.com/Hopding/pdf-lib), never inferred from rendering:

| finding | WCAG | what it reads |
|---|---|---|
| `pdf-untagged` | 1.3.1 | `/MarkInfo /Marked true` and `/StructTreeRoot` are not BOTH present -- nothing in the document has a programmatically determinable structure |
| `pdf-missing-lang` | 3.1.1 | the catalog has no `/Lang` |
| `pdf-figure-no-alt` | 1.1.1 | a `Figure` struct element (walking `/StructTreeRoot`'s `/K` tree) has no `/Alt` |

`pdf-figure-no-alt` names the page, when the struct element's `/Pg` resolves to one of the document's
pages.

## Why this exists

#68's own criterion for the second layer was "which one most cheaply proves the [layer] contract wrong if
it is wrong -- not which is most useful to a user." A PDF has no DOM, no live navigation order, and
arguably not even "a page" the way the screen-reader and rule-based layers assume one. `ceo`'s ruling on
#1131 picked it over keyboard-only (tests the model least), contrast/visual (needs a rendering pipeline
this repo does not have) and cognitive (almost entirely referrals) for exactly that reason.

Reports through `Report.pdf` (`packages/cli/src/report.ts`) the same way axe-core reports through
`Report.axe` -- a new field, never a change to `@a11ign/evidence` or `@a11ign/judge`'s shape.
