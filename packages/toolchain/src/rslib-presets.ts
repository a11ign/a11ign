/**
 * THE RSLIB PRESETS (ADR 0043, Decision 4): what every published package's `rslib.config.ts` is made of, so no package re-types
 * the keys that were measured once. `tsc` stays the checker and never the builder.
 *
 * `libraryPreset` is Rslib's BUNDLE mode, one entry per public `exports` key (`entriesFromExports`), dependencies left
 * external, ESM to `.mjs` plus `.d.ts`. A library is anything consumed by version; the shape is the one measured in a scratch copy
 * of `@a11ign/evidence` (ADR 0043, Decision 4).
 *
 * THE RETURN TYPE IS STRUCTURAL, NOT `RslibConfig`: a `.d.ts` that imported `@rslib/core` would fail a consumer's `tsc` with
 * `skipLibCheck` off whenever the consumer is not building (`@rslib/core` is an optional peer), and the object is accepted by
 * `defineConfig` all the same.
 *
 * `autoExternal` is `output.autoExternal`: `lib.autoExternal` is deprecated in @rslib/core 1.0.3 and warns.
 *
 * `cleanDistPath: false`: Rslib empties `dist` before every build, and a `prepack` runs one whenever anything packs a package, so a reader of
 * `dist` (another test file in the suite) found a built file MISSING for the length of the build. Measured 2026-10-06 over one `rslib build` of
 * `packages/scorer` (1.97 s) with a poller reading `dist/evidence-units.mjs`: 5,735 of 239,434 reads (2.4%) found it absent; with this off, 0 of
 * about 700,000 across three builds. A build now overwrites in place. A removed entry's old file is left behind locally, and a publish builds from a clean checkout.
 */
import { entriesFromExports, type EntryOptions, type PackageExports } from "./entries.ts";

export type LibraryConfig = {
  lib: [{
    format: "esm";
    bundle: true;
    dts: true;
    source: { entry: Record<string, string> };
    output: { target: "node"; autoExternal: true; cleanDistPath: false; filename: { js: string } };
  }];
};

/** The Rslib config of a library package: `pkg` is its parsed `package.json`, `options.dir` its directory. */
export function libraryPreset(pkg: PackageExports, options: EntryOptions): LibraryConfig {
  return {
    lib: [{
      format: "esm",
      bundle: true,
      dts: true,
      source: { entry: entriesFromExports(pkg, options) },
      output: { target: "node", autoExternal: true, cleanDistPath: false, filename: { js: "[name].mjs" } },
    }],
  };
}
