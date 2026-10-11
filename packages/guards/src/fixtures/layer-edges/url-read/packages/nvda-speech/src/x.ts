import { readFileSync } from "node:fs";
export const TEXT = readFileSync(new URL("../../other/src/x.ts", import.meta.url), "utf8");
