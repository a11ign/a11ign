import { readFileSync } from "node:fs";
const SIBLING = "../../other/src/x.ts";
export const TEXT = readFileSync(new URL(SIBLING, import.meta.url), "utf8");
