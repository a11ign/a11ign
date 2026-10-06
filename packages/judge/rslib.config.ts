import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "@rslib/core";
import { libraryPreset } from "@a11ign/toolchain/rslib-presets";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

// NO PERSISTENT BUILD CACHE: two `rslib build`s in one package (`npm pack` runs `prepack`, and tests pack the same package from parallel workers) PANIC on rspack's
// cache lock ("State lock mismatch ... This indicates a race condition", measured 2026-10-06: a second concurrent `npm pack` of `packages/judge` aborted in ~1 of 4
// pairs). A `prepack` build runs once from a clean checkout, so the cache bought nothing here.
const NO_BUILD_CACHE = { buildCache: false };
// `cleanDistPath: false` IS WRITTEN HERE, not taken from the preset: #3580 put it in the toolchain's preset (Rslib empties `dist` before every build, and a reader of
// `dist` in another test file found a built file missing for the length of one: 2.4% of reads on `packages/scorer`, 0 with this off, measured 2026-10-06), but the
// published `@a11ign/toolchain@0.1.2` was cut before that edit. Drop this line when a release carries it (`rslib-build-packages.test.ts` reads the finished config either way).
const OVERWRITE_IN_PLACE = { cleanDistPath: false };

const preset = libraryPreset(pkg, { dir: fileURLToPath(new URL(".", import.meta.url)) });

export default defineConfig({ ...preset, lib: [{ ...preset.lib[0], output: { ...preset.lib[0].output, ...OVERWRITE_IN_PLACE } }], performance: NO_BUILD_CACHE });
