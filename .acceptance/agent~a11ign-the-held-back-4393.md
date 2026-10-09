Closes #4393

## Acceptance

```bash
bash -c 'test "$(git ls-files scripts packages/guards | grep -E "[.](mjs|js|cjs)$" | grep -v "^scripts/isolation-fixtures/" | wc -l)" -eq 0'
bash -c 'test "$(git ls-files packages/cli packages/scorer packages/judge packages/evidence .agent-org/plugins | grep -cE "[.](mjs|js|cjs)$")" -eq 0'
npx tsc --noEmit
npx rstest run --config=scripts/rstest/rstest.config.ts packages/guards/src/mjs-ratchet.test.ts
```

The row's fourth line names `rstest.config.mjs`; that file is `rstest.config.ts` after this PR, so the line is run with `.ts` (the file it names is one of the 34 renames).

## What changes, and why

The held-back `.mjs` become `.ts` now that the host runs upstream Node 24 and CI's `node-version: 22` strips types: **34 files** by the toolchain's `js-to-ts` script (`git mv`, then the repository-wide path rewrite), the output committed unedited as its own commit so the script's work and mine are separable.

- 12 under `scripts/` (+ `scripts/rstest/rstest.config.ts`), 17 under `packages/guards/src/`, the four packages' `isolation-smoke`, and `.agent-org/plugins/causes`.
- `SMOKE` in `isolation-gate.ts` and `CANONICAL_HELPER_BASENAMES` in `git-spawn-scrubbed.ts` follow the names; both are guards, mutation-checked below.
- `classify` in `scripts/ci-changed.ts` matched `scripts/*.mjs` as "touches every package". Left alone, every renamed script would have stopped doing that, so it now matches `.ts` too (`.mjs` kept for the fixtures). The test pins both.
- The isolation gate's consumer is `"type": "module"`. `npm init -y` writes `commonjs`; the `.mjs` smoke did not care, the `.ts` one failed `0/4` with `Cannot use import statement outside a module` until this.

### The numbers the row asks for

| | |
|---|---|
| **Dry-run estimate** | `would rename 34 file(s) under TypeScript 6.0.3; 0 cannot parse` |
| **Residue** | `npx tsc --noEmit`: **180 errors** after the rename, **0** after typing it (type aliases for the `@typedef`s, `ErrnoException` casts, `import type`s for eslint/estree nodes, one named `AstNode = any` with its reason) |
| **Baseline before** | 47 `files` + 6 `exceptions` |
| **Baseline after** | **0** `files` + 12 `exceptions`: `.pnpmfile.cjs` (pnpm reads only that name, as CommonJS), `eslint.config.js` (ESLint reads a `.ts` config only through `jiti`, which is not installed), and the 10 fixture package files below |
| **Held-back outside the fixtures** | 85 on the row at filing, **0** now |

### The 16 isolation fixtures: 6 converted, 10 kept

Measured first, on upstream Node 24.21.0 and 22.23.3 (both print `strip`), not assumed.

- **6 converted** (`isolation-smoke` in `dangling-bin`, `linked-bin`, `omitted-dependency`, `platform-declined`, `sound`, `truncated-files`): the smoke runs in the consumer's own directory, not under `node_modules`. Run through the gate, `sound` and `linked-bin` pass; `dangling-bin`, `omitted-dependency` and `truncated-files` refuse for the defect each was built to show; `platform-declined` declines on Linux as designed.
- **10 kept `.mjs`** (`index`/`helper`/`cli` of five fixtures): they are PACKAGE FILES that are packed and installed under `node_modules`, where Node refuses to strip: `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING` (ADR 0043 trap (a)). Each is in `mjs-ratchet.baseline.json` with that error as its `why`.

### Measured under CI's Node, not only the host's

Every converted file was imported under `node-version: 22` (upstream **22.23.3**, fetched with `npm install node@22` into `~/.cache`): 34 of 34 load, including the pre-install ones (`refuse-other-installers`, `pnpm`, `lay-layer`, `ci-changed`, `agent-org-newest-tag`, `assert-glob-not-empty` in its `node -e 'import(...)'` form from `nightly.yml` and `release.yml`). `pnpm run test:org` and `node packages/guards/src/isolation-gate.ts --all` also pass under it.

## Host-install

Nothing here is installed by me; `orchestrator` runs `host:install`.

Host-install: `.agent-org/units/a11ign-weekly-review.service` -- a COMMENT changed (`npm-cli-executable.ts`); `ExecStart` is untouched, so the installed unit differs only in a comment.
Host-install: `.agent-org/project.json` and `.agent-org/plugins/causes.ts` -- the agent-org on the host reads `causes.module` from the primary checkout, which becomes `plugins/causes.ts` when this merges; it needs a11ign/agent-org#497 (below) and Node 24 on the host (#4388).
Host-install: none for the git hooks (`core.hooksPath` points at the tracked `scripts/git-hooks/`; `pre-commit` now names `piped-exit-status-guard.ts`) and none for `a11ign-token-cost-weekly` (its `ExecStart` runs a file this PR does not move).

