# Storage and memory hygiene on the control plane

This Mac is the control plane, and things accumulate on it that nobody owns. This page names each
accumulator this project has measured and the lifecycle rule, owner, or recorded deletion decision that
applies to it — never "we should clean this up" left as an intention, which issue #58 names as a failed
acceptance for this page.

**Regenerate the measurement rather than trusting this page's own numbers**, which are a snapshot from
the day it was written:

```bash
npm run hygiene:report
```

It prints every accumulator's current count/size beside its rule, and refuses (exit 1) if any row's text
reads as an unresolved intention rather than a decision — so this page cannot drift into prose nobody
checks against reality.

## The accumulators, and the decision for each

| accumulator | decision |
|---|---|
| **Worktrees registered** | RULE: prune stale/fully-merged trees regularly. `git worktree remove` refuses a dirty tree by design, which is the existing safety net. Manual practice today (`dispatcher`); no new command from this row. See issue #59 for the lifecycle-rule-maintained-by-hand problem this is itself an instance of, and for a real hazard found while writing this page: pruning can silently skip a branch it cannot read the merge status of, and — separately — a directory name can be reused by a different agent's worktree with no warning to a session that still has it open. |
| **`node_modules` — real (own install)** | DEFAULT, since #57 (pnpm 3/6, #2300): **a worktree gets its own** — `pnpm install --frozen-lockfile` (`corepack pnpm install --frozen-lockfile` where pnpm is not on PATH). It is a hard-linked install from one content-addressed store, about five seconds on this host (measured 2026-09-24, wt-2300), so the per-unit choice between disk and staleness this row used to describe is gone. The earlier cost measurement stands as history: 25 trees at ~169 MB each, 3.4 GB of duplicate installs (2026-09-06), taken when an install was a full copy. A tree with its own install links `@a11ign/*` to its OWN `packages/` and `packages/guards/src/worktree-resolution.mjs` classifies it `OWN_PACKAGES`. |
| **`node_modules` — symlinked to primary** | LEGACY, being retired, not a choice anyone is still making. A symlinked worktree reads the PRIMARY's `dist`, not its own (#2181); `suiteStartVerdict` refuses a suite start in one, and `.pnpmfile.cjs` refuses a `pnpm install` through one because pnpm follows the link and rewrites what it points at (#2297). **Residual population, MEASURED: 48 of 68 registered worktrees**, read at `5521677a0` on 2026-09-24 with `npm run hygiene:report` (16 real, 4 missing, counting wt-2300 itself, which had just been installed). Re-run the command rather than trusting the count: it changes each time a tree is claimed or pruned. **Converting them is host housekeeping, not this page's or any row's job.** For one tree the step is `rm node_modules` (the link: no trailing slash, no `-r`) then `pnpm install --frozen-lockfile`. What that is safe against: the primary's `node_modules` (removing a symlink touches nothing behind it) and every other tree reading it. What it is NOT safe against, by reasoning rather than measurement: a session running in that tree at that moment, and a branch that predates `pnpm-lock.yaml` (the frozen install has nothing to read; merge `main` first). |
| **`node_modules` — missing** | EXPECTED for a worktree mid-setup (created, `pnpm install --frozen-lockfile` not yet run) or one kept only for its git history. Not a defect on its own. |
| **`.venv` — real (own copy)** | RULE: always symlink `.venv` to the primary's, never install a fresh one per worktree. One real copy (the primary's) is correct; more than one is the accumulator to fix by hand. |
| **Per-worktree `dist`, for packages another package imports by name** | VERIFIED, not assumed, while writing this row: every package this repo actually imports by BARE specifier (`from "@a11ign/x"`, resolving through `exports`/`main` into `dist/`) already declares its own `"prepare": "tsc --build"`, which npm workspaces run automatically on `npm install` — so the "missing dist breaks a fresh worktree's `tsc --noEmit`" trap named when this row was filed does **not currently reproduce**. It named `packages/scorer` specifically; that package already has the hook. `packages/agent-org/src/control-plane-hygiene.mjs`'s dist-trap check re-verifies this on every run rather than trusting the original report, and fails loudly (naming the package) if a bare-imported, dist-exporting package is ever added without one. |
| **Local `runs/` copy** | RULE (already the answer this repo had; restated here so nobody re-derives it): KEEP. It is what lets a laptop read the corpus at all. Staleness, not size, is the risk — `npm run lab:inventory` reports how stale a copy is. **Never delete without `orchestrator`** — it is a copy several tools read, per issue #58's own fleet note. |
| **Disk free** | Informational only. Not an accumulator; no rule needed at the current 275 GB of 926 GB scale. |

## Why the "missing dist" trap does not currently reproduce

`packages/agent-org/src/control-plane-hygiene.mjs`'s `distTrapReport` answers a narrower, checkable question than "is
`dist` missing anywhere": **does any package that something else imports by its bare root specifier lack
the build step that produces its own `dist`?** Two false positives were found and fixed while building
this check, both worth keeping as the reasoning rather than only as passing tests:

- A cruder "does the package name appear after `from \"`" match flagged `@a11ign/lab` and
  `@a11ign/nvda-worker` as exposed. Both are reached from elsewhere in this repo only by SUBPATH
  import (`@a11ign/lab/src/dataset-paths.mjs`, `@a11ign/nvda-worker/error-text`) straight into
  raw `.mjs` source — the shape ADR 0031 documents deliberately for `nvda-worker` (no build step at all).
  Narrowed to match only the BARE specifier (`from "@a11ign/x"` with the closing quote immediately
  after), which a subpath import never satisfies.
- Even narrowed to bare imports, `@a11ign/nvda-worker` still flagged, because nothing had checked
  whether that package's OWN root export resolves into `dist/` at all — it resolves straight to
  `src/index.mjs` (`exports["."]`), so a missing `dist` there breaks nothing. The check now reads each
  package's own `exports`/`main` field and only flags one whose root genuinely points into `dist/`.

Both are pinned as fixtures in `packages/lab/src/packaging/control-plane-hygiene.test.ts`, including one
built specifically to isolate the bare-vs-subpath boundary from the dist-vs-source boundary — a package
with a real `dist` export, reached only by subpath, so a sloppy quote match would have nothing else to
hide behind.

## What this page does not decide

`#57` (the shared `node_modules` that resolved to the primary's `dist`, now being retired by the `pnpm`
migration: this page states the residual count above and does not convert those trees) and `#59` (the
worktree-prune rule itself, and the two hazards found while writing this page — a merge-status check that
cannot tell "not merged" from "could not tell", and a directory name reused across agents with no warning)
are both open separately. This page measures and
records the decision each accumulator already has; it does not re-litigate either of those.
