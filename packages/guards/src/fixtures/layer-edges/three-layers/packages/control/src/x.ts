import { readFileSync } from "node:fs";
export const FROM_CONTROL = readFileSync(new URL("../../lab/src/own.ts", import.meta.url), "utf8");
