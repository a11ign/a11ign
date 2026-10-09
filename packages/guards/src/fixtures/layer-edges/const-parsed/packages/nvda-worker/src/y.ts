import { readFileSync } from "node:fs";
import { join } from "node:path";
const ROOT = process.cwd();
// `file` is what is read and it is the layer's own file; `expect` is the other package's path, held as data to compare with.
const SITES = [{ file: "packages/nvda-worker/src/own.ts", expect: "packages/other/src/x.ts" }];

for (const { file, expect } of SITES) {
  globalThis.seen = readFileSync(join(ROOT, file), "utf8").includes(expect);
}
