# ADR 0043: one toolchain for every repository: TypeScript source, `tsc --noEmit` required, rstest on one shared config, Rslib builds to `.mjs` plus `.d.ts`

## Status

**Proposed, 2026-10-04.** Row #3550. The standard itself is **decided** (the chairman, relayed by `ceo`, 2026-10-04); what this ADR
adds is the shape of the shared config, the bundling mode per package type, the order of the moves, and the readings that size them.
**It changes no code in any repository:** the rows that do are the appendix.

The chairman's words (relayed to `ceo` about 21:25Z): "All tests should use rstest." If the issue is TypeScript and testing, use the
Rstack (Rslib to build libraries, Rstest to test, one Rspack transform). "All our packages that publish aren't actually bundled":
compile TypeScript to `.mjs`. "Is everything TypeScript so it is typechecked?"

**Supersedes, in part:** [ADR 0005](./0005-workspaces-build-and-linking.md) (a per-package `tsc` build is replaced by an Rslib build) and
[ADR 0031](./0031-the-worker-ships-plain-mjs-with-no-build-step.md) (the worker's next release is built, not raw source; its DEPLOY path is
the one thing this ADR does not settle, see Consequence 3). Nothing else in either is withdrawn. Their own files are outside this
row's Region, so the dated updates in them are a follow-up row (appendix, row 8); the README's index rows carry the supersession now.

