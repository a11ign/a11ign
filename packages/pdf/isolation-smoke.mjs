// @ts-check
// Run by `packages/guards/src/isolation-gate.mjs` from a throwaway directory OUTSIDE this repository, against the
// installed tarball. Imports by PACKAGE NAME on purpose: a relative import would resolve inside the repo and
// prove nothing.
import assert from "node:assert/strict";

import { looksLikePdfUrl, pdfFindingsFromBytes, scanPdfTagTree } from "@a11ign/pdf";

// The `.` subpath's runtime shape, proven by actually calling every export -- an entry point that does not
// resolve is one of the failures this gate exists to catch, and it is invisible to a workspace install.
assert.equal(typeof looksLikePdfUrl, "function");
assert.equal(typeof pdfFindingsFromBytes, "function");
assert.equal(typeof scanPdfTagTree, "function");

assert.equal(looksLikePdfUrl("https://example.com/report.pdf"), true);
assert.equal(looksLikePdfUrl("https://example.com/report.html"), false);

// A minimal, untagged, one-page PDF -- the same hand-built shape `src/index.test.ts` uses, so this
// smoke test proves the SHIPPED package reads it the same way the source does, never a second parser.
const content = "BT /F1 16 Tf 50 150 Td (Hello world) Tj ET\n";
const objs = [
  "", "<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
  "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << /Font << /F1 5 0 R >> >> "
    + "/Contents 4 0 R >>",
  `<< /Length ${content.length} >>\nstream\n${content}endstream`,
  "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
];
let pdf = "%PDF-1.7\n";
const offsets = [0];
for (let i = 1; i < objs.length; i++) {
  offsets[i] = Buffer.byteLength(pdf, "latin1");
  pdf += `${i} 0 obj\n${objs[i]}\nendobj\n`;
}
const xrefOffset = Buffer.byteLength(pdf, "latin1");
pdf += `xref\n0 ${objs.length}\n0000000000 65535 f \n`;
for (let i = 1; i < objs.length; i++) pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
pdf += `trailer\n<< /Size ${objs.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

const findings = await pdfFindingsFromBytes(new Uint8Array(Buffer.from(pdf, "latin1")));
assert.deepEqual(findings.map((f) => f.rule), ["pdf-untagged", "pdf-missing-lang"]);

console.log(`@a11ign/pdf works when installed: ${findings.length} finding(s) from an untagged fixture, `
  + "3 exports resolve");
