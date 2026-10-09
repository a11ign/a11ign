import { existsSync } from "node:fs";
import { join } from "node:path";
const ROOT = process.cwd();
const FILES = ["packages/other/src/x.ts"];

export const present = [];
for (const file of FILES) {
  if (existsSync(join(ROOT, file))) present.push(file);
}
