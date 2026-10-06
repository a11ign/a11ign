import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "@rslib/core";
import { libraryPreset } from "@a11ign/toolchain/rslib-presets";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
const [library] = libraryPreset(pkg, { dir: fileURLToPath(new URL(".", import.meta.url)) }).lib;

// `src/index.ts` finds the package root with `new URL("../", import.meta.url)`, and Rslib's ESM format reads every `new URL(x, import.meta.url)`
// as an ASSET to resolve and refuses this one (`Module not found: Can't resolve '../'`). It is a RUNTIME path read, so the parser is told to leave
// `new URL(...)` alone: `dist/index.mjs` sits one level below the package root exactly as `src/index.ts` does, and the line means the same
// thing from either (the scorer's own header says so). The rule is Rslib's own, named `rslib:new-url` in 1.0.3, and it is set at RULE level, which
// outranks `module.parser`, so `tools.rspack` could not undo it. `rslib-build-packages.test.ts` resolves every path the BUILT entry reports to a
// file that exists, so a bundle that moved the file the URL is relative to, or a rename of that rule, turns it red.
const NEW_URL_RULE = "rslib:new-url";

// NO PERSISTENT BUILD CACHE: two `rslib build`s in one package (`npm pack` runs `prepack`, and tests pack the same package from parallel workers) PANIC on rspack's
// cache lock ("State lock mismatch ... This indicates a race condition", measured 2026-10-06: a second concurrent `npm pack` of `packages/judge` aborted in ~1 of 4
// pairs). A `prepack` build runs once from a clean checkout, so the cache bought nothing here.
const NO_BUILD_CACHE = { buildCache: false };

export default defineConfig({
  performance: NO_BUILD_CACHE,
  lib: [{ ...library, tools: { bundlerChain: (chain) => { chain.module.rule(NEW_URL_RULE).parser({ url: false }); } } }],
});