## Outside-Region

Importers and path references outside the slice, all mechanical (the old path to the new one) unless noted:

Outside-Region: 18 `.github/workflows/*.yml` files -- **a CODEOWNERS review of these workflow lines is required** (a workflow edit derives `lane:ceo` review). Each line is a `node scripts/<f>.ts` / `import("./packages/guards/src/<f>.ts")` path or a comment naming one; no job, trigger, permission or `needs` is changed.
Outside-Region: `package.json` (scripts that run a converted file), `packages/guards/package.json` (`exports` -> `.ts`; the package is `private`), `layers.json`, `.c8rc.json`, `.gitignore`, `eslint.config.js`, `.npmrc`, `pnpm-workspace.yaml`, `CONTRIBUTING.md`, `.github/PULL_REQUEST_TEMPLATE.md`, `packages/README.md`, `packages/guards/layer-edges.baseline.json`.
Outside-Region: 17 files under `docs/`, comment and path text only.
Outside-Region: importers under `packages/{cli,judge}/src/` and `packages/guards/nightly/` (comments and one-word path edits); `packages/judge/src/structure-declarations.test.ts` skips `isolation-smoke.ts`, which became a `.ts` this walk now sees and which builds a literal rather than declaring a type.
Outside-Region: `.changeset/a-renamed-tool-module-still-loads.md` -- one path in prose.
Outside-Region: **a11ign/agent-org#497** -- `copied-tool-fixture.ts` listed `.agent-org/plugins/causes.mjs` by name and `HOME_CHECKOUT` is the live primary, so the plugin's rename needs that PR first or beside this one.

Left alone on purpose: the ADRs, `docs/backlog.md` and other dated records, `scripts/fixtures/release-before-3717.yml` (a frozen snapshot of the workflow before #3717), and every `cli-flags.mjs` that names `worker-fleet`'s or `screenreader-fleet`'s own file.

## How you verified it

- [x] `pnpm run typecheck`: 0 errors. `pnpm run lint`: 0 errors (572 warnings, unchanged class).
- [x] `pnpm run test:org`: **1220 pass** (1 skipped), on Node 24.21.0 and on 22.23.3. `pnpm run test:ts`: **1426 pass** (20 skipped).
- [x] `node packages/guards/src/isolation-gate.ts --all`: 4/4 usable when installed. The gate was RED before the `type=module` fix.
- [x] `pnpm run verify` with this body: see the comment on the PR for the stamp.
- Not run: anything on a worker or the fleet (this is a rename; it runs none).

Install note: `node_modules` here is a real `pnpm install --frozen-lockfile --offline` in the worktree. `A11Y_ALLOW_FOREIGN_RESOLUTION` was **not** used.

## If you changed a guard or a gate

- [x] I introduced the fault and watched the check fail, then fixed it. Each against an unmutated control that passes:
  - `classify` regex back to `.mjs` only: `ci-changed.test.ts` fails (1 of 36).
  - A new `scripts/zz-new.mjs`: `mjs-ratchet.test.ts` fails and names it.
  - A baseline exception dropped: `mjs-ratchet.test.ts` fails ("names a file the tree no longer holds").
  - `SMOKE` back to `isolation-smoke.mjs`: the gate refuses `no isolation-smoke.mjs` (run on `sound`).
  - `git-spawn-scrubbed`'s helper list back to `git-env.mjs`: the lint rule flags every spawn that goes through `git-env.ts`.
  - An inline `structure: { headings, landmarks, formFields }` under `packages/judge/src/`: `structure-declarations.test.ts` still fails.
- `mjs-ratchet.test.ts`: the baseline now has no `files`, so three controls that removed or lost a `files` entry could not run. They are rewritten to hit the same refusals by other means (a NEW unlisted source file fails and is named; a `files` name the tree no longer holds passes and says the baseline can be lowered; an exception whose file was lost fails). The positive control `count > 0` read zero by design and is replaced by the exceptions list, whose staleness check proves the walk read the tree.

## Anything a reviewer should be sceptical of

- `scripts/ci-changed.ts` now treats a change to ANY `scripts/*.ts` as touching every package. That widens what CI runs; I read it as the intended direction (the old rule had the same reach over `.mjs`), and the test pins it.
- The last unit of this change that CI measures and I could not is `actions/setup-node` itself; I used upstream Node 22.23.3 as its stand-in.
- `pnpm run verify` is the only place `test:ts` and `test:org` run together; the `structure-declarations` failure above was invisible to `test:org` alone.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
