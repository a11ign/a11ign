import { readFileSync } from "node:fs";
const P = "../../other/src/x.ts";
export function harmless() {
  const P = "./own.ts";
  return readFileSync(new URL(P, import.meta.url), "utf8");
}
export const outer = readFileSync(new URL(P, import.meta.url), "utf8");
