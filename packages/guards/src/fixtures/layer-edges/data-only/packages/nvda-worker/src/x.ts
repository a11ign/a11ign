const REGION_BODY = "packages/other/src/x.ts\npackages/nvda-worker/src/own.ts\n";
const FIXTURE_PATHS = ["packages/other/src/x.ts", "../../other/src/x.ts"];

/** Splits a Region body into paths. It names them and never opens one. */
function parseRegion(body) {
  return body.split("\n").filter(Boolean);
}

export const parsed = parseRegion(REGION_BODY);
export const inline = parseRegion("packages/other/src/x.ts");
export const claimed = FIXTURE_PATHS.map((path) => path.toUpperCase());
