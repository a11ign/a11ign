#!/usr/bin/env node
// @ts-check
// command: every tracked *.test.ts file that DECLARES ITSELF a TREE-WIDE GUARD by importing and calling
// `@a11ign/toolchain/lib/tree-wide-guard`'s marker -- a guard whose population is the whole repository rather than
// one file, so its own green run on a PR's diff is not a prediction: #704. #716 measured 21 such files at
// 141.3s together and made five of them (138 of the 141) fast, so the pre-push hook can run every one of
// them with no exclusion list.
//
// IMPORT-BASED, never a grep -- ceo's ruling 2026-09-09, after a comment-aware text-grep for "ls-files"
// (this file's own first version) still counted as "a test deriving its expectations from source TEXT",
// this repo's own most-repeated defect shape. `localImports` (`@a11ign/toolchain/lib/local-import-closure`, #621/B8) parses
// real ES import statements, comment-stripped -- the same discipline that lets B8 derive a test's
// requirements from its import closure rather than scanning it for a keyword a future guard might not
// happen to spell. See the toolchain `tree-wide-guard`'s own header for why the check is IMPORT AND CALL,
// never the import alone.
//
//   node packages/guards/src/tree-wide-guards.ts                    one path per line, for `npm run guards:sweep`
import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { sandboxGitEnv } from "./git-env.ts";
import { localImports, stripComments } from "@a11ign/toolchain/lib/local-import-closure";
import { refuseUnknownFlags } from "@a11ign/screenreader-fleet/cli-flags";
import { toolRoot } from "../../../scripts/agent-org-newest-tag.ts";

/** The marker's one source since #4718: the toolchain's. It is a BARE specifier, and `localImports` resolves only relative ones, so the
 *  import is read off the comment-stripped source rather than off the resolved graph -- a test that spells the specifier in a string or a
 *  comment is not a declaration, which is why `stripComments` runs first. */
const IMPORTS_MARKER_SPECIFIER = /\b(?:from|import)\s*\(?\s*['"]@a11ign\/toolchain\/lib\/tree-wide-guard['"]/;
/** #2623 (child 5 of #69): `agent-org`'s own copy of `tree-wide-guard.mjs`, by its declared export (#4407), is a SECOND valid resolved path --
 *  a travelling guard repointed at the copy must stay discovered, exactly as it was importing the original. Both are checked, never swapped. */
export const MARKER_MODULES = [createRequire(join(toolRoot(), "package.json")).resolve("agent-org/tree-wide-guard")];
/** Imported is not used -- the same distinction `git-spawn-classification.test.ts`'s own
 *  `usesCanonicalHelper` draws for the identical reason (a canonical helper pulled in and never called). */
const CALLS_MARKER = /\bdeclareTreeWideGuard\(/;

/** @type {() => string} */
const defaultLsFiles: () => string = (): string =>
  execFileSync("git", ["ls-files", "*.test.ts"], { encoding: "utf8", env: sandboxGitEnv() });

/**
 * Every tracked `*.test.ts` file that IMPORTS the `tree-wide-guard` marker AND calls it -- a guard
 * declares its own membership; the population is a fact the tree computes from the import graph, never a
 * text pattern a guard's own source might or might not happen to contain.
 *
 * @param {{ lsFiles?: typeof defaultLsFiles, readFile?: (path: string) => string,
 *           imports?: typeof localImports }} [deps]
 * @returns {string[]}
 */
export function treeWideGuardFiles(
  { lsFiles = defaultLsFiles, readFile = (p) => readFileSync(p, "utf8"), imports = localImports }: {
        lsFiles?: typeof defaultLsFiles; readFile?: (path: string) => string;
        imports?: typeof localImports;
    } = {},
): string[] {
  const tracked = lsFiles().split("\n").filter(Boolean);
  return tracked
    .filter((path) => {
      const source = stripComments(readFile(path));
      const importsMarker = IMPORTS_MARKER_SPECIFIER.test(source) || imports(path).some((imp) => MARKER_MODULES.includes(imp));
      return importsMarker && CALLS_MARKER.test(source);
    })
    .sort();
}

if (import.meta.url === pathToFileURL(process.argv[1] ? realpathSync(process.argv[1]) : "").href) {
  refuseUnknownFlags([], { entry: import.meta.url, command: "node packages/guards/src/tree-wide-guards.ts" });
  for (const file of treeWideGuardFiles()) process.stdout.write(`${file}\n`);
}
