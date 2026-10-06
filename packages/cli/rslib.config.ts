import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "@rslib/core";
import { libraryPreset } from "@a11ign/toolchain/rslib-presets";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
const [library] = libraryPreset(pkg, { dir: fileURLToPath(new URL(".", import.meta.url)) }).lib;

// THE CLI IS A BUNDLE (ADR 0043, Decision 4, measured). `@a11ign/documents` (and the `pdf-lib` it brings) and `yaml` are inlined, which is why
// `package.json` lists them under `devDependencies`: `autoExternal` leaves a package's `dependencies` external and bundles the rest, and a
// consumer must not install 23 MB of `pdf-lib` for code the bundle already holds. `evidence`, `judge` and `scorer` stay external on purpose,
// because `scorer` loads its own copy of them and a second copy would be a second module state; the screen-reader fleet package and the
// optional browser packages stay external because they read files beside themselves (`import.meta.url`) or are native.
// `cli` is the `bin` and is not an `exports` key, so the preset's entries (derived from `exports`) do not name it.
// THE DECLARATIONS ARE ROLLED UP (`dts.bundle`, which needs `@microsoft/api-extractor`, a root devDependency). `report.ts` types its `pdf` field with
// `@a11ign/documents`'s `PdfFinding`, so per-module `.d.ts` files carried `import type ... from "@a11ign/documents"` into the tarball, and a consumer's
// `tsc` with `skipLibCheck` off failed with TS2307 because that package is no longer installed (measured, #3580). The rollup inlines the type instead.
// NO PERSISTENT BUILD CACHE: two `rslib build`s in one package (`npm pack` runs `prepack`, and tests pack the same package from parallel workers) PANIC on rspack's
// cache lock ("State lock mismatch ... This indicates a race condition", measured 2026-10-06: a second concurrent `npm pack` of `packages/judge` aborted in ~1 of 4
// pairs). A `prepack` build runs once from a clean checkout, so the cache bought nothing here.
const NO_BUILD_CACHE = { buildCache: false };

export default defineConfig({ performance: NO_BUILD_CACHE, lib: [{ ...library, dts: { bundle: true }, source: { entry: { ...library.source.entry, cli: "./src/cli.ts" } } }] });
