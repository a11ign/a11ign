import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "@rslib/core";
import { libraryPreset } from "@a11ign/toolchain/rslib-presets";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

export default defineConfig(libraryPreset(pkg, { dir: fileURLToPath(new URL(".", import.meta.url)) }));
