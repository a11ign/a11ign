# ADR 0045: a repository uses another only through its published package, at a declared version

## Status

**Proposed, 2026-10-09.** Row #4439, phase 1 of epic #4425. The rule is **decided** (the chairman, 2026-10-09, in the epic: "every package keeps
to its own concern; a repository uses another only through its published package, at a declared version"); the graph and the contributor
contract are the epic's, written down here so that a crossing has to be argued against a record. `ceo` reviews. **It changes no code in any
repository.** The rows that do are the epic's phases 2 to 4; this ADR's Consequences say which.

**Measured on 2026-10-09**, a11ign at `27f3d6dd8` (this ADR's commit changes only `docs/adr/`, so every a11ign reading below holds at it), and
the other repositories at their `origin/main` after `git fetch`: screenreader-fleet `db1afe3`, screenreader-worker `0b1e8e1`, lab `90debb8a`,
control `0952e84`, toolchain `2a71923`, documents `8c3bbec`; agent-org at its newest stable tag `v0.92.2` (`4ee601b`). **A reading is a moment:**
every command can be re-run, and a number quoted from here without re-running it is a quotation.

## Context

**The dependency rule was never written down, so every crossing so far was an exception nobody had to defend.** The repositories left the
monorepo (ADR 0039, 0040) and the code did not leave with them: a11ign still reads four other repositories' source out of its own tree, runs
one repository's code in its CI, and imports the tool's modules by path. [ADR 0036](./0036-the-layer-model.md) says which package may claim a
layer of evidence and [ADR 0004](./0004-package-boundaries.md) says what a package exports; neither says how one **repository** may use another.
`packages/guards/layer-edges.ts` refuses a reach between the six in-tree layers that its baseline does not name, and the baseline is the only
place the cross-repository ones are recorded: as **accepted**.

### The measured coupling

Each row is the epic's item of the same number, re-measured, with the command that shows it. The epic's own counts differ in two places (items
3 and 5); the difference is the pattern each count used, named in the row.

| # | What | Command, and what it printed |
|---|---|---|
| 1 | **`pnpm install` copies source from four repositories into a11ign's tree.** `prepare` lays `control`, `nvda-worker` (screenreader-worker), `screenreader-fleet` and `lab`; the four paths are untracked. | `grep '"prepare"' package.json` names `lay-layer.mjs control`, `nvda-worker`, `screenreader-fleet`, `lab`. `node -e 'const l=require("./layers.json");console.log(Object.keys(l.layers).length,Object.keys(l.pinned).length)'` prints `2 2`. `git check-ignore packages/lab packages/control packages/nvda-worker packages/worker-fleet` prints all four (`.gitignore` lines 70, 73, 76, 85). `git ls-files packages \| cut -d/ -f2 \| sort -u` prints `README.md cli evidence guards judge scorer`: none of the four is tracked. |
| 2 | **The product's CI runs `lab`'s code.** `lab` is `private` and unpublished, and laid by tag `v0.1.14`. | `grep -n '"rules-check"\|"docs:coverage"' package.json` prints `tsx packages/lab/src/eval/rules-check.ts` and `tsx packages/lab/scripts/generate-coverage-doc.ts`. `grep -n 'run: pnpm run rules-check\|run: pnpm run docs:coverage' .github/workflows/*.yml` prints `ci.yml:274` (the `rulesFitness` job) and `reusable-build-test.yml:102`; `scripts/verify.mjs` runs both. |
| 3 | **a11ign imports agent-org's modules by path, and every CI job clones its newest tag, unpinned.** | `git grep -l -E '\b(toolModule\|toolPath)\(' \| wc -l` prints `17` (the epic counted 18; the epic's example paths under `src/lib/` and `src/project-config.mjs` are not at this commit, the callers are `scripts/*.mjs` and `packages/guards/src/tree-wide-guards.ts`). `git grep -c agent-org-newest-tag -- .github/workflows` sums to `36` occurrences in `16` of the `18` workflow files; the script's header says "Nothing is cached between runs, so a release at ANY minor is what the next run executes". |
| 4 | **`control` holds a copy of a11ign's `layers.json`** and deploys laid source. | `git -C <control> grep -l layers.json origin/main -- src \| wc -l` prints `13`. `layers.json` `pinned.control.declares` is `"layers.json"`: `lay-layer.mjs` WRITES a11ign's copy into the laid `packages/control/`. |
| 5 | **agent-org is declared project-agnostic (ADR 0040) and is not.** | At `v0.92.2`: `git -C <agent-org> grep -l -i 'a11y-witness' v0.92.2 \| wc -l` prints `48`; the same minus tests, fixtures, `docs/` and `*.md` (`\| grep -v -E '\.test\.\|fixtures\|^[^:]*:docs/\|\.md$'`) prints `15`. With the wider pattern `-E 'a11y-witness\|a11ign/a11ign\|a11ign-bot\|\.a11ign'` it prints `337`. The epic's "about 150 files, 21 non-test" used a pattern it does not state, so it is not reproduced here. The repository has `724` tracked files (`git ls-files \| wc -l`). |
| 6 | **Declared versions are stale.** | The pins, from git: `git -C <screenreader-fleet> show origin/main:package.json` declares `@a11ign/judge 0.1.0`, `@a11ign/screenreader-worker 0.1.0`, `@a11ign/evidence 0.1.0`; a11ign's `package.json` declares `@a11ign/screenreader-worker ^0.5.0` (and `pnpm.overrides` pins it to `0.5.0`) and `@a11ign/evidence 0.2.0`. The current versions, from the registry at this moment (`npm view @a11ign/<name> version`): `evidence 0.3.0`, `judge 0.4.1`, `scorer 0.3.1`, `screenreader-worker 0.8.0`, `toolchain 0.3.3`. The registry half moves with every release; the pin half does not. |
| 7 | **The crossings are baselined, not removed.** | `node -e 'console.log(require("./packages/guards/layer-edges.baseline.json").length)'` prints `31`: `packages/lab` 12, `packages/control` 6, `packages/worker-fleet` 9, `packages/nvda-worker` 3, `packages/agent-org` 1. |

Clean, as the epic found: `screenreader-worker`, `documents` and `toolchain` reach other repositories only through declared `@a11ign/*`
packages.

### What a contributor meets

CI decides what a stranger can do. The checks a pull request meets are the org's process, built for agents, and an outsider meets all of it:
a body block that must parse, a sign-off of paths, a sweep of about 24 guards, a second run that must agree with the first. The contributor
contract below says which of those stay.

## Decision

### DECISION 1: the rule

**A repository uses another only through its published package, at a version it declares.** Concretely:

1. **Declare it.** The other repository's code arrives by a dependency declared in `package.json` and the lockfile, at a version the
   consumer chose: an `@a11ign/*` registry entry, or a pnpm git dependency pinned to a tag or commit (`github:<owner>/<repo>#<tag>`,
   [Amendment 2026-10-15](#amendment-2026-10-15-agent-org-is-not-published-under-a11ign-and-a11ign-stops-needing-it)). A caret that
   follows a new release is a declaration; a branch, a tag cloned in CI, or "newest" is not.
2. **Never read its source.** No `git clone`, `git archive`, submodule, laid copy, or relative or absolute path into another repository's
   tree, at install, in CI, or in a test. If the package does not export what a consumer needs, the **producer** exports it (a pull request
   there, then a release), and the consumer bumps.
3. **Never hold a copy of its declarations.** A file one repository owns is not copied into another (`layers.json` in `control`).
4. **No project names in a tool.** A tool repository (`agent-org`, `toolchain`) is configured by the project that uses it and contains no
   project's names outside configuration and fixtures.
5. **The graph is acyclic.** A new edge is a change to this ADR, not to a baseline.

**There are no exceptions.** An exception nobody has to defend is how the 31 got there.

### DECISION 2: the target graph

An edge `A -> B` means "A declares B at a version". The graph is **acyclic**: it has a topological order, and the order below is one.

```
toolchain                       dev configuration only; every repository depends on it, it depends on none
evidence    -> toolchain
scorer      -> evidence
judge       -> evidence, scorer
cli         -> evidence, judge, scorer          (the product: a11ign)
screenreader-worker -> evidence                 (as declared today)
screenreader-fleet  -> screenreader-worker, judge, evidence
lab         -> cli (the product), screenreader-fleet     by version; the product NEVER uses lab
control     -> screenreader-worker, screenreader-fleet   deploys PUBLISHED versions to hosts; no laid source
agent-org   -> toolchain                         and nothing else; each project configures it (host.json, project.json)
```

The first nine lines are the epic's graph with the edges the repositories already declare filled in (`packages/{scorer,judge,cli}/package.json`
and the worker's and fleet's `package.json`). **Three edges are declared today and the epic's graph does not list them.** This ADR does
not rule on them; `ceo` does, in review. All three are by version, and none makes a cycle:

- **a11ign's root `dependencies`** declare `@a11ign/screenreader-worker` and `@a11ign/screenreader-fleet` (`package.json` lines 168 to 169).
  `packages/cli` does not (`packages/cli/src/cli.ts:1391`: "NOT a dependency of this one"). Proposed: they are the **repository's** runtime for
  the action and the host, a product-to-worker/fleet edge that the graph should name.
- **`lab` declares `@a11ign/control`** (`git -C <lab> show origin/main:package.json`). Proposed: keep, as `lab -> control`; the reverse
  never exists.
- **`lab` declares `@a11ign/screenreader-worker ^0.1.0`**, the stalest pin in the table above.

### DECISION 3: the 31 accepted crossings shrink and are never added to

`layer-edges.baseline.json` is read as a **debt ledger, not a permission**. Each of its 31 entries goes when the crossing it records is
replaced by a published-package form (epic phase 3); none is added. The file is deleted when it is empty (epic done-when 2). Until the
phase 2 boundary check lands, `layer-edges.test.ts` keeps refusing an edge the baseline lacks, and a pull request that adds an entry says so
in its body and is refused in review.

### DECISION 4: the contributor contract

The audit of each pull-request check, as an outsider meets it, and the verdict. "Agent PRs" means PRs from the org's bot accounts or `agent/*`
branches: **the org keeps its process, and an outside PR never meets it.**

| Check | Verdict |
|---|---|
| `changed`, `ts`, `python`, the merge queue | **Keep** (standard). `ts` tests product packages only. |
| `changeset` | **Keep.** Replace the `no-release:` body line with an empty changeset (`changeset --empty`), the tool's standard. |
| `rulesFitness` | **Keep** as a product-quality check, once it no longer needs `lab`'s source. |
| `acceptance` (runs bash from the PR body; fails with no block) | **Agent PRs only.** |
| `ownedPaths` (body sign-off of paths) | **Agent PRs only** (amended 2026-10-16, below). Was: replace with CODEOWNERS review. |
| `deliberateRefusals` (merge-guard, Closes format) | **Agent PRs only.** |
| `guardSweep` (about 24 org guards) | **Move what matters into ESLint rules; the rest is agent PRs only.** |
| `board` | **Move to agent-org.** |
| `ansible` (checks control's playbooks inside a11ign) | **Delete;** `control` checks its own. |
| `gate`'s second-run agreement (#3211) | **Drop:** a description or label edit must never change a verdict. |
| `auto-arm` | **Agent PRs,** or opt-in by label. |

**Amendment 2026-10-16 (ceo ruling on a11ign#5549, option 2): `ownedPaths` moves to the org side as an agent-PR check, and there is no CODEOWNERS
replacement.** The row above named a reviewer that does not exist: `CODEOWNERS` has no entry on purpose (an App cannot meet a code-owner review,
a11ign#4981; the chairman's direction on #5044 is no more machine accounts than GitHub's terms allow) and `require_code_owner_review` is false on
`merge-queue-main`. An outside PR over a path of `docs/owned-path-facts.json` therefore meets no code-owner request and no sign-off block. It is
still not unguarded: it reaches `main` only through the merge queue's required approving review (`main-review-requirement`, a11ign#2022), which
this amendment does not change. The job is not deleted with this paragraph: its receiver is agent-org's own check over the same file
(a11ign/agent-org#1598), which runs in shadow beside the job first and lets the job go only after a clean reading (epic a11ign#5602, a11ign#5549).

Also: the git hooks `prepare` installs are opt-in and never block normal git use (for example an unlabelled `git stash`); the PR template is
short and opens with "what changes and why"; `CONTRIBUTING.md` describes every check a contributor can meet. Anyone, human or AI, can contribute
by following `CONTRIBUTING.md` alone.

## How a host launches and the core reads a layer

**Ruled by `ceo` on a11ign#5075 (2026-10-11), and landed in the order it names.** Each answer is Decision 1 rule 2 with no exception: a
repository reads another only through its published package, and where the package lacks what a consumer needs, the producer exports it.
Where that meets ADR 0039 item 6's host-side second checkout, this section overtakes item 6. Each answer names the cut that made it true.

1. **Worker.** The host launches the published worker bin, `a11ign-nvda-worker`, and the core lays nothing from `screenreader-worker`: the
   root `worker` script runs the installed `node_modules/@a11ign/screenreader-worker/dist/server.mjs` (`package.json`), and the provision
   stamp hashed the published `launcher/run-server.cmd` instead of the laid `src/run-server.cmd` (cut 6, #5084, `959ebfe0e`). The helper
   that computed the stamp went with `layers.json` in cut 9 (#5087, `23a179418`).
2. **Fleet.** `guest-run` and `normalise-fleet` are bins of `@a11ign/screenreader-fleet`, and the core runs the installed
   `a11ign-guest-run` and `a11ign-normalise-fleet` through `guest:run` and `fleet:normalise` (`package.json`); it lays none of the fleet's
   `src/` (cut 4, #5082, `cc4dd7e09`).
3. **Control and lab.** The core reads neither and adds no edge into either. `docs:coverage` left the core with lab's source (cut 2, #5080,
   `7d1bb7b04`); the lab-held gates are refused by `gate:lab-held` (`package.json`), which says to run them from the lab's checkout, so the
   core reads nothing there. Control stays private, deployed from its own checkout on the control plane, and the core names no path into it
   (cut 8, #5086, `13c279d8d`). The ruling's first draft moved `rules-check` to lab's CI; #4936 moved the product's own cases into the core
   instead, so `rules-check` runs from `packages/judge/src/fitness/rules-check.ts` and needs no edge.
4. **Order, each cut one row with one revert:** lab (cut 2), fleet (cut 4), worker (cut 6), control (cut 8), then the row that makes
   `prepare` lay nothing and deletes `layers.json` (cut 9). `control` deploys published versions and could not be cut before the fleet and
   the worker exported what it needs, which is why it came after them.

## The lab's own baseline of its reaches (ruling proposed on #5436)

`lab` keeps `baselines/layer-edges.baseline.json`: the reaches it makes by path into this repository's tree, each with a disposition (`checkout-path`, `by-name`, `moves-with:<layer>`) and a reason. Its `layer-edges.test.ts` fails on a new edge and on a stale entry. Rule 5 says a new edge is a change to this ADR, not to a baseline, and the core deleted its own baseline at cut 9 because an accepted reach stayed. **Proposed ruling: keep the lab's baseline as Decision 3's ledger, and let it end where Decision 3 ends.** This section is the text the ruling would carry; `ceo` rules on it in review.

1. **It shrinks, and nothing is added to it.** An entry goes when its reach is replaced by a published-package form (phase 3). An entry added without a change to this ADR is a breach of rule 5, whatever reason is written beside it. The file is deleted when it is empty.
2. **Kept, not retired, because retiring it now turns the lab's cross-repo leg red.** Retiring it needs the reads cut first (phase 3), and a red test is not landed to make a point. The ledger is also the one machine-read list of what is left to cut.
3. **A reach a ledger names is still refused by rule 2.** A `checkout-path` entry is a path into another repository's tree, which rule 2 forbids in a test. The entry records a debt, not a permission.
4. **Measured, and not enforced.** Lab `origin/main` at `5e8aabd7`, read on 2026-10-13: the file held 540 entries (`grep -c '"from"'`), and 592 at the first lab commit of 2026-10-09 that touches it. Over that window 11 commits lowered the count by 95 in total and 15 raised it by 43 in total (`git log origin/main -- baselines/layer-edges.baseline.json`, each commit's count read with `git show`). Each raising commit needs its own ruling under rule 5, or its entries come out; `ceo` decides which. Nothing in the lab's test stops a raise, because the test accepts any entry that names a real edge. A reading at a moment: re-run it before quoting it.

## How the core gets agent-org

**Amended 2026-10-15: items 1 to 4 below are SUPERSEDED, and kept as the record of what was proposed.** agent-org is not published under
`@a11ign`, and the end state is that a11ign does not need it at all: see
[the amendment](#amendment-2026-10-15-agent-org-is-not-published-under-a11ign-and-a11ign-stops-needing-it) after item 5.

**Proposed on a11ign#5248 (2026-10-13); `ceo` rules on it in review, as the sections above.** It answers how the core gets agent-org at a
declared version (epic #4425, done-when 4). Measured at a11ign `5883e11ed` and agent-org `v0.195.2` (`b7f44578`, the newest stable tag on `git ls-remote --tags`); re-run before quoting.
The host's own checkout (`.agent-org/host.json`, `tool`, moved to the newest tag by `update-tool`) is not a repository's dependency and is
not in these cuts: it stays until `ceo` rules on it.

1. **A published package, not a tag: `@a11ign/agent-org`.** agent-org publishes that name to npm from its own release, with the
   pattern `toolchain` already runs (`release-per-merge.yml`: changesets, trusted publishing, provenance), and the core reads it through its
   `node_modules`. The unscoped name is not ours: `npm view agent-org` returns an unrelated Nx placeholder at `0.0.0`, and
   `npm view @a11ign/agent-org` returns 404, so the scope is the name. agent-org's `release.yml` has no npm step today; the cut adds one.
   Its `exports` already declares ten subpaths (`acceptance-commands` to `tree-wide-guard`), and the package's contract is those names, never `src/`.
2. **Declared in `package.json`, bumped by Dependabot.** `package.json` names `"@a11ign/agent-org"` at an exact version, locked in
   `pnpm-lock.yaml`. Dependabot's npm entry (`.github/dependabot.yml`, daily, one pull request per dependency, ADR 0041 decision 4) opens
   the bump, so nobody polls for it. Renovate does not do this: `renovate.json` enables only the `custom.regex` manager, which does not read
   `package.json`, and #5153, the epic that automated the pins, is closed. The cut also replaces the `dependabot.yml` comment that says
   agent-org is "no dependency of this repository".
3. **What replaces the clone steps: `scripts/agent-org-newest-tag.ts` goes.** Its 38 `run: node scripts/agent-org-newest-tag.ts --dest=…`
   steps in 17 workflow files go with it, and `toolRoot()` (in `scripts/agent-org-newest-tag.ts`, the `$AGENT_ORG_TOOL` and `host.json` lookup)
   resolves through `require.resolve("@a11ign/agent-org/package.json")`. The eight scripts that already call `toolExport` (`scripts/verify.ts`,
   `weekly-review.ts`, `repo-identity.ts` and five more) keep their call shape and change only what the root resolves to. Nothing in non-test
   code reads by path: `toolModule`, `toolPath` and `toolUrl` appear in two workflow comments and in tests, so the reach guard
   (`packages/guards/src/agent-org-src-reach.test.ts`) and its baseline go in the last cut.
4. **Order, each cut one row with one revert:** (a) agent-org publishes `@a11ign/agent-org` at the tag it is at, with the publish step as its
   only change, and the revert removes the step; (b) the core declares the package in `package.json` and `pnpm-lock.yaml`, and the revert removes
   the line; (c) `toolRoot()` falls back to the package when neither `$AGENT_ORG_TOOL` nor `host.json` names a tool, and a test resolves the
   package in a checkout with no tool on disk; (d) the 38 clone steps in the 17 workflow files come out, one workflow family per row, each revert restoring the steps; (e)
   `scripts/agent-org-newest-tag.ts`, its test and the reach baseline go, with the two comments that name `toolModule`. Cut (a) is agent-org's
   and comes first, because nothing can declare a package that does not exist.
5. **Project names in agent-org's source, counted: 17 files and 23 lines** for `a11y-witness`, outside tests, fixtures, `docs/` and `*.md`
   (`git grep -c -i 'a11y-witness' v0.195.2 -- <the non-test paths>`). The wider pattern `a11y-witness|a11ign/a11ign|a11ign-bot|\.a11ign` is
   **223 files** on the same filter, most in `src/messaging` (40), `src/trace` (22), `src/decision-run` (11) and `src/work-gate` (10). The names
   move into the project's own configuration (ADR 0040 decision 3; this repository's is `.agent-org/project.json`), and each directory is one
   cut in agent-org, after (a). (The 893 files that match the wide pattern with tests and docs included are not counted here.)

### Amendment 2026-10-15: agent-org is not published under `@a11ign`, and a11ign stops needing it

**The chairman's direction (a11ign#928, comment 6195402434, 2026-10-15), which overtakes items 1 to 4 above.** His words: "it's a pnpm package
so it can reference the repo and doesn't need to be published ... this org agent will live in a different org in the future and be published
there and not this one."

1. **No registry publish from this organisation.** Cut (a) is withdrawn: agent-org#1377 and its pull request agent-org#1440 are closed
   unmerged, and a11ign#5517 (the brief for the npm registration) is closed. `@a11ign/agent-org` was never registered.
2. **"A declared version" includes a pnpm git dependency pinned to a tag or commit** (`github:<owner>/<repo>#<tag>`), and no registry is
   needed. Rule 1 stands as written otherwise: a branch, "newest", or a tag cloned at CI time is still not a declaration.
3. **Nothing hard-codes `@a11ign`, or any owner, as agent-org's scope or location**, because it moves to another organisation. Wherever a
   consumer must name it (a dependency specifier, a clone URL), that is one declared value that changes in one place on the day it moves.
4. **The end state is stronger than a declaration: a11ign's CI runs product checks only and does not need agent-org to build, test or
   release.** Rule 2 is met by not using the tool, not by pinning it. The 38 clone steps and `scripts/agent-org-newest-tag.ts` go, and the org
   reaches a11ign from outside: the host gate reacting to a11ign's webhooks with its Apps, and agent-org's own scheduled workflows acting on
   a11ign through an App token. Cuts (b) to (e) (a11ign#5459 to #5462) are re-scoped to that, in the same order:
   (b) the product scripts that load the tool by accident stop doing so (`repo-identity.ts` first); (c) the org's per-pull-request checks
   (`ownedPaths`, `deliberateRefusals`, `acceptance`, `guardSweep`) leave `gate`; (d) the clone steps go, and the org-process workflows
   (`auto-arm`, board, trunk, nightly's org jobs) are deleted once their receiving side has run; (e) the script, its reach guard and the
   tests of the tool go. **Nothing is declared in a11ign: no `package.json` entry, no lockfile line.** The inventory and the plan are on
   a11ign#928, under the heading "ceo: inventory and plan".
5. **Consequences 3 and 7 stand in direction:** a11ign's CI stops fetching agent-org, and "nothing to pin and nothing to clone" is the
   end state, now reached without a registry in between.

## Consequences

1. **Every producer's export surface becomes a contract.** What a consumer reads out of another repository's tree today (the fleet's `src/`
   by `control`, `lab`'s root scripts and baselines by a11ign) has to be exported, versioned and released. That is real work in the producer
   (epic phase 3) and the first thing that will want an exception. Item 1's `lays` list (`src`, `scripts`, `baselines`, `rule-ownership.json`,
   `CLAUDE.md`) is the inventory of what `lab` has to publish or a11ign has to stop reading.
2. **Lab-dependent product checks move to lab.** `rules-check` and `docs:coverage` stop being a11ign's CI and become `lab`'s, or
   stop reading `lab`; a11ign loses a gate it has today until the move is done (the row that moves it says what stands in for it).
3. **a11ign's CI stops fetching agent-org.** Item 3's 36 occurrences go. What the 17 callers need either moves into a11ign's packages or into
   the published toolchain; the cost is a duplicate or a new package, and it is paid once. The org's own process checks (`acceptance`,
   `deliberateRefusals`, `board`, `auto-arm`) are run for agent PRs from agent-org's side.
4. **A producer's change no longer reaches a consumer at once.** A fix in `screenreader-worker` reaches the fleet when the fleet bumps. Today
   the laid tree moves with a tag in `layers.json`; after this, a bump is its own tested pull request (epic phase 4: Renovate or Dependabot).
   Item 6's stale pins are the cost of not having one, measured: three pins 0.1.0 against 0.3.0, 0.4.1 and 0.8.0.
5. **`control` stops running laid source.** ADR 0012's "runs from a raw checkout with no `node_modules`" and ADR 0031's plain-`.mjs`
   deploy path are both what this removes. [ADR 0043](./0043-one-toolchain-for-every-repository.md) left the worker's deploy path undecided;
   this ADR decides its direction (a published version, deployed) and not its mechanism, which is `control`'s row.
6. **A contributor's `pnpm install` is a plain install.** `prepare` lays nothing, and `layers.json` goes. This is the largest change an outside
   contributor will notice, and the reason this phase exists.
7. **This overtakes both of the earlier answers about agent-org.** ADR 0040's decision 3 had a project take the tool as a `devDependency`
   pinned to a release tag; #3534 then removed the dependency and made CI clone the newest tag, on the ground that "a pin cannot be made to
   follow". Neither is the end state here: a11ign uses none of the tool's modules (rule 2), so there is nothing to pin and nothing to
   clone, and the process checks run from agent-org's side. The defect #3534 left is the one item 3 measures: a run that changes with no
   change to the repository (agent-org `v0.88.0`'s `.mjs` to `.ts` rename broke every open a11ign pull request, #4394 and #4400). Until
   phase 3 removes the callers, a declared version is the step that stops it (see the last alternative).
8. **What this ADR does not do:** it adds no check (phase 2), removes no crossing (phase 3), makes nothing blocking (phase 4), and does not run
   the outsider test (epic done-when 6). A claim that the repositories now follow it needs those, and `docs/known-gaps.md` is where the
   gap stands until they land.

## Alternatives rejected

- **Keep laying source, but pin every layer by tag.** It is what `layers.json` already does for `lab` and `control`. Rejected: a pin on laid
  source fixes the version and keeps the coupling. A contributor still gets four untracked directories, the product still executes the research
  repository's code, and `control` still reads a copy of a11ign's declarations. Item 1 is not a versioning problem.
- **A submodule per layer.** ADR 0039 item 6 rejected it, and the reason stands: it makes the contributor's checkout a five-repository one.
- **A monorepo again.** The split was decided (ADR 0039, 0040) and the repositories release on their own (ADR 0041). Going back to share source
  would trade this problem for the one the split solved.
- **Allow a documented exception list, shrinking.** Rejected by the chairman's direction and by the record: `layer-edges.baseline.json` is
  that list, it holds 31 entries, and "accepted" in it has meant "never defended". A list that can take an entry is a list that will.
- **Enforce by baseline only, no rule.** The same file again: the check can only say a crossing is new, not that it is wrong. The rule has to
  exist before the check can enforce it (phase 2 reads this ADR).
- **Pin agent-org by tag in CI rather than remove the dependency.** Cheaper, and fixes the reproducibility half of item 3 alone (a version
  the repository declares). Rejected as the end state, kept as the **step**: the callers should not be importing the tool's modules by path at
  all (rule 2), and a pin that is current today is a stale pin like item 6's in a month.
- **Publish `lab`.** It would give the product a version of `lab` to depend on. Rejected: the direction is backwards (the product depends on
  the research repository), and a published `lab` makes the wrong edge look declared.

## What would falsify this

- **A crossing with no published-package form.** Something one repository needs from another that cannot be exported as a package without
  breaking what the package is for: for example `control` running raw with no `node_modules` on a host (ADR 0012, 0031), or a guard that must
  read a producer's file layout rather than its API. One such crossing, found while doing phase 3, shows rule 2 has an exception, and the
  ADR is amended with that crossing named, not worked around.
- **A cycle the graph cannot avoid.** `lab` using the product while the product needs a number only `lab` can compute (the calibration
  corpus), with no way to hand it over as data. The ADR calls the graph acyclic; a required edge back refutes it.
- **Version drift that the tool cannot keep ahead of.** If, after Renovate or Dependabot is on, declared versions of `@a11ign/*` are still more
  than one minor behind for a week (item 6, re-run), the cost in Consequence 4 was understated and "declared" is not "current".
- **The outsider test fails.** A fresh session with no org context forks a11ign, makes a one-line change following only `CONTRIBUTING.md`, and
  cannot reach green and mergeable. Then the contributor contract has a check it does not name, or the rule is not what blocked them.
- **The coupling table does not re-run.** Each command above must print what its row says at the merge commit. A row that does not is a
  reading that has moved, and the table is corrected in the same pull request that moved it.