**Measured on 2026-10-04**, a11ign at `787b5aa33`, agent-org at `b404507` (v0.24.1, exported with `git archive`, never run in place),
Node 22.22.1, TypeScript 6.0.3 (a11ign's pin), `@rstest/core` 0.12.3, `@rslib/core` 1.0.3, `rstack` 0.8.0 (its `rs` command). **A
reading is a moment:** every command below can be re-run, and a number quoted from here without re-running it is a quotation.
Scratch work lived outside every repository; nothing was installed into one.

## Context

**Each repository left the monorepo carrying its own toolchain, so there is no standard.** The source population, re-read from each
default branch by the GitHub tree API (every tracked file, not `packages/*/src` only):

```
$ gh api repos/a11ign/<repo>/git/trees/main?recursive=1 --jq '<count .mjs, .ts, *.test.ts, tsconfig*.json, rstest|rslib|rsbuild names>'
a11ign              380 .mjs   775 .ts (700 *.test.ts)   tsconfig: 5 package + 3 test fixtures + base + root   rs* files: 10
screenreader-worker  35 .mjs    83 .ts  (83 *.test.ts)   tsconfig: root                      rs* files: 0
screenreader-fleet   30 .mjs    55 .ts  (53 *.test.ts)   tsconfig: packages/worker-fleet     rs* files: 0
documents             3 .mjs     4 .ts   (3 *.test.ts)   tsconfig: packages/pdf + base       rs* files: 0
# in a checkout of agent-org at b404507:
$ git ls-files '*.mjs' | wc -l; git ls-files '*.ts' | wc -l; git ls-files '*.test.ts' | wc -l; git ls-files '*.test.mjs' | wc -l; git ls-files 'tsconfig*.json' | wc -l
244
232
226
41
0
$ git grep -l '@ts-check' -- '*.mjs' | wc -l
217
```

**These differ from the table the chairman's message carried** (a11ign "293 `.mjs` + 72 `.ts`"): the message does not say how it counted, and
this reading counts the whole tree. The columns this ADR did not re-read (how each repository's tests run and what it publishes) are carried
as relayed: agent-org `node --test` + `tsx`, git tag; screenreader-worker `tsx --test`, 0.1.0 shipped raw `src/*.mjs` with no build and no `.d.ts`; documents
`tsx --test`, `tsc --build` output; screenreader-fleet "not rstest", unpublished.

**agent-org is the outlier, and the worst case.** It has no tracked `tsconfig*.json` (above), `tsc` is in neither `package.json` scripts nor
`.github` (`ceo`'s reading, 2026-10-04T21:03Z), and `typescript` is a devDependency and a peerDependency that is never run. So 217
`@ts-check` comments are comments, and its 226 TypeScript tests are unchecked too. Its 267 test files all import `node:test`.

**a11ign's own CLI is not bundled**: `packages/cli`'s `prepack` is `tsc --build`, `scripts/build-packages.mjs` (54 lines) runs `tsc --build` over
every package, and each package's `dist` is one `.js` per source file.

## Decision

Six decisions. Each carries its reading and the row that makes it true.

### DECISION 1: TypeScript source in every repository, converted when a file is touched or moved

**Decision:** new source is `.ts`. An existing `.mjs` becomes `.ts` in the pull request that touches or moves it, never in a big-bang
rewrite. A per-repository count of tracked `.mjs` files may only go down (the ratchet is row 4d, #3556). A file may stay `.mjs` while it is
on that count; nothing is exempt for good.

**How JSDoc types become TypeScript, so the conversion is mechanical.** Every row but the last four was exercised on the worked example below;
the last four are standard TypeScript and are listed because a converter meets them, **not exercised here**.

| in a `// @ts-check` `.mjs` | in the `.ts` |
|---|---|
| `// @ts-check` | deleted: a `.ts` file is always checked |
| `/** @typedef {import("./x.mjs").T} T */` | `import type { T } from "./x.mjs";` (a typedef in a `.mjs` is importable as a type) |
| `/** @param {T} x */` and `@returns {R}` | `x: T` and `: R` inline; the prose after the tag stays as a TSDoc description |
| `@param {{ a: string, b?: number }} input` with per-property prose | an inline object type, each property's prose a `/** */` on the property |
| `@param {T} [x]` | `x?: T` |
| `@type {T}` on a `const` | `const x: T = ...` |
| `/** @typedef {{ a: string }} T */` declared in the file | `type T = { a: string };`, `export`ed if another file imports it |
| `@template T` | `<T>` after the name |
| `/** @type {T} */ (expr)` cast | `expr as T`, or `satisfies T` where the value must stay narrow |
| `@callback`, `@property` | a function type; members of the object type |
| the importers' `./x.mjs` | `./x.ts` (`allowImportingTsExtensions`, with `noEmit`: the build is Rslib's, which bundles and rewrites nothing) |

**The worked example is one real agent-org file, converted and type-checked:** `src/messaging/sources/watched.mjs` (50 lines, `@ts-check`,
one `@typedef`, two JSDoc signatures) became `watched.ts`. The prose comments and the code body are unchanged, byte for byte. Only these
parts changed:

```diff
-// @ts-check
 // THE WATCHED SOURCE (a11ign/a11ign#3418, A5; ...                      <- header prose, unchanged

 import { stateFingerprint } from "../event.mjs";
 import { WATCHABLE, WATCH_KIND, activeWatches, readState, watchKey } from "../watch-list.mjs";
 import { observe } from "./stall.mjs";
+import type { Watch } from "../watch-list.mjs";
+import type { Readers } from "../placeholders.mjs";

-/** @typedef {import("../watch-list.mjs").Watch} Watch */
-
-/**
- * @param {Watch} watch @param {string} state @param {{repo: string, at: number}} where
- * @returns {Record<string, unknown>}
- */
-function eventOf({ thing, kind, id }, state, { repo, at }) {
+function eventOf({ thing, kind, id }: Watch, state: string, { repo, at }: { repo: string; at: number }): Record<string, unknown> {

 /**
  * One event per watched thing whose state differs from the last the chairman was given, in the order they were added.
- *
- * @param {{ lines: Record<string, any>[], readers: import("../placeholders.mjs").Readers, now: () => number, repo: string, log?: (line: string) => void }} input
- *   `lines` is the ledger as it stands: the watches and what they were last told are both read from it
- * @returns {Promise<{ events: Record<string, unknown>[], cannotAsk: { source: string, reason: string }[] }>}
  */
-export async function observeWatched({ lines, readers, now, repo, log = () => {} }) {
+export async function observeWatched({ lines, readers, now, repo, log = () => {} }: {
+  /** The ledger as it stands: the watches and what they were last told are both read from it. */
+  lines: Record<string, any>[];
+  readers: Readers;
+  now: () => number;
+  repo: string;
+  log?: (line: string) => void;
+}): Promise<{ events: Record<string, unknown>[]; cannotAsk: { source: string; reason: string }[] }> {
```

The two importers (`src/messaging/watch.mjs`, `src/messaging/sources/watched.test.mjs`) each changed one specifier, `./watched.mjs` to `./watched.ts`.
**Checked, not asserted** (`tsc -p` on the throwaway config of Consequence 1, before and after):

```
errors before the conversion: 198      errors after: 198      errors in watched.ts: 0
error set, line numbers stripped: identical before and after
```

The four errors that remain beside it are the file's TEST, `watched.test.mjs` (a fixture whose partial `readers` object is not a `Readers`),
and were there before. **A conversion that changed no error is the mechanical one;** the conversions that change the set are the ones a
reviewer reads.

**Owner:** #3556 (the ratchet and the worked-example file); each move row for its own repository.

### DECISION 2: `tsc --noEmit` is a required check in every repository

**Decision:** every repository has a `tsconfig.json` extending the shared base (Decision 3), `strict`, `module` and `moduleResolution`
`NodeNext`, `noEmit`, `allowJs` with `checkJs` off (so a `@ts-check` `.mjs` and every `.ts` are checked, and an unannotated `.mjs` is the
ratchet's population), and a CI job named `typecheck` that is a required status on `main`. `@types/node` is a devDependency: agent-org
has none installed today (`node_modules/@types` is absent), and the config's `"types": ["node"]` needs it. **The TypeScript version is one
pin across the repositories** (6.0.3 today), moved by the shared package.

**Fix forward, and no baseline file.** Whatever the first run finds is fixed in the pull request that adds the check (row 4a, #3551); a
suppression comment is allowed only with a reason beside it. The measurement that sizes it is Consequence 1.

**Owner:** #3551 (agent-org first); each other repository's conversion row.

### DECISION 3: rstest, with ONE shared config that the repositories import, as a package

**Decision:** every repository's tests run on rstest. The shared config is **a published package, `@a11ign/toolchain`**, not a template
each repository copies. It carries what a11ign's `scripts/rstest/` already holds, parameterised by what differs per repository:

| in the package (the same everywhere) | a parameter (per repository) |
|---|---|
| `pool: forks`, isolated; `testTimeout`/`hookTimeout` 0 for `node:test` parity | `root`, `include` |
| the build cache, **on in CI only** (`isCi`), `A11Y_RSTEST_CACHE_DIR` to move it | extra `pool.execArgv` preloads (a11ign's `walk-scope`) |
| workers capped at half the cores **locally**, rstest's default in CI | |
| the `json` run record, one file per run, and the verdict reporter | |
| the `node:test` alias hook and shim (`register-node-test-alias.mjs`, `node-test-shim.mjs`) | |
| **CI runs `rstest run --trace` once**, the summary archived as an artifact | |
| `tsconfig.base.json` and the Rslib presets of Decision 4 | each package's entries |

**Package, because the config is not 183 lines of settings but eight recorded decisions** (the bullets in the header of `scripts/rstest/rstest.config.mjs`),
and five copies would drift: `scripts/rstest/` is already 685 lines in 5 files. A template is rejected for exactly that. **Where it
lives:** `packages/toolchain` in a11ign, where the source and its tests already are, published like `evidence`, `judge` and `scorer` by
a11ign's release (ADR 0041), and consumed by every other repository as a `devDependency` semver range, which is the only edge ADR 0041
decision 1 allows. **The cost is a back-edge**: agent-org, screenreader-worker and documents depend on a package a11ign publishes, while
a11ign depends on them at runtime. It is a version edge, never a source edge, and it is a `devDependency`; it is named here because a11ign's
release blocking on a consumer's pin, or the reverse, is the failure that would move the package to its own repository (falsifier 3).

**The `rs` CLI (Rstack's unified command), evaluated on a11ign's config, measured.** A one-line `rstack.config.mjs`
(`export default define.test(base)`, `base` being a11ign's own `rstest.config.mjs` imported unchanged) was run against a 69-file subset
(`packages/evidence`, `judge`, `scorer`, in this worktree with `node_modules` linked to the primary checkout's):

```
                          files        tests                      failing tests                   wall (2 runs)
rstest run (a11ign cfg)   69 files     719 (710 pass, 7 skip)     2, in verify-gate.test.ts       6.24 s, 5.58 s
rs test run (same cfg)    69 files     719 (710 pass, 7 skip)     the same 2                      7.18 s, 7.89 s
$ rs --version x5 / rstest --version x5          0.83 s total   /   1.18 s total
$ rs test run --trace packages/evidence          prints "Trace summary: 21 test file(s)" and writes .rstest/trace-<stamp>.{json,summary.md}
```

- **It works, unchanged.** The same files, the same pass count and the same two failures (those two fail identically on both because this
  worktree has no built `judge` `dist`: a property of the worktree, not of the runner).
- **It costs about 1.4 s on this subset** (n=2 each, so a reading, not a rate). The cause is not determined: `rs --version` is not slower
  than `rstest --version`, so it is not startup.
- **`rs test run -h` lists no `--trace`, and `rs test run --trace` works**: the flags pass through to rstest. The help text is not the
  contract.
- **Not evaluated:** `rs lint`, `rs fmt` and `rs check` (this repository lints with ESLint, and nothing here measured replacing it), and
  `rs test`'s handling of `pool.*` flags beyond the config. `rstack` is 0.8.0, and the Rstack documentation is said to read a config from the working
  directory and not to merge it with a parent's (second-hand: a subagent's reading of rstack.rs, **not tested here**).
- **Decision on the evidence:** the standard commands are **`rstest`, `rslib` and `tsc`**, called directly. `rs` is neither required nor
  forbidden: because the shared config is a plain exported object, a repository that wants `rs` adds the one-line file above, and
  adopting it is a per-repository choice that needs no change to the package. What would change this is falsifier 4.

**`--trace` leaves an untracked directory**: after the run above, `git status` showed `?? .rstest/`. Every repository's `.gitignore` gets
`.rstest/` in the row that adopts the package.

**Owner:** row 4-0 (the extraction, **not yet filed**: appendix), then #3549 (agent-org's suite, item 3 and item 5's `--trace`).

### DECISION 4: Rslib builds every published package, to ESM `.mjs` plus `.d.ts`, by package type

**Decision:** nothing hand-rolled and no bare `tsc` emit. `tsc` stays as the checker (Decision 2) and never as the builder. Two modes:

**Libraries** (screenreader-worker, screenreader-fleet, documents, `evidence`, `judge`, `scorer`, anything consumed by version): Rslib
**bundle** mode, **one entry per public export**, dependencies left external, `format: "esm"`, `.mjs` plus `.d.ts`. The keys that did this in
1.0.3, on `@a11ign/evidence` (7 exports, built in a scratch copy of its `src`):

```js
defineConfig({ lib: [{ format: "esm", bundle: true, dts: true,
  source: { entry: { index: "./src/index.ts", verify: "./src/verify.ts", /* ... one per `exports` key */ } },
  output: { autoExternal: true, target: "node", filename: { js: "[name].mjs" } } }] });
```

- **`autoExternal` moved:** `lib.autoExternal` is deprecated in 1.0.3 and warns ("use `output.autoExternal`"); the row text that said
  `autoExternal` meant this one.
- **The entries are derived from the package's own `exports` map by the shared package's helper**, with a test that every `exports` key has
  an entry, so a subpath cannot be added to one and forgotten in the other.
- **The `.d.ts` are produced by `tsgo`** (TypeScript 7, native) in this Rslib, not by the `tsc` 6.0.3 of Decision 2. Two compilers read the
  same source; the consumer check below is the arbiter (Consequence 4). `@types/node` must be resolvable for it, as for `tsc`.
- **`exports` rewrites `.js` to `.mjs`**, and the built output is one `.mjs` per entry, one shared chunk (`r.mjs`), and a `.d.ts` for
  every source module (10 here, for 7 entries).

**Checked from a clean consumer, which is the acceptance of the first conversion** (screenreader-worker's next release, row #3552): the
package was packed with `npm pack` and installed into an empty project:

```
$ npm pack --dry-run          # by extension: 8 .mjs, 10 .d.ts, 10 .d.ts.map, 1 package.json; files under src/: 0
$ node c.mjs                  # import() of all 7 specifiers: ".", "./verify", "./wcag", "./document-identity", "./conformance", "./earl", "./source-text"
@a11ign/evidence 13 exports   .../verify 33   .../wcag 1   .../document-identity 5   .../conformance 14   .../earl 1   .../source-text 1
$ tsc -p tsconfig.json        # consumer: NodeNext, strict, skipLibCheck FALSE, imports a type and a value
consumer tsc: 0 errors
```

**The 10 `.d.ts.map` files are an artefact of the tsconfig, not of Rslib**: the base `declarationMap: true` made them, and they point at
a `src/` that is not shipped. **The shared base turns `declarationMap` and `sourceMap` off for a published package**, so that the listing is
only `.mjs`, `.d.ts` and `package.json`, as the acceptance says. Size, for scale (`du -sk`): a11ign's current `evidence` `dist` is 568 KB in
40 files; the Rslib one, with those maps, 304 KB.

**The a11ign CLI:** one bundled entry for a fast start. **Which dependencies are inlined was decided by measuring**, on the CLI's current source
and the current `evidence`/`judge`/`scorer`/`worker-fleet` packed from the primary checkout's built `dist` (`npm pack --ignore-scripts`),
`@a11ign/documents` and `@a11ign/screenreader-worker` from the registry, installed with `--omit=optional`, start time being 10 runs of
`node <cli> ` with no page (it exits at the usage check, so it times module loading and nothing else):

| form | a11ign package KB | installed total KB | files | start, s (10 runs, sorted: min, median, max) |
|---|---|---|---|---|
| today's `tsc` emit, one `.js` per file (116 files) | 1,048 | 37,340 | 2,629 | 0.38, 0.435, 0.52 |
| Rslib bundle, every dependency external | 168 | 36,456 | 2,514 | 0.38, 0.44, 0.48 |
| **Rslib bundle, `@a11ign/documents` + `pdf-lib` + `yaml` inlined; the rest external** | 1,340 | **9,972** | **634** | **0.27, 0.295, 0.32** |
| Rslib bundle, everything inlined | does not build | | | |
| reference: the published `a11ign@0.1.0` (before `documents` was a dependency; timed with `--help`, which prints the same usage) | 520 | 9,400 | 907 | 0.31, 0.385, 0.47 |

**`pdf-lib` is 23,632 KB of the 37,340**: it arrives only through `@a11ign/documents`, and inlining the two removes it from the install and
from the start path. **Everything-inlined does not build, and it is not a preference** (seen building against the primary checkout's workspace links, not the packed install above): Rslib refuses three runtime path reads that locate a
sibling file by `new URL("../src/provisioning/", import.meta.url)` and the like (`@a11ign/screenreader-fleet`'s `fleet-scripts.mjs`:
`../src/provisioning/` and `../src/local-worker/`; `@a11ign/scorer`: `new URL("../", ...)`, its package root; what it reads there was not looked at). A bundle moves
the file the URL is relative to, so those packages stay external, and so do `playwright`, `@axe-core/playwright` and `@guidepup/guidepup`
(optional or native). **`evidence` and `judge` are kept external too, by reasoning and not by measurement:** `scorer` and the fleet package
import them, so inlining them would give the CLI a second copy of their module state beside the one the externals load. **Smoke only:**
the bundle was run to its usage check, not through a PDF scan or a capture; the CLI's own conversion row runs its PDF tests against the
bundle before this form is kept.

**`scripts/build-packages.mjs` and `tsc --build` are replaced, not kept beside it:**

| today | replaced by | the row that deletes it |
|---|---|---|
| a11ign `scripts/build-packages.mjs` (54 lines), its 5 `tsconfig.json` `references`, `packages/lab/src/packaging/project-references.test.ts`, `prepack: tsc --build` | each package's `rslib.config.ts` over the shared presets, built in dependency order by pnpm's own `-r` ordering (platform: pnpm already topologically sorts a workspace) | row 4c-a11ign, **not yet filed** (appendix) |
| documents' `tsc --build` (`prepack`) | `rslib build` | #3553 |
| screenreader-worker's raw `src/*.mjs` release | `rslib build`, then Decision 5's acceptance | #3552 |
| screenreader-fleet's per-package `tsc` | `rslib build` | #3554 |

**Owner:** #3552 first, with the acceptance above written into it.

### DECISION 5: the order, smallest blast radius first, each its own row

| | row | what | status |
|---|---|---|---|
| 4a | #3551 | agent-org gets a `tsconfig.json` and a required `typecheck` job, **now**: fix forward what Consequence 1 found | filed, ready, no edge |
| 4-0 | **not yet filed** | extract `scripts/rstest/` and `tsconfig.base.json` into `@a11ign/toolchain` in a11ign and publish it, with the Rslib presets and the `exports`-derived entries helper | **`product-manager` files it; it precedes 4b, 4c** |
| 4b | #3549 (item 3, and item 5's `--trace`) | agent-org's suite onto rstest, with the shim costs of Consequence 2 | claimed; after #3551, **and after 4-0** |
| 4c | #3552, #3553, #3554 | screenreader-worker (first), documents, screenreader-fleet: tests onto rstest, releases built by Rslib with `.d.ts` | filed; **each also after 4-0** (they were filed blocked-by this row for the config's shape: the answer is "a package", and 4-0 delivers it) |
| 4c-a11ign | **not yet filed** | a11ign's own packages onto the Rslib presets; the CLI as the bundle of Decision 4; delete `scripts/build-packages.mjs` | after 4-0 |
| 4d | #3556 | the `.mjs` ratchet in agent-org, and the worked-example file | filed |
| 4e | #2702, #2703, #2704 | **the split moves adopt the standard as they move**, so lab, control and fleet arrive in it and are converted once | bodies amended |

### DECISION 6: what this ADR leaves alone

It changes no release mechanism (ADR 0041), no package boundary (ADR 0004), and no repository's CI beyond the two named jobs
(`typecheck`, and `rstest run --trace` once). **ADR 0031's deploy path is untouched and is Consequence 3.**

## Consequences (including the ones the chairman will not like)

**1. A required typecheck finds 198 errors in agent-org today, in 68 files.** Measured: `git archive` of agent-org at `b404507`, `node_modules`
linked to the tools it declares, `@types/node` 26.6.3 borrowed from a11ign's install (agent-org has none), and a throwaway config with a11ign's
compiler options and `include` of `src/**/*.mjs`, `src/**/*.ts`, `.github/scripts` and `host`:

```
                                   checkJs off (the Decision 2 population)    checkJs on (every .mjs)
tsc --noEmit: errors / files            198 / 68                                  379 / 83
  in .test.ts / .mjs (incl .test.mjs)   50 / 148                                  50 / 329
  by code, most common                  TS2345 32, TS7006 30, TS2322 28,           TS7006 144, TS2345 50, TS2322 35,
                                        TS2339 19, TS18048 18                      TS2339 28, TS18048 23
wall, peak memory (one run each)        12.3 s, 727 MB                            12.5 s, 724 MB
```

The 6 source `.ts` files are clean; **25 of the 226 `*.test.ts` files and 43 `.mjs` files carry the 198.** `src/messaging` holds 106 of them,
`src/packaging` 35, and the largest single files are `messaging/converse.test.mjs` (24) and `wake.mjs` (11). **Turning `checkJs` on adds 181
errors in 15 more files** (the 27 `.mjs` with no `@ts-check`; 144 of the total are `TS7006`, an implicit `any`), which is why Decision 2 leaves it off and
leaves those 27 to the ratchet. **A number of errors is not a number of bugs:** the one worked example's remaining four are a test fixture that is
a partial object, which is a test narrower than its type; it was not run to see whether any of the 198 is a defect that shipped.

**2. The `node:test` alias costs agent-org one file to port and a decision about the rest; a whole-suite reading is NOT in hand.**
agent-org's 267 test files (226 `.ts`, 41 `.mjs`) **all** import `node:test`. By grep, what they import is `test` (264, plus 5 default imports),
`after` (44), `describe` (30), and one each of `before`, `beforeEach` and `mock`; the 4 `t.skip` uses and the `t.diagnostic` uses (2 files) are
mapped by the shim, and the option keys the grep found on `test()`/`describe()` are `skip` (4) and `timeout` (1), both mapped (a grep of one-line option objects, so a multi-line one would be missed). **The one the shim refuses is `mock.timers`**, in
`src/work-gate-stale-blocker-cleared.test.ts` (the shim maps `mock.fn` and refuses every other `mock` property by name): that file is ported
to rstest's own fake timers. a11ign's `include` matches `*.test.ts` only, so agent-org's 41 `*.test.mjs` need their glob.
**What was run, and what it does not show:** agent-org's suite under a11ign's rstest config in the scratch export, 266 files, 72 s:
`202 files failed to collect, 64 passed; 1,248 tests passed, 6 failed`. The 202 collected **zero** tests because `project-config.mjs` refuses at import
without `AGENT_ORG_HOST` (a property of the scratch export, not of the shim), and the 6 failures were `git ls-files` in an export that has no `.git`.
A second run with `AGENT_ORG_HOST` set to a11ign's declaration did not finish inside 10 minutes and **was stopped**: the tests there act on a
real checkout, and nothing here bounded what they touch. So **#3549 item 3 measures it, in agent-org's own CI**, and this ADR claims only the
grep and the 1,248.

**3. ADR 0031's worker is deployed from a git checkout onto bare Windows boxes, and a built release does not change that by itself.** The
standard says a published package is built, never raw source (and the first conversion's `npm pack` listing contains no `src/`). `fleet:deploy`
pulls the worker over git and runs `node src/capture/nvda/server.mjs`. **Whether the deployed artefact becomes the installed package or a built
`dist` committed to the deploy tree is not decided here and is not free:** it touches the fleet, which this row may not run and a row for
`orchestrator` decides. #3552's Acceptance must carry it as an explicit line, and the worker's own source stays unbuilt until it does.

**4. Two compilers read every library:** `tsc` 6.0.3 checks, `tsgo` (TypeScript 7) writes the `.d.ts`. They can disagree on a file. The
consumer's `tsc` run in each conversion's acceptance is the arbiter, and the package pins the one version it checks with.

**5. The standard rests on pre-1.0 tools:** rstest 0.12.3, rstack 0.8.0 (Rslib is 1.0.3). a11ign already pays this: the config's header
records two behaviours of rstest read out of its source (`normalizeBuildCache`, `determineAgent`), and a point release can move either.

**6. Every published package's `exports` changes `.js` to `.mjs`**, so a consumer that deep-imports `dist/*.js` breaks; each package's first
Rslib release carries a changeset that says so.

**7. `--trace` is not free to read:** the summary is per run, and the top-10 and per-phase split that #3549 asks for before anyone optimises
is that run's output, on the full suite in CI. **Not measured here:** only a 69-file subset was traced.

## Alternatives rejected

- **A template each repository copies.** Five copies of 685 lines and eight recorded decisions drift by the first fix; "ONE shared config" was the requirement.
- **Keeping `tsc` as the emitter.** It is what is broken: one `.js` per file, 116 files in the CLI, and in the measurement above the
  largest install in the table.
- **Rslib bundleless for libraries.** It would keep the file-per-module shape that makes `exports` a map of files; bundle mode with an
  entry per export keeps the same subpaths and ships 8 files for evidence's 7 entries. Not measured against bundleless; chosen because the
  chairman's text names bundle mode.
- **Inlining everything in the CLI.** Measured: it does not build (Decision 4), and the part that can be inlined already takes the install from
  37,340 KB to 9,972 KB.
- **`rs` as the required entry point.** It runs the config unchanged and adds a file per repository and about 1.4 s on a 69-file subset for no
  measured gain; per-repository adoption stays open.
- **`checkJs: true` as the first gate.** 379 errors in 83 files against 198 in 68: the larger number is the 27 un-annotated files, which the
  ratchet is for.
- **A big-bang `.mjs` to `.ts`.** Ruled out by the chairman; the worked example shows why it is unnecessary.

## What would falsify this

1. **Row 4a finds the 198 are not bounded**: if making `tsc --noEmit` green in agent-org takes more than one pull request or leaves a
   suppression count above a handful, "fix forward" was the wrong instruction and a recorded baseline is needed.
2. **A library's Rslib bundle fails the clean-consumer check** (a missing export, or a `.d.ts` the consumer's `tsc` rejects) in the first
   conversion, #3552: the bundle-per-export mode is wrong for that package type.
3. **A release of a11ign is blocked by a consumer's pin on `@a11ign/toolchain`, or the reverse, twice**: the package belongs in a repository
   of its own.
4. **`rs test` becomes faster than `rstest` on the full suite, or rstest's `--trace` and `pool.*` stop passing through it**: re-measure and
   reconsider Decision 3's "called directly". The comparison above is a 69-file subset, n=2.
5. **The agent-org suite on rstest runs fewer tests than `tsx --test` does today, by more than the `mock.timers` file explains**: Consequence 2's
   grep understated the cost, and the per-file ports need sizing before the move is scheduled.
6. **The CLI's inlined form (documents, `pdf-lib`, `yaml`) fails a PDF scan that the unbundled form passes**: the inlining is withdrawn and the
   install-size gain with it.

## Appendix: the rows

Filed beside this ADR by `product-manager` (2026-10-04T21:13Z): #3551 (4a), #3549 (4b, no new row), #3552, #3553, #3554 (4c), #3556 (4d), and
#2702, #2703, #2704 (4e, bodies amended). **Rows this ADR finds missing, for `product-manager` to file `ready`, none of them in this row's Region:**

1. **4-0**: extract and publish `@a11ign/toolchain` in a11ign (Decision 3, 5); #3549, #3552, #3553, #3554 each gain a blocked-by edge to it.
2. **4c-a11ign**: a11ign's own packages and the CLI onto Rslib; delete `scripts/build-packages.mjs` (Decision 4).
3. **#3552's Acceptance** gains Decision 4's three-part command text and Consequence 3's deploy line.
4. **Row 8**: the dated updates in ADR 0005 and ADR 0031 pointing here (this row's Region is the new ADR and the README only).
5. **Each repository's `.gitignore`** gains `.rstest/` in the row that adopts the package (Decision 3).
