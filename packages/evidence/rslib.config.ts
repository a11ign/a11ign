import { defineConfig } from "@rslib/core";

// WRITTEN OUT, NOT BUILT FROM `@a11ign/toolchain/rslib-presets`, because this package is Apache-2.0 and the toolchain is AGPL: ADR 0006 keeps the contracts
// package permissive, and `licence-boundary.test.ts` refuses a permissive package whose source names a copyleft one (it reads this file too). The config
// is the library preset (ADR 0043, Decision 4) with the entries spelled out, and `rslib-build-packages.test.ts` runs the toolchain's `entryProblems` over
// them, so an `exports` key with no entry here, or an entry no `exports` key names, turns it red: the same agreement the helper's `entriesFromExports`
// gives the other packages, checked instead of derived.
export default defineConfig({
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
    output: { target: "node", autoExternal: true, filename: { js: "[name].mjs" } },
  }],
});
