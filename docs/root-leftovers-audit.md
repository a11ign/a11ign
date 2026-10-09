# Audit of `a11ign/a11ign`'s root leftovers against the layout standard (#4235)

**An audit, not a move.** It proposes and moves nothing; `ceo` rules on any move, and a move is a later row filed by `product-manager`.
The standard is ADR 0043 decision 7 ([`docs/adr/0043-one-toolchain-for-every-repository.md`](./adr/0043-one-toolchain-for-every-repository.md)):
*a single-package repository has its package at the root; a multi-package repository exists only when it publishes more than one package, and each
directory is named after its package.* Its layout check fails on four things (a workspace of one, a directory not named for its package, a second
README for one package, leftovers of a layout that is gone).

**Provenance.** Read at `a11ign/a11ign` `bbedfa8b4` (`origin/main`) and `a11ign/agent-org` `0bb1e23`, on 2026-10-08, by `git grep` over tracked
files and by reading the lines each grep named. These are readings at a moment: re-run the commands before quoting a count. A reader is **found**
when a tracked file at the cited line names the leftover; a consequence of a move is **read** from that code and was **not run**, because the audit
moves nothing, and each says which below.

## Summary

| leftover | what it is | the standard says | proposal | cost of the proposal |
|---|---|---|---|---|
| `.agent-org` | the org tool's project declaration, roles, units | nothing (not package layout) | **keep** | 0 rows |
| `.claude` | Claude Code's project rules and skill | nothing; the location is the platform's | **keep** | 0 rows |
| `PLAN.md` | the release backlog document | nothing (a root document) | **keep**; a move to `docs/` is cosmetic and is *optional* | 0 rows, or 1 if `ceo` wants it |
| `layers.json` | the one list of laid layers | nothing, but its `path`s are where the check would trip | **keep** at the root | 0 rows |
| `packages/judge/CLAUDE.md` | area rules for two judge files | nothing; the nested-`CLAUDE.md` split (#1240) puts it here | **keep** | 0 rows (one link to add, see its section) |

And for the repository as a whole: **it is multi-package in the standard's sense (four published packages), and one check, the directory name of
`packages/cli`, fails as written.** Section [the repository as a whole](#the-repository-as-a-whole) puts the adoption question to `ceo`, with a
recommendation.

## `.agent-org`

**What it is.** The org tool's per-project directory: `project.json` (which repositories and board, the `dora` list, the unit list, the roles
directory), `host.json` (the machine's facts), `failure-classes.json`, `chairman-milestones.json`, `plugins/causes.ts`, `roles/` (the briefs,
`sessions.json`, `memory/`) and `units/` (the 14 systemd units this project owns). **What the standard says about a file like it:** nothing; the
standard is about where a package lives. It is the same kind of thing as `agent-org`'s own root, which the standard calls the model and which
holds no such directory because it IS the tool.

**Who reads it** (found by `git grep -F '.agent-org'`: 48 tracked files here, 56 non-test source files in `agent-org`):

- *The tool, which hard-codes the path.* `agent-org` `src/project-config.mjs:26` (`PROJECT_DECLARATION_PATH = ".agent-org/project.json"`),
  `:256` (joined to the root), `:332-334` (the refusal when it is absent); `src/host-config.mjs:26` (`.agent-org/host.json`);
  `src/class-repeat.mjs:15` (`failure-classes.json`); `src/cause-declaration.mjs:41` and `:98` (the plugin); `src/ci-health-liveness.mjs:301`;
  `src/host-units.mjs:73` (`PROJECT_UNITS_DIR`) and `:136`; `src/messaging/config.mjs:23`. The project root is the git top level that contains the
  file (`project-config.mjs:329-334`), so the tick, the gate and every `agent-org` command find the project by this directory.
- *The host.* `.agent-org/host.json` is the host declaration `scripts/agent-org-newest-tag.ts:69` and `scripts/verify.ts:501` read for the tool's
  checkout; `beforeTick` (`project.json`) runs in this checkout before each tick.
- *CI.* `.github/workflows/nightly.yml:280` reads `.agent-org/project.json` for the repository list and `:282` fails with `CANNOT_TELL` without it.
- *Guard tests.* `packages/guards/src/dora-declaration.test.ts:27`, `layer-repository-protection.test.ts:49`, `branch-protection.test.ts:439`
  (all `project.json`); `role-files-no-standing-cron.test.ts:18` (`roles/`); `scripts/doc-checks/roles-readme.ts:9` and `roles-memory.ts:9`.
- *The test selector.* `scripts/rstest/rstest.config.ts:41-42` (`.agent-org/roles/**`, `.agent-org/units/**`) and about 20 further file triggers
  (21 hits in the file), so a change here runs the tests that read it.
- *The release rule.* `scripts/release-reads-qualification.ts:83` lists `^\.agent-org\/` and `^\.claude\/` among the paths that do NOT make a
  release.
- *The layer-edges baseline.* `packages/guards/layer-edges.baseline.json:3` records `.agent-org/project.json` naming `packages/control`.
- *People:* every engineer is sent to `.agent-org/roles/engineer.md` by `wake.mjs`.

**What a move would break, and how I know.** The tick and the gate: with the file absent at the git top level `installedProject` throws
`ProjectDeclarationRefusal` (`project-config.mjs:332-334`), which is the `agent-org-gate-reads-project-main` hazard in the row. **Read, not run:** I
did not run a tick against a checkout without the file, since that would touch the shared org. Also broken by the same move: `beforeTick`, the 14
host units (`PROJECT_UNITS_DIR`), `nightly.yml:280`, three guard tests and two doc checks; and, silently, `release-reads-qualification.ts:83`,
which would start counting edits to the moved files as releasable. The tool's path is a constant, so a move is a tool release plus a pin here,
not an edit here.

**Proposal: keep where it is.** Reason: it is not a package-layout leftover; the path is a contract with a tool in another repository, and moving it
needs that repository first. **Cost: 0 rows.** If `ceo` wanted it renamed, the order is `agent-org` accepts both paths, then this repository
moves, then the old path is dropped: three rows and a window in which the gate can go red.

## `.claude`

**What it is.** Seven tracked files: six rules (`.claude/rules/*.md`) and one skill (`.claude/skills/wcag-criterion-check/SKILL.md`). Beside
them sit three untracked entries that are ignored on purpose: `settings.local.json` (ignored by the user-level git ignore),
`scheduled_tasks.lock` and `worktrees` (both in `.git/info/exclude`), so they are not repository content. **What the standard says:** nothing.

**Who reads it.**

- *Claude Code, by location.* It loads `.claude/rules/` and `.claude/skills/` from the project root by itself; that location is the platform's
  and is not a path any file here declares. This is the reader that matters, and it is the one `git grep` cannot find.
- *Tests and scripts that read it by path:* `packages/judge/src/criterion-audit.test.ts:34` (the skill), `scripts/rstest/rstest.config.ts:43` and
  `:81-82` (the rule files, as test triggers), `packages/guards/src/layer-repository-protection.test.ts:32` and `role-files-no-standing-cron.test.ts:4`
  (cite the rules), `scripts/release-reads-qualification.ts:83` (non-releasable path).
- *Prose:* 23 tracked files cite `.claude/`, among them `CLAUDE.md` and several `.agent-org/roles/*.md` briefs, which send readers to the rules by name.
- *Agent-org's own code names the rules in comments and in `src/packaging/rules-files.ts:19` (`RULES_DIR = join(HOME_CHECKOUT, ".claude/rules")`),*
  which is a reader in code: that test module reads this directory.

**What a move would break.** Nothing would go red, which is the danger: Claude Code would stop loading the six rules for every session that works
in this repository, and no test asserts that it loads them. I know this from the platform's documented location, not from a trial. The tests above
would fail on the path, and `rules-files.ts:19` too, but the session-level loss is silent.

**Proposal: keep.** The location is the platform's, not ours. **Cost: 0 rows.** (A neighbouring fact for `ceo`, not a proposal: the 20,000-byte budget
the rules state for themselves, #2217, has no test that I found; I looked for one by `git grep` on the number and on `.claude/rules` in
`packages/` and `scripts/` and found none, which is *could not find*, not *there is none*.)

