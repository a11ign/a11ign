# Rolling back from pnpm to npm (#2302, child 6 of #57)

The migration to pnpm is five merged rows (#2297, #2298, #2299, #2300, #2301). This page is how the org gets
back to npm, and it was **rehearsed on 2026-09-24 at `f3fe9281d`** — the transcript is at the bottom. A revert
that has never been run is a hope; this one was run, and the rehearsal found two things a plain revert gets
wrong (both are steps below, not footnotes).

**Read the trigger first.** Rolling back is a cost, and most things that look like a reason are not one.

## The trigger

Roll back when — and only when — one of these is READ, not suspected:

| reading | what it means |
|---|---|
| `npm run gate:isolation` fails on `main` for a package that is **usable on Linux** (not the `worker-fleet` decline, which is by design) | a tarball pnpm packed does not install or resolve for a stranger. That is the one thing the migration must not break |
| the release **dry run** is red at a step the migration touched (`pnpm install --frozen-lockfile`, the pack, or the `release-publish-rehearsal` hand-off that must show provenance on) | the publish path cannot run, and it is the one path that cannot be re-run |
| a fleet install fails on a machine whose lockfile and manifests AGREE (`corepack pnpm install --frozen-lockfile` exits non-zero on the lab or a Windows worker for a reason other than the lockfile refusal below) | the fleet cannot be brought to the commit CI tested |

**What is NOT a reason:**

- **A slower or faster install, or a disk figure.** The install was measured at ~5 s and the trees are hard
  linked from one store; if either moves, that is a row about the store, not a rollback.
- **`ERR_PNPM_OUTDATED_LOCKFILE`** on a PR that changed a manifest and did not regenerate `pnpm-lock.yaml`.
  That is `--frozen-lockfile` working — the lockfile is the specification — and the fix is `pnpm install` on
  that branch.
- **A `worktree` that refuses to install** because its `node_modules` is a symlink (`.pnpmfile.cjs`): that is
  the refusal doing its job; `rm node_modules` (the link), then install.
- **`gate:isolation` failing on `a11ign`'s exit code.** That was #2272 changing the no-page exit to 2 while the
  smoke asserted 1 (fixed in #2301). A gate reading is only a reason once you know which change it is about.

A trigger is posted on #57 and routed to `ceo` through `product-manager`; the rollback is a `ceo` decision, not
a session's.

## Step 0 — make the revert, in a linked worktree, as a PR

Never in the primary checkout (its hooks refuse commits there, and it drives the fleet).

```bash
git worktree add -b agent/pnpm-rollback ../wt-rollback origin/main && cd ../wt-rollback

# The merge commits of the five rows, NEWEST FIRST (table below). `-m 1` because each is a merge: keep the first parent.
git revert --no-commit -m 1 f3fe9281d b005213ad 05882ef5d 090d27677 8def5595e
```

| merge | row | what it moved |
|---|---|---|
| `f3fe9281d` | #2393 / #2301, pnpm 5/6 | the publish path; **deletes `package-lock.json`** |
| `b005213ad` | #2351 / #2298, pnpm 2/6 | CI installs and the cache |
| `05882ef5d` | #2345 / #2300, pnpm 3/6 | the `node_modules` symlink lore, hooks, hygiene doc |
| `090d27677` | #2353 / #2299, pnpm 4/6 | the lab's and the workers' installs |
| `8def5595e` | #2322 / #2297, pnpm 1/6 | the workspace, `.pnpmfile.cjs`, `pnpm-lock.yaml` |

Re-derive that list before trusting it — merges since `8def5595e` may add rows that touch the same files:
`git log --first-parent --oneline 8def5595e^..origin/main | grep -i pnpm`. A conflict means a later PR
edited a line the migration edited: resolve toward the pre-migration text for that hunk, and say so in the PR.

**1. Restore what the revert takes with it and is not migration.** #2301 also carried
`packages/cli/isolation-smoke.mjs` changing its expected no-page exit from 1 to 2 (the fix for #2272).
A plain revert puts the wrong `1` back, and **`gate:isolation` then fails on `a11ign` with
`got status 2`** — measured in the rehearsal, and it looks exactly like the trigger above and is not:

```bash
git checkout f3fe9281d -- packages/cli/isolation-smoke.mjs
```

If more merges have touched files the migration touched, read `git diff --cached` for anything that is not
about pnpm before committing — this is the class of thing the rehearsal exists to find.

**2. The lockfile.** The revert brings back `package-lock.json` **as it was when #2301 deleted it**. If any
dependency was added or moved in a manifest since, `npm ci` refuses:

```
npm ERR! code EUSAGE
npm ERR! `npm ci` can only install packages when your package.json and package-lock.json or npm-shrinkwrap.json are in sync. ...
npm ERR! Missing: left-pad@1.3.0 from lock file
```

Regenerate it and check the diff is only what manifests changed (rehearsed: one added dependency → a 7-line
lockfile diff, then `npm ci` passed):

```bash
npm install --package-lock-only --no-audit --no-fund
git diff --stat package-lock.json
```

At the rehearsal head no dependency had been added since the migration, so no regeneration was needed there.

**3. Verify, then commit.**

```bash
npm ci                                  # must succeed
npm run gate:isolation                  # every usable package ok; worker-fleet declines on Linux, by design
git grep -n -i -E "pnpm-lock|pnpm-workspace|corepack pnpm|pnpm install|\.pnpmfile" -- . ':!docs/pnpm-rollback.md'
                                        # must print nothing (it printed nothing in the rehearsal)
A11Y_COMMIT_ALL=1 git commit -m "revert(#57): back to npm"
                                        # ^ the pre-commit hook refuses more than 12 staged files, and a revert
                                        #   stages ~50. The breadth IS deliberate here; that is what the override is for.
```

Then it goes through the normal PR, not a hand merge. Its Acceptance must be commands that run in CI.

## Step 1 — each surface, AFTER the rollback has merged to `main`

The shape that matters: **`npm ci` deletes `node_modules` first, so it is clean over a pnpm-made tree;
`npm install` is additive and is NOT.** Measured (2026-09-24, same commit, own-install worktree):

| over a pnpm-made `node_modules` | result |
|---|---|
| `npm ci` | `added 229, removed 29`; 164 entries, **336 MB**, no `.pnpm` — identical to a fresh npm tree |
| `npm install` | works (`npm ls` reports the same 5 problems as a clean npm tree) but leaves `.pnpm`, `.modules.yaml`, `.pnpm-workspace-state-v1.json`: 164 entries, **529 MB**. None of the entries point into `.pnpm` any more, so the leftovers are dead weight and can be deleted |

**The primary checkout** — `npm run primary:update` (which, after the revert, sees `package-lock.json` move and
runs `npm install`, deliberately **never** `npm ci`: it would delete `node_modules` from under every worktree
still symlinked to it). Its `node_modules` was npm-shaped when this was written (`ls -a node_modules` showed
`.package-lock.json` and no `.pnpm`), in which case that is the whole procedure. If it has become pnpm-made:

```bash
ls -a node_modules | grep -E '^\.(pnpm|modules\.yaml|pnpm-workspace-state)'   # any hit means pnpm-made
npm run primary:update
P="$(pwd)"; rm -rf "${P:?}/node_modules/.pnpm" "${P:?}/node_modules/.modules.yaml" "${P:?}/node_modules/.pnpm-workspace-state-v1.json"
npm run build                                                                   # rehearsed: builds, 336 MB
```

**A linked worktree with its own install** (the default since #2300):

```bash
WT=/home/agent/repos/wt-NNNN                 # the worktree
git -C "${WT:?}" merge origin/main           # a branch that predates the rollback has no package-lock.json
rm -rf "${WT:?}/node_modules" && (cd "${WT:?}" && npm ci)
```

**A linked worktree whose `node_modules` is a symlink to the primary's** (the legacy population): nothing to do
once the primary is done. `.pnpmfile.cjs`, which refused a pnpm install through that link, is gone with the
revert, and the link resolves to the npm tree.

**The lab** (`tasks/run-job.yml`): after the revert it runs `npm ci` again on a changed pull. `npm ci` removes
the old tree itself, so no manual step. Confirm with a `lab:job` that installs (`npm run lab:status`).
*Not rehearsed on the lab host* (this row has Fleet: No); the mechanism is the `npm ci` row above.

**A Windows worker** (`deploy.yml` and the role's `nvda.yml`): the reverted step is
`npm install --prefer-offline --no-audit --no-fund`, which is the additive one, so **a worker that has run
the pnpm install needs its `node_modules` removed once first** or it keeps a pnpm tree beside npm's. Junction-safe,
exactly as the migration removed npm's:

```powershell
cd C:\Users\witness\a11y-witness
cmd.exe /d /c rmdir /s /q node_modules      # rmdir, not Remove-Item -Recurse: pnpm/npm links are junctions
```

then `npm run fleet:deploy` (it refuses a capturing worker; do not force it, and see `packages/control/CLAUDE.md`
for the hold). *Not rehearsed on a worker*: nothing here touched a Windows box. The removal command is the
migration's own (measured on `a11y-worker-2`, Node 24.20.0), mirrored; the first deploy after the rollback is
the rehearsal, and `fleet:status` afterwards is how to read it.

**CI and the Action** move with the revert (`ci.yml`, `reusable-*`, `release.yml`, `action.yml` all return to
`npm ci`). A cache keyed on `pnpm-lock.yaml` simply misses once and rebuilds under `package-lock.json`.

## What is IRREVERSIBLE, and stays so

- **A release published while pnpm was the resolver stays published.** Nothing here unpublishes it (npm allows
  an unpublish only inside 72 hours, and deprecating is not undoing). If a release was cut from the pnpm
  publish path, its tarballs are what consumers got, its provenance attestation is what it is, and the
  version number is spent. The rollback changes what the NEXT release is built with, and nothing before it.
- **The `packageManager` line, the store and the pnpm-made `node_modules` on machines that never ran a
  step above.** Harmless dead weight, but present until somebody removes them.
- **Time.** Between the migration and the rollback, `main` moved with a `pnpm-lock.yaml`; the rollback's
  regenerated `package-lock.json` is a NEW resolution, not the old one, when any dependency changed in that
  window. Pinned versions in manifests stay pinned; a `^` range may resolve to something newer.

## The rehearsal, pasted

Run 2026-09-24 by `worker-5` on a scratch branch (`scratch/pnpm-rollback-rehearsal-2302`, local, never pushed)
cut from `origin/main` at `f3fe9281d`, in a fresh worktree with no `node_modules`; Node 22.22.1, npm 9.2.0.
Nothing tracked was changed except the docs in this PR.

```
$ git revert --no-commit -m 1 f3fe9281d b005213ad 05882ef5d 090d27677 8def5595e
Auto-merging packages/control/ansible/README.md
Auto-merging package.json
                                                  # no conflicts; 53 files changed, 4203 insertions(+), 4085 deletions(-)
$ npm ci
added 229 packages, and audited 242 packages in 8s          # exit 0; prepare ran the build: "building 6 package(s)"

$ npm run gate:isolation                                    # FIRST RUN, straight after the revert: EXIT 1
skipping 5 private package(s): never published, so nothing installs them
  FAIL  a11ign  AssertionError [ERR_ASSERTION]: running the bin with no args should print usage and exit 1, got status 2
  ok    @a11ign/evidence ... ok @a11ign/judge ... ok @a11ign/nvda-worker ... ok @a11ign/pdf ... ok @a11ign/scorer
  SKIP  @a11ign/worker-fleet  cannot verify the host-capacity read on linux: it is macOS-specific by design ...
5/7 package(s) usable when installed, 1 declined on linux — run the gate on macOS for those

$ git checkout f3fe9281d -- packages/cli/isolation-smoke.mjs   # step 1 above
$ npm run gate:isolation                                    # SECOND RUN: EXIT 0
  ok    a11ign  a11ign works when installed: bin RUNS (exit 2, usage printed), 80 report lines, layers ordered; 1 bin(s) on PATH
  ok    @a11ign/evidence ... ok @a11ign/judge ... ok @a11ign/nvda-worker ... ok @a11ign/pdf ... ok @a11ign/scorer
  SKIP  @a11ign/worker-fleet  cannot verify the host-capacity read on linux ...
6/7 package(s) usable when installed, 1 declined on linux — run the gate on macOS for those

$ npm ci        # with `left-pad@1.3.0` added to packages/pdf/package.json and the lockfile untouched (step 2)
npm ERR! Missing: left-pad@1.3.0 from lock file
$ npm install --package-lock-only --no-audit --no-fund      # package-lock.json | 7 +++++++
$ npm ci        # exit 0; node_modules/left-pad present
```

**The figure "6/6" in the row's Done-when is stale, and this page does not claim it.** The gate now counts seven
publishable packages, and `worker-fleet` declines on Linux by design, so
the reading on Linux is **6 of 7 usable, 1 declined**; "6/6" is what a Linux host that skips the seventh
would have said. Run the gate on macOS for the seventh.

**What the rehearsal did NOT cover:** the test suite on the reverted tree (only the Acceptance's three commands
and the grep above); any Windows worker or the lab host (Fleet: No); a release dry run on the reverted
workflow; and a primary checkout that has actually become pnpm-made (its shape was read, not converted).
