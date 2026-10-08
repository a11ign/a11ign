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

Eight decisions. Each carries its reading and the row that makes it true.

### DECISION 1: TypeScript source in every repository, converted by a sweep per repository and held by a ratchet

**Decision:** new source is `.ts`. An existing `.mjs` becomes `.ts` in one conversion sweep per repository, done by the conversion script
(token cost is a hard constraint, so agents fix only the residue the script cannot), together with that repository's layout flatten
(Decision 7) so each file moves once. A per-repository count of tracked `.mjs` files may only go down, and a NEW `.mjs` fails the ratchet (row
4d, #3556; its adoption in the other repositories is #4243). A file may stay `.mjs` while it is on that count; nothing is exempt for good.

**The earlier rule, that a file was converted in the pull request touching or moving it, is withdrawn: it had no check.** Read on row #4246
(2026-10-08, carried, not re-derived here): 46 new `.mjs` files landed after it was written, 18 of agent-org's last 30 count rises were new `.mjs` that "a
shipped command imports" (`mjs-source-count.test.ts` since #3556), and a rule with no check is an intention. The ratchet is the check; the sweep is the conversion.

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

It changes no release mechanism (ADR 0041), no package boundary (ADR 0004, except the one fold Decision 7 rules on, which its own rows carry out), and no repository's CI beyond the two named jobs
(`typecheck`, and `rstest run --trace` once). **ADR 0031's deploy path is untouched and is Consequence 3.**

**The one release standard it does state, for every repository: the publish job runs under `environment: npm-publish`** (screenreader-worker, documents and screenreader-fleet do; a11ign's `release` job does since #3624, pinned in `release-triggers-itself.test.ts`). The name is part of the OIDC claim npm checks, so each package's trusted publisher carries it.

### DECISION 7: how a repository is laid out: the package at the root when there is one

Decisions 1 to 6 fix what a repository is built and tested WITH and say nothing about how it is LAID OUT, so the split repositories kept the
monorepo's shape (`packages/<dir>/` under a private `*-workspace` root, two READMEs, two `package.json` files, a `pnpm-workspace.yaml`). A
reader who has never seen the monorepo meets that first, and an outside evaluator reads these repositories first (v3 adopter-readiness).
`agent-org` is flat and is the model. **The standard** (`ceo`, from the chairman's direction of 2026-10-08):

> A single-package repository has its package at the ROOT: one README (also the npm page), one package.json, one tsconfig (plus a build
> one if Rslib needs it), one LICENSE, no workspace file. A multi-package repository exists only when it publishes more than one
> package, and each directory is named after its package.

**The four things the layout check fails on** (the next row of this set writes the check; it fails on exactly these, so a repository can
read this list and know whether it passes):

1. **A workspace with exactly one package.** A `pnpm-workspace.yaml` (or a `workspaces` field) whose members resolve to one package is
   machinery that does nothing; the package belongs at the root.
2. **A package directory whose name does not match its package name.** `packages/pdf/` holding `@a11ign/documents` makes the reader
   learn a second name for one thing. Each directory is named after its package (`@a11ign/<name>` lives in `<name>/`).
3. **A second README describing the same package.** A root README and `packages/<dir>/README.md` for one package say the same thing
   twice and disagree within a quarter. The root README is also the npm page.
4. **Leftovers of a layout that is gone:** `lerna.json`, a `*-workspace` root `package.json`, a `packages/` directory that holds
   nothing, a `.changeset/config.json` listing packages that no longer exist.

**A repository that cannot meet this says why in its own README**, in one sentence under its first heading, naming the rule it departs
from and the reason. Silence is the failure; a stated departure is a decision someone can argue with.

**What the rule allows for a private second package.** One predicate decides whether a repository is multi-package: **it publishes more
than one package.** A private package that is never published does not count toward it, so a repository publishing one package is
single-package whatever else it holds, and a private package under `packages/` beside it is failure 1 (a workspace of one published
package plus a member that publishes nothing). The default is to fold it into the published package's `src/`. It may stay separate only
when a consumer outside the published package, or a build target, needs it separate (the claimant measures and posts the reading, as
row #4209 does below). A package kept on that ground is **a stated departure, not the multi-package case**: the repository's README says
so under the sentence above, its directory is named for its package (failure 2 still applies), and the layout check reads the README
sentence as the allowance. It is never a reason to leave a second README or a `*-workspace` root in place.

**The ruling on `nvda-speech` (row #4209): FOLD.** `screenreader-worker`'s root is the public package `@a11ign/screenreader-worker`
(AGPL-3.0-or-later) and it nests `packages/nvda-speech/`, the private `@a11ign/nvda-speech` (GPL-3.0-or-later, derived from NVDA,
never published), tied together by a `pnpm-workspace.yaml` of `.` and `packages/*`. Read at screenreader-worker `0b7bc93` and lab
`0e98109c` on 2026-10-08, by `git grep` over `origin/main` of each repository and by reading the files the greps named; a reading at a
moment, to be re-run before it is quoted:

- **Nothing imports or runs it as a package.** The package holds Python only (`nvda_speech/labels.py`, `symbols.py`, `scripts/*.py`,
  `tests/test_symbols.py`) and a `package.json` of name, version, `private`, `license`, `type`; no `main`, `exports`, `scripts` or dependency.
  The worker's `src/`, `scripts/`, `package.json` scripts, `rstest.config.mjs` and `isolation-smoke.mjs` do not name it. Its only importers
  are its own scripts and test (`from nvda_speech.labels import ...`, `measure_announcement_shapes.py:25`, `measure_heading_accuracy.py:34,35`,
  `tests/test_symbols.py:29`).
- **No build target needs it separate.** `rslib.config.mjs` builds one library from `tsconfig.build.json` (`include: ["src"]`, TypeScript
  and `.mjs`), and `tsconfig.json` includes `src/**/*.ts` and `scripts/**/*.ts`; neither reaches a `.py` file. The tarball is `files:
  ["dist", "README.md", "LICENSE"]`, so the speech package is not in it today and would not be after a fold. `ci.yml` runs no Python;
  its one mention is `releasable-paths: src/ packages/nvda-speech/` (line 39).
- **The one consumer outside the worker reads a FILE, and by path.** lab's `packages/lab/src/harnesses/occurrence-verdict-stability.mjs:65`
  builds `["packages", "nvda-speech", "nvda_speech", "labels.py"]` and `:70` reads it with `readFileSync` under `layerRoot("nvda-worker")` to get
  NVDA's role and state words. It imports nothing and runs nothing, and it refuses loudly where the file is absent, so a fold is a one-line
  change there, not a reason to keep a package.
- **The other mentions are names, not consumers:** worker `.changeset/README.md:7`, `.github/dependabot.yml:19`, `CLAUDE.md:170`,
  `eslint.config.mjs:2` (a comment) and `pnpm-lock.yaml`; lab `.github/dependabot.yml:17,30`, `ci.yml:8` and `exit-code-contract.test.ts:40,667`
  (a comment and a planted path); this repository's `.agent-org/project.json:26` (`releasablePaths`), `PLAN.md:807`, `README.md:376`,
  `packages/README.md:38` and `packages/guards/layer-edges.baseline.json`.
- **The fold does not move the fleet's code hash.** `/health.code` is `codeVersion()` over `WORKER_FILES`, an explicit ordered list in
  `src/worker-files.mjs`, not a walk of `src/`, so Python files under `src/` leave it unchanged.

**Where it goes: `src/nvda-speech/`**, the Python subtree moved whole (`nvda_speech/`, `scripts/`, `tests/`, and its README kept as
`src/nvda-speech/README.md`, since it documents the GPL boundary and is not a second README for the worker package). Its `package.json`,
`LICENSE` and `.gitignore` go; `pnpm-workspace.yaml` goes (failure 1); the three names in `releasable-paths`, `dependabot.yml` and
`.changeset/README.md` go with it, and `releasablePaths` in `.agent-org/project.json` becomes `["src/"]`. lab's path becomes
`["src", "nvda-speech", "nvda_speech", "labels.py"]`. **The licence is not folded away:** every moved `.py` file gets an SPDX
`GPL-3.0-or-later` line and the README keeps its "derived from NVDA, MUST NOT be imported by Apache-2.0 packages" boundary (its
README says a test fails if `@a11ign/evidence` imports it; that test is not re-read here). GPL-3.0 and AGPL-3.0 each permit combination with the
other (section 13 of both), and the published tarball never contained it. The fold is **not done by this row**: it is a
`screenreader-worker` row plus a one-line lab row, filed by `product-manager`, and until both land lab reads the old path and the
repository stays as it is.

### DECISION 8: how un-bundled code runs: `.ts` under `node --import tsx`, from the checkout

**Decision (ONE answer):** **published** packages ship Rslib's built `.mjs` and `.d.ts` (Decision 4, not in question). **Code RUN FROM A CHECKOUT**
(agent-org's gate and scripts, the work-tick units, `pnpm run` scripts, the Ansible one-liners) is `.ts` source that runs as
`/usr/bin/node --import tsx <file>.ts` with the checkout as the working directory. No host change, no build step in a unit. `tsx` is installed
in every checkout that has run `pnpm install` (measured: agent-org `node_modules/.bin/tsx` v4.23.15, a11ign's root `node_modules/tsx` 4.23.15), and
`typescript` stays the only type check (Decision 2): neither `tsx` nor Node's stripping checks a type.

**The default this ADR was asked to test was Node's own type stripping (v22.22.1, `erasableSyntaxOnly`, `rewriteRelativeImportExtensions`). It does
not run on this host as it stands**, measured 2026-10-08 on this host, where `node` is `/usr/bin/node`, the Ubuntu `nodejs 22.22.1+dfsg` package:

```
$ node -p "process.version + ' typescript=' + process.features.typescript"
v22.22.1 typescript=false
$ node --experimental-strip-types t.ts          # t.ts: const x: number = 1
node:internal/util:226  throw new ERR_NO_TYPESCRIPT();
$ node t.ts                                     # no package.json beside it, so CommonJS
SyntaxError: Unexpected identifier ...          # NOT ERR_NO_TYPESCRIPT: the flag-less form fails differently
$ node <file>.ts                                # beside a "type": "module" package.json
ERR_UNKNOWN_FILE_EXTENSION
```

**Read the three errors apart: only the flagged form prints `ERR_NO_TYPESCRIPT`** (the row's own Open-check grepped the flag-less form and got
`0`). The cause is inferred to be the build, not the version (the package reports no stripper; the unflagged default is from Node's release notes, not re-read here): upstream Node 22.18 and later strip types unflagged, and this package is built without the
stripper, so no flag and no version bump of THIS package fixes it.

**Weighed, per unit, on this host:**

| | what it needs | measured here | cost per unit | verdict |
|---|---|---|---|---|
| (i) a host Node built with type stripping | a HOST install (an upstream build beside `/usr/bin/node`, or a replacement); `orchestrator` and the chairman's host, never an engineer. Proof: `node -p process.features.typescript` prints `true` | **refused by the host as it stands** (above) | every `ExecStart` pins the new binary's path; one more Node to patch | **not chosen:** a host change, and it still cannot run the pinned copy (trap a) |
| (ii) `tsx` | nothing new: a dependency every checkout already installs | **runs** a `.ts` as a unit would, from a checkout, and **under `node_modules`** (below) | `node -e 0` 0.17 s; `node --import tsx -e 0` 0.45 s (3 runs each, warm, trivial file): about **+0.28 s per process start** | **chosen** |
| (iii) a BUILD of the host-run code, the units running `dist/` | a build before every tick, after every `primary:update` and `update-tool` | not run | a build step in `ExecStartPre`, so a broken build stops the tick; a stale `dist` is the failure `docs/operational-lessons.md#resolves-to-dist-does-not-say-whose` records | **not chosen:** it moves the failure from startup to every update |

**Why (ii):** it is the only option that needs no host change, it is the only one measured to run the pinned copy, and the +0.28 s is paid by
timers and one-shot scripts, not by a hot path. **What it costs, honestly:** `tsx` becomes a RUNTIME dependency of checkout-run code (it is a
`devDependency` today), so removing it from a checkout breaks the units; the sweep row for agent-org pins that with a test that names the loader in
every `ExecStart`. And the day `process.features.typescript` prints `true` on the host, (ii) can be replaced by plain `node` by editing the
`ExecStart` lines only, because the files are already written to the stripping subset.

**Trap (a): Node REFUSES to strip types under `node_modules`, and `host:check` via pnpm runs the PINNED agent-org copy from there.** Measured: the
pinned copy is `node_modules/.pnpm/agent-org@https+++codeload.github.com+a11ign+agent-org+tar.gz+<sha>_typescript@6.0.3/node_modules/agent-org/`,
which carries the repository's `src` and `host` as raw source (no build) and, in its own `node_modules`, only `typescript`. A `.ts` file placed in it
**ran under `node --import tsx` from a11ign's root** (`pinned-copy ran 7 true`, the `true` being `import.meta.url.includes("node_modules")`),
and **plain `node` on it died** (`ERR_UNKNOWN_FILE_EXTENSION`, the host having no stripper at all; on a Node that has one, the refusal under
`node_modules` is documented behaviour and was NOT exercised here). So after the conversion the pinned copy is `.ts` run by the CONSUMER's `tsx`,
and every consumer of agent-org gets `tsx` as a peer dependency. **Not measured, and the agent-org sweep row proves it before it merges:** that a
tarball install gives `bin` a built file. A `bin` needs `#!/usr/bin/env node`, which cannot load a loader, so **`bin` is always built output**
(`dist/bin.mjs` by Rslib), never a `.ts`.

**Trap (b): `erasableSyntaxOnly` forbids enums, namespaces and parameter properties.** Counted at each repository's `origin/main` on 2026-10-08
with `git grep -E` over tracked `*.ts` (enums `^\s*(export )?(declare )?(const )?enum`, namespaces `namespace|module <name>`, parameter
properties `constructor(... public|private|protected|readonly ...)`), a count of lines, not of files:

| repository | tracked `.ts` | enums | namespaces | parameter properties |
|---|---|---|---|---|
| agent-org (`9799faf`) | 318 | 0 | 0 | **1** (`src/packaging/shadow-reads.test.ts:246`, a test fixture class) |
| a11ign (`bbedfa8b4`) | 249 | 0 | 0 | 0 |
| screenreader-worker (`0b7bc93`) | 86 | 0 | 0 | 0 |
| screenreader-fleet (`ed16dd2`) | 32 | 0 | 0 | 0 |
| control (`8a322e4`) | 38 | 0 | 0 | 0 |
| lab (`9d874a7e`) | 441 | 0 | 0 | 0 |
| documents (`91dac0b`) | 2 | 0 | 0 | 0 |
| toolchain (`e7f0aff`) | 0 | 0 | 0 | 0 |

So the flag costs one line today (the fixture), not nothing. **It is set once, in the shared `packages/toolchain/tsconfig.base.json`** that the
repositories extend (Decision 3), by the conversion-script row, and it is worth setting even though `tsx` does not need it: it keeps every file
runnable by the stripper, which is what makes (ii) replaceable.

**What each name becomes** (every line is `tsx` at the end of its row's sweep; none is changed by THIS row):

| where | today | after |
|---|---|---|
| agent-org `host/*.service.in`, 6 `ExecStart` lines (`kernel-reboot`, `otel-receiver`, `shadow-window`, `tmp-prune`, `trace-publish`, `work-tick`) | `/usr/bin/node packages/agent-org/src/<x>.mjs` | `/usr/bin/node --import tsx <path>/<x>.ts` |
| the `work-tick` unit's `--import` | `--import=./.../crash-exit.mjs` | `--import tsx --import=./.../crash-exit.ts` (two `--import`s run in order; measured with a stand-in) |
| agent-org units that run `pnpm run` (`chairman-listen`, `chairman-watch`, `worktree-prune`, `primary:update`) | `ExecStart=%h/.local/bin/pnpm run ...` | the `ExecStart` is unchanged; the **11 `package.json` scripts** that say `node src/<x>.mjs` become `node --import tsx src/<x>.ts` |
| a11ign `.agent-org/units/*.service`, 3 `.mjs` lines (`corpus-release-nightly`, `token-cost-weekly`, `weekly-review`) | `/usr/bin/node <path>.mjs` | `/usr/bin/node --import tsx <path>.ts` |
| control `a11y-fleet-auto-off.service` (the unit whose script broke fleet auto-off once) | `/usr/bin/node /root/a11y-witness/packages/control/src/fleet-auto-off.mjs --apply` | the same with `--import tsx` **if the fleet box's checkout has `tsx`, which is NOT measured here (the fleet is off limits to an engineer)**: this is the one host question, on the row |
| `bin` in `package.json` | agent-org `src/bin.mjs`; a11ign `dist/cli.mjs`; the scorer `bin/fetch-encoder.mjs` (hand-written); the worker `dist/server.mjs`; fleet `dist/*.mjs` and `src/local-worker/worker-ctl.sh` | agent-org and the scorer become built `dist/*.mjs`; the rest are already built output or a shell script and **stay** |
| Ansible `deploy.yml`, the inline `import("./packages/control/src/layer-checkouts.mjs")` in `node --input-type=module -e` | `.mjs` path | `node --import tsx --input-type=module -e 'await import("./.../layer-checkouts.ts")'`, where the playbook runs |
| CI one-liners that `import()` a `.mjs` (`nightly.yml`, `release.yml`, `reusable-acceptance.yml`; the last imports agent-org's `acceptance-commands.mjs` from `AGENT_ORG_TOOL`, a path under `node_modules`) | `node -e 'import(...)'` | `node --import tsx -e '...'` |
| **the installed host copies** (`~/.config/systemd/user/a11ign-*.service`, rendered from the templates) | name `.mjs` | **unchanged until `host:install` renders them again**: a host action for `orchestrator`, and the window in which template and installed copy disagree is the one `host:check` exists to flag |

**Order, so nothing runs a name that is gone:** the sweep for a repository edits its templates and scripts in one pull request; `host:install`
follows the merge; until it runs, the installed units still name `.mjs` files that are `.ts` in the checkout, so **a unit's `.mjs` is not
deleted by a sweep until its replacement is installed** (the sweep row names the order and `orchestrator` runs the install). That, and the control
unit above, are the host changes this ADR names; it makes none.

**Falsified by:** `node -p process.features.typescript` printing `true` on the host AND the pinned copy no longer living under `node_modules`
(then (i) costs less than (ii)); or the tarball install failing to give agent-org a built `bin` (then the pinned copy needs (iii) for that file).

**Owner:** the conversion-script row (the flag, the rewrite of every `ExecStart` and `package.json` script); each repository's sweep row for its own
units; the host rows `product-manager` files from this decision's comment on #4246.

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