## `PLAN.md`

**What it is.** A 1,152-line document, "the road to a general release": the backlog for one thing, the blockers and the risks. `docs/history-2026-08.md`
holds what was archived out of it. **What the standard says about a file like it:** nothing. The four failures are about packages, workspaces and
READMEs; a root document is outside them, in the company of `README.md`, `CONTRIBUTING.md`, `SECURITY.md`, `RELEASE.md` and `CLAUDE.md`.

**Who reads it** (`git grep -c 'PLAN\.md'`: 29 tracked files, 50 hits, most of them prose in `docs/`):

- *Code and config that name it:* `scripts/ci-changed.ts:92` (`DOC_ROOT_FILES` decides which diffs are documentation-only), pinned by
  `packages/guards/src/ci-changed.test.ts:93` (the exact five names, sorted); `scripts/doc-checks/doc-references.ts:15` (`DOCS`, the documents
  whose cited paths are checked); `scripts/rstest/rstest.config.ts:107` (a file trigger).
- *Documents that link or cite it:* `CLAUDE.md:27`, `README.md:535`, `packages/README.md:3`, `.gitignore:40`, `.github/workflows/release.yml:4`, and
  about 15 files under `docs/` (for example `docs/outsider-runs.md:3`, `docs/reliability-plan.md:435`, `docs/not-working.md:533`); five source
  comments (`packages/guards/src/isolation-gate.ts:662`, `packages/judge/src/act-rules.ts:201`, among them) cite it by section name.
