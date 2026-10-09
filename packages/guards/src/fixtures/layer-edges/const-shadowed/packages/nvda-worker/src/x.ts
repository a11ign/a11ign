import { readFileSync } from "node:fs";
export function inner() {
  const P = "../../other/src/x.ts";
  return readFileSync(new URL(P, import.meta.url), "utf8");
}
const P = "./own.ts";
export const own = readFileSync(new URL(P, import.meta.url), "utf8");
