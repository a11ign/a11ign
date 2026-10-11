const PATH = "packages/other/src/x.ts";
const LIST = ["packages/other/src/x.ts", "../../other/src/x.ts"];

/** Compares a document against a path. It names the path and never opens it. */
function mentions(doc, path) {
  return doc.includes(path);
}

/** Splits a Region body into paths. It names them and never opens one. */
function parseRegion(body) {
  return body.split("\n").filter(Boolean);
}

export const said = mentions("see packages/other/src/x.ts", PATH);
export const upper = LIST.map((entry) => entry.toUpperCase());
export const parsed = parseRegion(PATH);
