/**
 * The PDF layer (ADR 0036, #68: "a contract with one implementation is a guess").
 *
 * Reads a PDF's own accessibility TAG TREE directly -- the same structure a screen reader or PAC
 * (PDF Accessibility Checker) reads -- rather than rendering the page or driving any assistive
 * technology. No browser, no NVDA, no fleet: `pdf-lib` parses the catalog and struct-element
 * dictionaries as plain PDF objects.
 *
 * Deliberately the furthest-from-the-incumbent candidate #68 could pick (see ceo's ruling on #1131):
 * a PDF has no DOM, no live navigation order, and arguably not even "a page" in the sense the other two
 * layers assume. It reports through `Report.pdf` (a new field, `packages/cli/src/report.ts`) exactly the
 * way axe-core reports through `Report.axe` -- nothing in `@a11ign/evidence` or `@a11ign/judge` changes
 * shape to admit it.
 */
import { PDFDict, PDFDocument, PDFHexString, PDFName, PDFArray, PDFRef, PDFString, PDFBool } from "pdf-lib";

export interface PdfFinding {
  source: "pdf-tag-tree";
  /** e.g. "pdf-untagged", "pdf-missing-lang", "pdf-figure-no-alt". */
  rule: string;
  /** WCAG success criteria this finding maps to, e.g. ["1.3.1"]. */
  wcag: string[];
  impact: "critical" | "serious";
  help: string;
  /** 1-based page number, when the finding is traceable to one page. */
  page?: number;
}

export type PdfScanResult =
  | { ok: true; findings: PdfFinding[] }
  | { ok: false; error: string };

/** `.pdf` by path, ignoring query/hash -- a content-type sniff would need the fetch this decides whether to make. */
export function looksLikePdfUrl(url: string): boolean {
  try {
    return /\.pdf$/i.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

function textOf(value: unknown): string | undefined {
  if (value instanceof PDFString || value instanceof PDFHexString) return value.decodeText();
  return undefined;
}

function resolve(context: PDFDocument["context"], value: unknown): unknown {
  return value instanceof PDFRef ? context.lookup(value) : value;
}

/** Whether the document DECLARES itself tagged: `/MarkInfo /Marked true` and a `/StructTreeRoot`. Both are
 * required by PDF/UA; a document with one but not the other is not honestly claiming to be tagged. */
function untaggedFinding(doc: PDFDocument, structTreeRootRef: unknown): PdfFinding | null {
  const markInfo = resolve(doc.context, doc.catalog.get(PDFName.of("MarkInfo")));
  const marked = markInfo instanceof PDFDict ? resolve(doc.context, markInfo.get(PDFName.of("Marked"))) : undefined;
  const isMarked = marked instanceof PDFBool && marked.asBoolean();
  if (isMarked && structTreeRootRef) return null;
  return {
    source: "pdf-tag-tree", rule: "pdf-untagged", wcag: ["1.3.1"], impact: "critical",
    help: "This PDF is not tagged (no /MarkInfo /Marked true and /StructTreeRoot together), so nothing "
      + "in it has a programmatically determinable structure -- a screen reader has no reading order, "
      + "headings or roles to work from.",
  };
}

function missingLanguageFinding(doc: PDFDocument): PdfFinding | null {
  const lang = textOf(resolve(doc.context, doc.catalog.get(PDFName.of("Lang"))));
  if (lang) return null;
  return {
    source: "pdf-tag-tree", rule: "pdf-missing-lang", wcag: ["3.1.1"], impact: "serious",
    help: "The document catalog declares no /Lang, so assistive technology cannot know which language "
      + "to read this PDF in.",
  };
}

/** 1-based index of the page a struct element's `/Pg` entry names, or undefined if unresolvable. */
function pageNumberOf(doc: PDFDocument, pageRef: unknown): number | undefined {
  if (!(pageRef instanceof PDFRef)) return undefined;
  const pages = doc.getPages();
  const index = pages.findIndex((page) => page.ref === pageRef);
  return index === -1 ? undefined : index + 1;
}

/** One `Figure` struct element with no `/Alt`, or nothing -- collects into `findings` rather than returning,
 * so the depth-first walk below stays a single loop rather than a tree of merged arrays. */
function collectFigureWithoutAlt(doc: PDFDocument, elem: PDFDict, findings: PdfFinding[]): void {
  const role = resolve(doc.context, elem.get(PDFName.of("S")));
  const roleName = role instanceof PDFName ? role.asString().replace(/^\//, "") : undefined;
  if (roleName !== "Figure") return;
  const alt = textOf(resolve(doc.context, elem.get(PDFName.of("Alt"))));
  if (alt) return;
  findings.push({
    source: "pdf-tag-tree", rule: "pdf-figure-no-alt", wcag: ["1.1.1"], impact: "critical",
    help: "A Figure in the tag tree has no /Alt, so a screen reader has nothing to announce for it.",
    page: pageNumberOf(doc, elem.get(PDFName.of("Pg"))),
  });
}

/** Depth-first walk of the struct tree from `/StructTreeRoot`, reading each `StructElem`'s `/S` (role),
 * `/Alt` and `/K` (kids) directly -- the tag tree, not the page's rendered content. */
function walkStructTree(doc: PDFDocument, node: unknown, findings: PdfFinding[]): void {
  const dict = resolve(doc.context, node);
  if (!(dict instanceof PDFDict)) return;
  collectFigureWithoutAlt(doc, dict, findings);
  const kids = resolve(doc.context, dict.get(PDFName.of("K")));
  if (kids instanceof PDFArray) {
    for (let i = 0; i < kids.size(); i++) walkStructTree(doc, kids.get(i), findings);
  } else {
    walkStructTree(doc, kids, findings);
  }
}

/**
 * The tag-tree findings for an already-loaded PDF. Pure over the bytes -- no network -- so it is the
 * testable unit: every check here is exercised against a fixture PDF built by hand, never downloaded.
 */
export async function pdfFindingsFromBytes(bytes: Uint8Array): Promise<PdfFinding[]> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const structTreeRootRef = doc.catalog.get(PDFName.of("StructTreeRoot"));
  const findings = [untaggedFinding(doc, structTreeRootRef), missingLanguageFinding(doc)]
    .filter((f): f is PdfFinding => f !== null);
  if (structTreeRootRef) walkStructTree(doc, structTreeRootRef, findings);
  return findings;
}

/** Fetch and read a PDF's tag tree. Never throws -- a fetch or parse failure comes back as `{ ok: false }`
 * so the caller can report "not run" honestly instead of the whole CLI run crashing over one layer. */
export async function scanPdfTagTree(url: string): Promise<PdfScanResult> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch (error) {
    return { ok: false, error: `could not fetch ${url}: ${String(error)}` };
  }
  if (!response.ok) {
    return { ok: false, error: `${url} returned HTTP ${response.status}` };
  }
  try {
    const bytes = new Uint8Array(await response.arrayBuffer());
    return { ok: true, findings: await pdfFindingsFromBytes(bytes) };
  } catch (error) {
    return { ok: false, error: `could not read ${url} as a PDF: ${String(error)}` };
  }
}
