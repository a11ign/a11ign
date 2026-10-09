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

1. **Declare it.** The other repository's code arrives by an `@a11ign/*` entry in `package.json` and the lockfile, at a version the
   consumer chose. A caret that follows a new release is a declaration; a branch, a tag cloned in CI, or "newest" is not.
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
| `ownedPaths` (body sign-off of paths) | **Replace** with CODEOWNERS review. |
| `deliberateRefusals` (merge-guard, Closes format) | **Agent PRs only.** |
| `guardSweep` (about 24 org guards) | **Move what matters into ESLint rules; the rest is agent PRs only.** |
| `board` | **Move to agent-org.** |
| `ansible` (checks control's playbooks inside a11ign) | **Delete;** `control` checks its own. |
| `gate`'s second-run agreement (#3211) | **Drop:** a description or label edit must never change a verdict. |
| `auto-arm` | **Agent PRs,** or opt-in by label. |

Also: the git hooks `prepare` installs are opt-in and never block normal git use (for example an unlabelled `git stash`); the PR template is
short and opens with "what changes and why"; `CONTRIBUTING.md` describes every check a contributor can meet. Anyone, human or AI, can contribute
by following `CONTRIBUTING.md` alone.

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
