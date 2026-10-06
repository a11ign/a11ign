import { defineConfig } from "@rslib/core";

// WRITTEN OUT, NOT BUILT FROM `@a11ign/toolchain/rslib-presets`, because this package is Apache-2.0 and the toolchain is AGPL: ADR 0006 keeps the contracts
// package permissive, and `licence-boundary.test.ts` refuses a permissive package whose source names a copyleft one (it reads this file too). The config
// is the library preset (ADR 0043, Decision 4) with the entries spelled out, and `rslib-build-packages.test.ts` runs the toolchain's `entryProblems` over
// them, so an `exports` key with no entry here, or an entry no `exports` key names, turns it red: the same agreement the helper's `entriesFromExports`
// gives the other packages, checked instead of derived.
// NO PERSISTENT BUILD CACHE: two `rslib build`s in one package (`npm pack` runs `prepack`, and tests pack the same package from parallel workers) PANIC on rspack's
// cache lock ("State lock mismatch ... This indicates a race condition", measured 2026-10-06: a second concurrent `npm pack` of `packages/judge` aborted in ~1 of 4
// pairs). A `prepack` build runs once from a clean checkout, so the cache bought nothing here.
const NO_BUILD_CACHE = { buildCache: false };
// `cleanDistPath: false`: Rslib empties `dist` before every build, and a reader of `dist` in another test file found a built file missing for the length of
// the build (measured 2026-10-06 on `packages/scorer`: 2.4% of reads during one build; 0 with this off). The reason is written out in the toolchain preset.

export default defineConfig({
  performance: NO_BUILD_CACHE,
  lib: [{
    format: "esm",
    bundle: true,
    dts: true,
    source: {
      entry: {
        index: "./src/index.ts",
        verify: "./src/verify.ts",
        wcag: "./src/wcag.ts",
        "document-identity": "./src/document-identity.ts",
        conformance: "./src/conformance.ts",
        earl: "./src/earl.ts",
        "source-text": "./src/source-text.ts",
      },
    },
    output: { target: "node", autoExternal: true, cleanDistPath: false, filename: { js: "[name].mjs" } },
  }],
});