- *A person:* the chairman's records point at its "UPDATE" entries (`docs/outsider-runs.md:47`).

**What a move would break.** Not a gate: `ci-changed.test.ts:93` pins the five-name list and would fail on a rename of the entry, and
`doc-references.ts` would report each stale `./PLAN.md` link in the nightly cross-reference report (that check no longer runs on a pull request,
#954). The rest is stale prose in about 29 files. **Read from the grep, not tried.** A trial move in a scratch copy was not run: a worktree has no
`node_modules`, and the readers are in the greps above.

**Proposal: keep at the root.** Reasons: nothing in the standard objects; it is read by name in `CLAUDE.md` and `README.md` as the entry to the
release plan; and a move buys a tidier root at the price of 29 files of churn. **If `ceo` wants the root to hold only the entry documents**, the
move is `docs/plan.md` in ONE row whose diff is the rename, the five code lines above and the prose (about 29 files), with `ci-changed.test.ts:93`
updated in the same PR. **Cost: 0 rows to keep, 1 to move.** One honest note from the file itself: its header says it is the backlog for general
release and `docs/architecture-audit.md:644` records that three documents describe themselves as the plan or backlog (`docs/backlog.md:3` among
them). Whether `PLAN.md` should be retired into the history record is a different question from where it lives, and it is `ceo`'s.

## `layers.json`

**What it is.** The one list of the layers that live in their own repositories and are laid or cloned into this tree: `layers` (`nvda-worker`,
`screenreader-fleet`) and `pinned` (`lab` at `v0.1.7`, `control` at `v0.1.12`). Its own comment says it sits at the root on purpose: *a file
inside a directory that is laid and untracked cannot pin its own tag* (#3506). **What the standard says about a file like it:** nothing directly.
It does bear on the check, below.

**Who reads it** (`git grep -c 'layers\.json'`, outside `docs/`: 22 files):

- *Code that opens it:* `scripts/lay-layer.ts:261` (`main`, the one writer of laid trees), `:220` and `:249` (the copy it writes into `control`
  as `declares`); `packages/guards/src/isolation-gate.ts:560-577` (`LAYERS_JSON`: which directories the isolation gate leaves out, and it throws
  on an unreadable file); `scripts/test-support/stamp-files.ts:18`; `scripts/ci-changed.ts:429` (a change to this file runs the `ansible` job).
- *Callers of `lay-layer.ts`, so indirect readers:* `package.json:30` (`build`) and `:32` (`prepare`), which run it for `control`, `nvda-worker`,
  `screenreader-fleet` and `lab`; `.github/workflows/ci.yml:225` and `action-smoke.yml:38`.
- *Workspace:* `pnpm-workspace.yaml:6-10` excludes each declared layer path from `packages/*`, and `packages/guards/src/pnpm-workspace.test.ts:118-125`
  derives that list from this file.
- *In another repository:* the laid `packages/control/layers.json` is a byte copy of this one, which `control`'s `fleet:deploy` hasher and the
  Ansible plays read; `packages/guards/src/control-delete.test.ts:339-340` asserts the two are identical.
- *Guard tests:* `control-delete.test.ts` (18 hits), `lay-layer.test.ts` (11), `isolation-gate-layers.test.ts` (6), `lab-delete.test.ts` (5),
  `ci-changed.test.ts:165,410,496`, `worker-fleet-delete.test.ts`, `screenreader-worker-extraction.test.ts`, and 19 lines mentioning it in
  `packages/guards/layer-edges.baseline.json:14-17`.
- *Config:* `.c8rc.json:21-22`, `.gitignore:75,83`, `scripts/rstest/rstest.config.ts:144`.

**What a move would break.** `lay-layer.ts` (so `pnpm install`'s `prepare` and `pnpm run build`, on every checkout, host and CI job), the
isolation gate, `control`'s copy and with it `fleet:deploy` and the Ansible plays, and four to six guard tests. A move out of the root re-opens
the reason in its own comment (#3506). **Read, not run.**

**Proposal: keep at the root.** **Cost: 0 rows.** **What the audit adds for the layout check (the point of this section):** `layers.json` is
the reason the check cannot walk the working tree. It declares `packages/nvda-worker` (holding `@a11ign/screenreader-worker`) and
`packages/worker-fleet` (holding `@a11ign/screenreader-fleet`), so a check reading directories by name would report both as failure 2 on any host
or CI job that has run `pnpm install`; they are untracked, laid, and not members of this repository. The check must read **tracked files**
(`git ls-files`), or it fails on a checkout and passes on a clean clone.

## `packages/judge/CLAUDE.md`

**What it is.** Fourteen lines of area rules for `packages/judge/src/rules.ts` and `criterion-coverage.ts`, moved out of a retired role brief
(#2406) so they load for whoever edits those files. It is one of three `CLAUDE.md` files in the tree (the root, `.github/CLAUDE.md`, this one).
**What the standard says:** nothing; area rules living beside the code in a nested `CLAUDE.md` is the shape #1240 chose
([`docs/operational-lessons.md#the-nested-claudemd-split`](./operational-lessons.md#the-nested-claudemd-split)).

**Who reads it.** *Claude Code, by location*: it loads a nested `CLAUDE.md` when a session works under that directory. **No tracked file names it**:
`git grep -nE 'packages/judge/CLAUDE\.md|judge/CLAUDE'` prints nothing. No guard enumerates nested `CLAUDE.md` files either (the `CLAUDE.md`
walkers I found, `scripts/doc-checks/claude-md-links.ts` and `doc-citation-integrity.ts:41`, read the root one and `docs/*.md`). The root
`CLAUDE.md` table "Where else to look" lists the nested files of `control`, the worker, `lab` and `.github`, and **not this one**.

**What a move would break.** Nothing red, and the rules would stop loading for judge edits unless the file stays under `packages/judge/`. It names
`rules.ts` and `criterion-coverage.ts` and `criterion-coverage.test.ts`, which stay put. It is not in the way of any layout: a move of the package
itself is not proposed, since `judge` is one of four published packages.

**Proposal: keep.** **Cost: 0 rows to keep.** *Out of this row's Region, so reported rather than edited:* the root `CLAUDE.md` table omits it, which
is one row on the table's side (a prose edit to `CLAUDE.md` goes to `ceo`). The reading is *not found in the table*, not *deliberately omitted*.

## The repository as a whole

**Is `a11ign/a11ign` multi-package in the standard's sense?** Yes. The predicate is *it publishes more than one package*. Read from each
`packages/*/package.json` (`name`, `private`, `publishConfig`) on 2026-10-08:

| directory | package | published | directory = package name |
|---|---|---|---|
| `packages/cli` | `a11ign` (0.2.7) | yes, `access: public` | **no**: the standard's form puts `a11ign` in `a11ign/` |
| `packages/evidence` | `@a11ign/evidence` (0.2.0) | yes | yes |
| `packages/judge` | `@a11ign/judge` (0.2.3) | yes | yes |
| `packages/scorer` | `@a11ign/scorer` (0.2.1) | yes | yes |
| `packages/guards` | `@a11ign/guards` (0.0.0) | no, `private: true` | yes |

Four published packages, so it is multi-package and the single-package form does not apply. `guards` is private and does not count toward the
predicate. The workspace's other four paths (`!packages/nvda-worker`, `!packages/worker-fleet`, `!packages/lab`, `!packages/control`,
`pnpm-workspace.yaml`) are layers in other repositories, not members.

**The four checks, as the ADR words them:**

1. **A workspace with one package:** passes. Five members resolve (`cli`, `evidence`, `guards`, `judge`, `scorer`).
2. **A directory not named for its package:** **fails on one directory, `packages/cli`**, which publishes `a11ign`. The other four match. (The
   row asked for this check and it is the defect.) The two laid directories above would also fail if the check read the working tree.
3. **A second README for one package:** passes. Each of the four published packages has its own README, and the root `README.md` is the repository's
   page, not the npm page of any package. Measured: the root `README.md` (574 lines) and `packages/cli/README.md` (158 lines) share 4 of the 109
   distinct non-blank lines of the latter, by `sort -u` and `comm`; they are different documents. One thing the check should know: `packages/README.md`
   is a fifth README, about the directory and not a package, and its table is stale (it lists `nvda-worker`, `worker-fleet` and `pdf`, which left,
   and names the scorer `@a11ign/screenreader-scorer` where its `package.json` says `@a11ign/scorer`). It is not failure 3, and it is a row of
   its own, out of this row's Region.
4. **Leftovers of a layout that is gone:** passes. There is no `lerna.json`; `.changeset/config.json` has `ignore: []` and lists no packages; the
   root `package.json` is `a11ign-monorepo`, `private`, which a multi-package repository needs; `packages/` holds five packages.

**What renaming `packages/cli` to `packages/a11ign` would cost** (measured by `git grep -c 'packages/cli'` at `bbedfa8b4`): 37 tracked files and 71
hits outside `packages/cli/` and `docs/`, 21 files and 70 hits under `docs/`, and 16 files and 26 hits inside it. The non-prose users include
`action.yml`, `package.json`, `.github/ISSUE_TEMPLATE/backlog-row.yml`, `scripts/ci-changed.ts`, `scripts/product-home.ts`,
`scripts/rstest/rstest.config.ts`, the auth-leak scripts, the layer-edges baseline and a dozen guard tests. `.agent-org/project.json`'s `dora`
`releasablePaths` also names `packages/cli/`, and `agent-org`'s DORA reader reads that. The cost is one row, large, and it touches `action.yml`,
which the published action pins.

**Question for `ceo`, with a recommendation.** *Should row 2's layout check adopt on `a11ign/a11ign`, and with what exception?*
**Recommendation: adopt it, in three parts.**

1. **Adopt**, because an outside evaluator reads this repository first and it passes three of four checks without change.
2. **Read tracked files only** (`git ls-files`), so the laid layers (`packages/nvda-worker`, `packages/worker-fleet`, and `lab` and `control` when
   laid) are never judged. This is not an exception to the standard; it is what "this repository's packages" means.
3. **For `packages/cli`, take the stated departure and do not rename now.** The ADR allows a departure when a README says why, in one sentence under
   its first heading; the root `README.md` has no such sentence yet. The reason is true and checkable: `a11ign` stays unscoped so `npx a11ign`
   needs no wrapper (`packages/README.md`'s `a11ign` row, ADR 0036), `cli` names what the directory is for, and the rename is the largest row
   in this audit (about 170 hits in 74 files) for a change no user of the package can see. If `ceo` rules the other way, the rename is that one
   row and the check passes with no exception.

Two points of caution on the recommendation. The departure sentence is a prose edit to the README, whose claim block states what the product claims, which is `ceo`'s.
And the ADR's departure wording is written for the private-second-package case; extending it to a directory name needs `ceo`'s word that it applies.

## The sweep: the declared repositories

`.agent-org/project.json` `code` declares nine repositories. The row's eight were read by `product-manager` and `ceo` (six by the flatten rows,
`agent-org` on 2026-10-08, `a11ign/a11ign` here). Repeated for the one the row named as pending: **`a11ign/.github`** (#4190, in `code` now). Its
tree at `HEAD` is `.github` and `README.md`, with a `chainguard` entry under `.github` (read with `gh api repos/a11ign/.github/git/trees/HEAD` and
`.../contents/.github`); no `package.json`, no workspace file, no `packages/`. **Passes: it has no package, so no check applies.** Not re-read here:
the other seven, since the row assigns them to the flatten rows and `agent-org`'s reading is the row's.

## What this audit did not do

It moved nothing and changed no file but this one. It did not run a tick, `fleet:*` or `lab:*` (the resource ban), and it did not run a trial
move; every "would break" above is **read** from the greps, with the line cited, except the `.claude` loading, which is read from the platform's
documented behaviour. Counts are `git grep` counts at the commits named at the top; a count in a row is a reading at a moment.
