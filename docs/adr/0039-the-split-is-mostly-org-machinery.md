# ADR 0039: The split is mostly org machinery, and it is sized here before any of it is built

## Status

**Proposed, 2026-09-26.** Row #2614, child 2 of #69. Nothing here is built, filed or started: the appendix holds a
row body per item and `product-manager` files them from it.

**Two rulings are RECORDED here as decided, not offered as options** (`ceo`, #69, 2026-09-26, on the chairman's
direction): **`agent-org` and the rows both STAY in `a11ign/a11ign`** (one tracker, one board, one merge-queue
policy; a layer repository has Issues disabled and its pull requests say `Closes a11ign/a11ign#N`), and **the FIRST
LAYER is `nvda-worker` with `nvda-speech`**. Nothing that moves code is filed before #2612 and this row close.

**Measured at commit `c77c1ba0f`** (`origin/main` when the row was claimed, 2026-09-26). Each reading below is a
command a reader can re-run, with its real output. Three things a reader must know before trusting one:

- **A reading is a moment.** Re-run it at that commit (`git worktree add ../adr-0039-read c77c1ba0f`).
  Every whole-tree `git grep` here excludes this document, whose own text would otherwise be counted; the
  readings that begin `gh api` are **live GitHub state** taken 07:10-07:25Z on 2026-09-26 by `a11ign-ai-workers`,
  and are marked *live*.
- **Measured and inferred are different claims and are labelled.** Where a bullet says *measured* the command
  above it produced it; *inferred* is reading code without running it; *external knowledge* is GitHub or Claude
  Code behaviour recalled, not exercised, and is never load-bearing without a step that verifies it.
- **The classification counts in item 1 are by pattern**, and item 1's row exists to classify each site.

## Context

**The chairman's case for the split is three claims, and `ceo` ruled that its price is the org machinery: the
larger half of the epic, to be named "so nothing is discovered mid-move".** This ADR names it. The finding that shapes
everything below is one sentence: **every piece of org machinery assumes that the tracker, the code and the merge
queue are ONE repository, and the failure it produces when a second one exists is SILENT, not a crash.** A pull
request in a layer repository would be invisible to the gate (no reviewer, no conflict order), the reviewer for
`nvda-worker` PR 12 would be handed CORE's PR 12 (item 3), B4 would report "no overlap" for a file a layer PR
changes (item 2), and the merge-blocking `Closes` parser refuses the very spelling the ruling prescribes (item 4).
Each is measured below.

**Two facts found by reading that the move would otherwise have found.** (1) A layer repository already exists:
`a11ign/screenreader-worker`, created empty and public at 2026-09-26T07:09:25Z, with no branch, no rules and no
ruleset (item 5, reading 3, *live*), and the agent accounts (`a11ign-ai-workers`, `a11ign-ai-leads`, `a11ign-bot`, `a11ign-ci`) hold `admin` on it through the `bots` team
(item 7, readings 2 and 3, *live*), where the tracker gives them `write`. (2) A private repository cannot carry the
review requirement at all on this plan: the template `a11ign/auth-capture-check` answers `rules/branches/main` with
HTTP 403 "Upgrade to GitHub Pro or make this repository public" (item 5, reading 3, *live*), so **a layer repository
must be public** to hold either surface `main-review-requirement.md` requires.

## Decision

1. **Name the two things `REPO` conflates, then make the second one plural.** `TRACKER_REPO` is one repository,
   `a11ign/a11ign`, and never becomes a list. `CORE_REPO` and each layer are the CODE repositories, a list declared as
   data in `docs/code-repositories.json` (created by item 2's row). Every piece of machinery either addresses the
   tracker by its name or iterates the list. **Unprefixed means core**, so no existing row, session name, state file or
   ref changes meaning; a layer's names are qualified (`reviewer-<layer>-<n>`, `nvda-worker:src/x.ts` in a Region).
2. **A pull request is `{repo, number}` everywhere it is currently a bare number**, and **a repository the machinery
   cannot read is `CANNOT_TELL`, never "no overlap" and never a pass** (the failure mode that item 3 shows is silent
   today).
3. **One list, one source.** The list of code repositories is read by items 2, 3, 5, 7 and 8; the fleet's per-layer
   checkout manifest (item 6) and the access table (item 7) are keyed by names from it and a test pins the key sets
   equal. The shared agent rules are single-sourced in core and reach a layer BY REFERENCE, never by copy (item 9).
4. **Before a layer repository takes its first push, the order is fixed** (item 5): create it public with the merge
   settings, then in one sitting classic protection and the `merge-queue-main` ruleset, then the behavioural read-back,
   and only then the layer's CI and the first pull request. **The first push of `main` is the one unprotected write and
   is named.**
5. **The order of the work, with the reason, is in "The sum" below.** `ceo` ruled that the `REPO` split and the fleet
   checkout come first. **This ADR confirms the first and refines the second**: what can go first of item 6 is row
   6a, a no-fleet resolver; rows 6b to 6d are `Fleet: Yes` and cannot start before the layer holds code and its edges
   are cut. Items 7 and 5 are small and must be done before the layer repository takes its first push, which is a
   correction to their apparent priority.
6. **This ADR files nothing and starts nothing.** It changes no code.

## The ten items

Each item gives its readings, what assumes one repository, a size a reader can recheck, a decision with its cost and
what was rejected, an owner, and what it depends on. The appendix holds each item's row body.

### ITEM 1 — `REPO` is one constant answering two questions, and the split needs it to answer two named ones

**Readings.**

```
$ git grep -l "repo-identity" -- . ':!docs/adr/0039-*' | wc -l
48
```

```
$ git grep -lE "from [\"'][^\"']*repo-identity(\.mjs)?[\"']|import\([\"'][^\"']*repo-identity" | sed 's#/[^/]*$##' | sort | uniq -c | sort -nr
     22 packages/agent-org/src
      5 packages/lab/src/packaging
      5 packages/agent-org/src/row-claim
      4 scripts
      2 packages/agent-org/src/merge-guard
      1 packages/agent-org/src/work-gate
```

```
$ git grep -l "a11ign/a11ign" -- . ':!docs/adr/0039-*' | wc -l; git grep -l "a11ign/a11ign" -- . ':!*.test.*' ':!*.md' ':!docs' ':!runs' ':!docs/adr/0039-*' | wc -l
93
30
```

```
$ git grep -nE '^export const (REPO|PRODUCT_REPO)\b' -- scripts/repo-identity.mjs
scripts/repo-identity.mjs:22:export const REPO = "a11ign/a11ign";
scripts/repo-identity.mjs:56:export const PRODUCT_REPO = "a11ign/a11ign";
```

```
$ export LC_ALL=C; P=$(git grep -lE '"pr", *"(list|view|merge|checks|diff|edit|comment|ready|review|create)"|/pulls|gh pr ' -- packages/agent-org/src ':!*.test.*' | sort); I=$(git grep -lE '"issue", *"(list|view|edit|comment|close|create)"|/issues|gh issue ' -- packages/agent-org/src ':!*.test.*' | sort); echo "pr $(echo "$P" | wc -l) issue $(echo "$I" | wc -l) both $(comm -12 <(echo "$P") <(echo "$I") | wc -l)"
pr 44 issue 34 both 18
```

```
$ git grep -nE '"--repo"' -- packages/agent-org/src ':!*.test.*' | wc -l
89
```

**What assumes one repository.**

- **`REPO` is the tracker AND the code, and the file already records that it was two questions once (measured, reading 4).** `scripts/repo-identity.mjs:22` is `REPO`, `:56` is `PRODUCT_REPO`; both are `"a11ign/a11ign"`. Its own comment says they "answer different questions, and the next rename would split them again". The split is that rename: this is a THIRD meaning, and a rename of one constant does not answer it.
- **The constant is imported by 39 files and mentioned by 48 (measured, readings 1 and 2).** 22 + 5 + 2 + 1 = 30 of the 39 are `agent-org` source, 4 are `scripts/`, 5 are lab tests. The other 9 files that mention it are not imports (comments, a shell script, an Ansible default).
- **The literal `a11ign/a11ign` sits in 93 files; 30 are neither tests nor documents (measured, reading 3).** Those 30 are the ones that cannot import anything: 8 `package.json` `repository` fields, workflow strings, Ansible defaults, bootstrap scripts, host units. `repo-identity-consolidated.test.ts` pins each against a constant, so a rename is one edit plus a failing list. That guard is the reason the change is cheap and it must be extended, not bypassed.
- **Inside `agent-org` the constant serves BOTH meanings, and they separate cleanly (measured, reading 5).** 44 files touch a pull-request surface (`gh pr`, `/pulls`) and 34 touch an issue surface (`gh issue`, `/issues`); 18 touch both. 89 lines pass `"--repo"`. Issues, labels, the board and comments are the TRACKER and stay `a11ign/a11ign` by `ceo`'s ruling; pull requests, the merge queue, protection and checkouts are the CODE side and become plural. **The keyword split is a classification by pattern (inferred), not a reading of each site: the first task of the row is to classify all 89 and 44, and the test pins the classification.**
- **Nothing here changes behaviour today (inferred, and it is the point).** With one code repository, `CORE_REPO` and `TRACKER_REPO` are the same string. The value of doing it first is that every later item edits lines that already say which question they answer, and 60 files are touched once mechanically instead of six times by six rows in conflict.

**Size:** 61 files change (39 import the constant, 30 carry the bare literal and are not tests or documents, 8 in both; reading 2 and reading 3), plus 34 test files that pin the literal and 29 documents that mention it.

**Decision:** Split `REPO` into two named constants and delete it: `TRACKER_REPO` (`a11ign/a11ign`, the rows, the board, labels, comments; it never becomes a list) and `CORE_REPO` (the code repository the monorepo is today; item 2 turns the code side into a list read from data). Every `agent-org` use is classified as tracker or code and rewritten, with NO behaviour change: `repo-identity-consolidated.test.ts` gains the assertion that `REPO` is not exported and that every `"--repo"` argument in `agent-org` source is one of the two names. `PRODUCT_REPO` stays (it is prose identity: clone instructions and `package.json` `repository` fields) and each package's `repository.directory` is unchanged until that package moves. Cost: 61 files in one mechanical pull request, and `CLAUDE.md`'s numeric pins that a test derives (none is known to name `REPO`). Rejected: (a) keeping `REPO` and adding a second constant only for the new code, because the 89 `"--repo"` sites would keep one name for two meanings and the next reader would guess; (b) a `REPOS` map keyed by role (`{tracker, code}`) read everywhere, because it turns a string into an object at 89 call sites for the sake of a plurality only one item needs; (c) one row per package, because the guard that counts the sites is a single file and the classification is the work.

**Owner:** engineer

**Depends on:** none.

### ITEM 2 — `row-claim` and B4 read ONE repository's pull requests, and a Region path has no repository

**Readings.**

```
$ git grep -n -E '"pr", "(list|view)"|repos/\$\{REPO\}/pulls' -- packages/agent-org/src/row-claim.mjs packages/agent-org/src/row-claim/ | cut -c1-125
packages/agent-org/src/row-claim/blocked-by-rule.mjs:70:    const raw = run(["pr", "view", String(prNumber), "--repo", REPO, 
packages/agent-org/src/row-claim/file-overlap-rule.mjs:252:    const raw = run(["pr", "list", "--repo", REPO, "--state", "ope
packages/agent-org/src/row-claim/file-overlap-rule.mjs:275:    return run(["api", "--paginate", `repos/${REPO}/pulls/${number
packages/agent-org/src/row-claim/own-pr-health-rule.mjs:584:  const raw = run(["pr", "view", String(number), "--repo", REPO, 
packages/agent-org/src/row-claim/own-pr-health-rule.mjs:595:  const raw = run(["pr", "list", "--repo", REPO, "--state", "open
```

```
$ git grep -c -e '--repo", REPO' -- packages/agent-org/src/row-claim.mjs packages/agent-org/src/row-claim/
packages/agent-org/src/row-claim.mjs:9
packages/agent-org/src/row-claim/blocked-by-edge-rule.mjs:1
packages/agent-org/src/row-claim/blocked-by-rule.mjs:2
packages/agent-org/src/row-claim/file-overlap-rule.mjs:2
packages/agent-org/src/row-claim/own-pr-health-rule.mjs:8
packages/agent-org/src/row-claim/template-fields-rule.mjs:1
```

```
$ node -e 'import("./packages/agent-org/src/region-paths.mjs").then(({declaredRegionFiles:d,unrecognisedRegionPaths:u})=>{const rootFiles=new Set(["package.json"]);for(const l of ["packages/nvda-worker/src/x.ts","nvda-worker:src/x.ts","a11ign/nvda-worker:src/x.ts","src/x.ts"]){const b="## Region\n\n```\n"+l+"\n```\n";console.log(JSON.stringify(l),"declared:",JSON.stringify(d(b,{rootFiles})),"flagged-stray:",JSON.stringify(u(b)))}})'
"packages/nvda-worker/src/x.ts" declared: ["packages/nvda-worker/src/x.ts"] flagged-stray: []
"nvda-worker:src/x.ts" declared: [] flagged-stray: []
"a11ign/nvda-worker:src/x.ts" declared: [] flagged-stray: ["a11ign/nvda-worker"]
"src/x.ts" declared: ["src/x.ts"] flagged-stray: []
```

```
$ node -e 'import("./packages/agent-org/src/row-claim/file-overlap-rule.mjs").then(({fileOverlapReason})=>{const corePr={number:12,files:[".github/workflows/ci.yml"],changedFiles:1,closes:[99],held:false};console.log(JSON.stringify(fileOverlapReason([".github/workflows/ci.yml"],[corePr],{rowNumber:2614})))})' | cut -c1-260
{"emptyOtherPrs":[],"reason":"overlaps #12, which already touches: .github/workflows/ci.yml. B4: no two open pull requests touch the same file -- sequence with that PR's author, or narrow this row's region to what does not overlap."}
```

**What assumes one repository.**

- **B4 lists one repository's open PRs (measured, reading 1).** `file-overlap-rule.mjs:252` is `gh pr list --repo REPO --state open --json number,changedFiles,files,body,labels` and `:275` pages `repos/${REPO}/pulls/<n>/files`; `REPO` is the constant in `scripts/repo-identity.mjs:31` (`"a11ign/a11ign"`). A file changed by an open PR in a layer repository is never in the list, so B4 says "no overlap" for it. Callers of the lookup: `row-claim.mjs:582` (claim), `row-claim.mjs:1771` (`reportB4`, the `check` command) and `wake.mjs:3952` (the spawn filter).
- **The other PR readers in row-claim are keyed on a bare PR number (measured, reading 1).** `blocked-by-rule.mjs:70` (`pr view <n> --repo REPO --json comments`), `own-pr-health-rule.mjs:584` (`pr view <n> --json commits`) and `:595` (`pr list --repo REPO`, the review-health read). A layer PR number handed to these reads core's PR of the same number: wrong data, no error. Inferred for `own-pr-health`: it finds a row's PR through the tracker issue's `closedByPullRequestsReferences` (`own-pr-health-rule.mjs:667-688`, `nodes{number state headRefOid}`, no repository field), so a layer PR closing a core row arrives as a bare number.
- **The rows are NOT the problem (measured).** Reading 2 sums to 23 `"--repo", REPO` uses (9 in `row-claim.mjs`, 1+2+2+8+1 in the rule files); 4 of them are the PR reads of reading 1, so 19 address the tracker (`issue view`, `issue comment`, `label create`, `issue edit`) and stay `REPO` by the ruling. Only the 5 lines of reading 1 (4 `--repo` reads and the `pulls/<n>/files` REST path) need to become per-repository.
- **A Region path has no repository, and a prefix is silently discarded today (measured, reading 3).** `declaredRegionFiles` returns `[]` for `nvda-worker:src/x.ts` AND `unrecognisedRegionPaths` returns `[]` for it, so `row-file`'s warning (`row-file.mjs:246`) does not fire either: a row that wrote a prefix reserves nothing and is told nothing. `a11ign/nvda-worker:src/x.ts` is flagged, but as the fragment `a11ign/nvda-worker`, which misleads. The grammar is in `region-paths.mjs`: `pathInProse` (top-level directories derived from `git ls-files` of THIS checkout), `DIRECTORY_ITEM` (`:415`), `FENCED_PATH_ITEM`, `ROOT_FILE_CANDIDATE` (root files read from `origin/main` of THIS checkout). All four are "a path in this tree".
- **Unprefixed layer-relative paths declare fine and then COLLIDE with core (measured, readings 3 and 4).** `src/x.ts` is declared (a fenced line is any tree path); B4 compares strings (`regionCovers`), so a layer row whose Region is `.github/workflows/ci.yml` is refused for core PR #12's file. Every layer repository has a `package.json`, a `README.md` and a `.github/workflows/ci.yml`: the collision is certain, not theoretical.
- **13 non-test files import `region-paths.mjs` (measured: `git grep -l "region-paths.mjs" -- packages scripts .github ':!*.test.ts' | wc -l` = 13)**: `acceptance-commands`, `pr-open`, `file-overlap-rule`, `own-pr-health-rule`, `row-file`, `row-reachability`, `work-gate` among them. They read a Region as tree paths, so the prefix grammar must be added once in `region-paths.mjs` and the consumers taught only where they touch the filesystem (`row-file.mjs:469` walks Region files with `exists()` in the local checkout, so a layer path reports "do not exist in this checkout", a warning, inferred from the code) and where they compare against a diff (`pr-open.mjs`, item 4).
- **`own`-PR exclusion keys on the tracker row number, which is already right (measured).** `isOwnPrOf` (`file-overlap-rule.mjs:104`) matches `Closes #<row>` against the asking row's number; it stays correct only if a layer PR's `Closes a11ign/a11ign#N` parses to N (item 4, which today refuses that form).

**Size:** 6 files carry `--repo REPO` in row-claim (reading 2: `row-claim.mjs` and the 5 rule files); 3 of them read PRs (reading 1: `blocked-by-rule.mjs`, `file-overlap-rule.mjs`, `own-pr-health-rule.mjs`); plus `region-paths.mjs` for the grammar and `wake.mjs` for its one call site = 8 source files, and 13 importers of the Region parser that must be re-run, not edited.

**Decision:** Make the code-repository set data and make every PR-reading row-claim rule iterate it. Add one declared list of code repositories (`docs/code-repositories.json`, new: `[{ "name": "core", "repo": "a11ign/a11ign" }, { "name": "nvda-worker", "repo": "a11ign/nvda-worker" }]`, name = the prefix). Region entries gain an OPTIONAL `<name>:` prefix (`nvda-worker:src/index.ts`, `nvda-worker:src/`); UNPREFIXED MEANS core, so no existing row changes meaning. `declaredRegionFiles` keeps the prefix inside the returned string, so `regionCovers` and every string comparison work unchanged; a prefix naming a repository not in the list is reported by `unrecognisedRegionPaths` (today it is silent). `lookupOpenPrFiles` runs one `gh pr list --repo <repo>` per listed repository, rewrites each PR's files to `<name>:<path>` (core unprefixed) and returns entries with `repo` beside `number`, so the refusal names `nvda-worker#12`, not `#12`. `blocked-by-rule` and `own-pr-health-rule` take `{repo, number}` for the PR reads. Cost: one extra `gh pr list` per layer per claim (GraphQL pool; measured today as one call), and `null` from ANY repository stays "cannot ask", never "no overlap". Rejected: (a) comparing bare paths across repositories, because reading 4 shows `.github/workflows/ci.yml` collides on day one; (b) encoding the layer in the path (`packages/nvda-worker/...` inside the layer repo), because the layer's own tree will not have that prefix and `pr-open` compares against the layer diff; (c) a `repo` argument threaded through every `run` call site instead of a list, because the 9 tracker uses would then have to be told apart by hand.

**Owner:** engineer

**Depends on:** item 1 (the two names; item 2 turns the code side into a list).

### ITEM 3 — `work-gate` and `wake` enumerate one repository, and every PR-keyed name is a bare number

**Readings.**

```
$ git grep -n -E '"pr", "(list|view|ready)"|repos/\$\{REPO\}/(pulls|issues)|openPullRequestsQueryArgs\(REPO\)' -- packages/agent-org/src/work-gate.mjs packages/agent-org/src/wake.mjs packages/agent-org/src/work-gate/ | cut -c1-135
packages/agent-org/src/wake.mjs:1481:    const state = defaultGh(["api", `repos/${REPO}/pulls/${pr}`, "--jq", ".state"]).trim();
packages/agent-org/src/wake.mjs:2215:    const read = JSON.parse(run(["api", `repos/${REPO}/issues/${ref}`, "--jq", "{state, labels: [.
packages/agent-org/src/work-gate.mjs:267:    const out = run(["pr", "list", "--state", "open", "--limit", "100", "--json",
packages/agent-org/src/work-gate.mjs:2344:    const parsed = JSON.parse(run(["pr", "list", "--state", "merged", "--limit", "100", "--js
packages/agent-org/src/work-gate.mjs:3132:    const nodes = JSON.parse(run(openPullRequestsQueryArgs(REPO)));
packages/agent-org/src/work-gate.mjs:3182:    const out = run(["api", `repos/${REPO}/pulls/${number}/commits`, "--paginate", "--jq",
packages/agent-org/src/work-gate.mjs:3235:    const out = run(["api", `repos/${REPO}/issues/${number}/events`, "--paginate", "--jq",
packages/agent-org/src/work-gate.mjs:3953:      run(["pr", "ready", String(action.pr)]);
packages/agent-org/src/work-gate/pr-orders.mjs:322:      + `\`gh api repos/${REPO}/pulls/${b.number}/reviews\` and compare its \`commit
```

```
$ git grep -n -E 'defaultRun = |refs/pull/\$\{pr\}/head|reviewRef = |REVIEW_CHECKOUT_ROOT = |^export function parityOwner|^  return `reviewer-|^REPO=|REVIEWER_(REGISTRY|REFRESH_LEDGER)_FILE = ' -- packages/agent-org/src/wake.mjs packages/agent-org/src/review-attribution.mjs packages/agent-org/src/work-gate.mjs packages/agent-org/src/reviewer/pr-review-verdict.sh | cut -c1-175
packages/agent-org/src/review-attribution.mjs:99:export function parityOwner(prNumber) {
packages/agent-org/src/review-attribution.mjs:100:  return `reviewer-${Number(prNumber)}`;
packages/agent-org/src/reviewer/pr-review-verdict.sh:27:REPO=a11ign/a11ign
packages/agent-org/src/wake.mjs:291:const defaultRun = (args) => execFileSync("herdr", args, { encoding: "utf8", timeout: 30_000 });
packages/agent-org/src/wake.mjs:1042:export const REVIEW_CHECKOUT_ROOT = `${process.env.HOME}/reviews`;
packages/agent-org/src/wake.mjs:1061:const reviewRef = (pr) => `refs/review/pr-${pr}`;
packages/agent-org/src/wake.mjs:1145:    git("git", ["-C", repoRoot, "fetch", "--quiet", "origin", `+refs/pull/${pr}/head:${reviewRef(pr)}`]);
packages/agent-org/src/work-gate.mjs:254:const defaultRun = (args) => execFileSync("gh", args, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
packages/agent-org/src/work-gate.mjs:4150:export const REVIEWER_REGISTRY_FILE = "reviewer-instances.json";
packages/agent-org/src/work-gate.mjs:4153:export const REVIEWER_REFRESH_LEDGER_FILE = "reviewer-refreshes";
```

```
$ git grep -c -E 'pr-\$\{' -- packages/agent-org/src/work-gate/pr-orders.mjs packages/agent-org/src/work-gate.mjs packages/agent-org/src/wake.mjs packages/agent-org/src/trunk-red.mjs
packages/agent-org/src/trunk-red.mjs:1
packages/agent-org/src/wake.mjs:1
packages/agent-org/src/work-gate.mjs:2
packages/agent-org/src/work-gate/pr-orders.mjs:14
```

```
$ git grep -l -E '"pr", "(list|view)"' -- packages scripts .github ':!*.test.ts' | wc -l
19
```

**What assumes one repository.**

- **The gate's PR reads are 6 sites in `work-gate.mjs` (measured, reading 1):** `readPrs` `pr list --state open --limit 100` (`:267`), the merged-PR list (`:2344`), the unarmed-PR GraphQL (`:3132`, `openPullRequestsQueryArgs(REPO)`; that helper already takes a `repo` parameter), the per-PR commit chain (`:3182`), the PR/issue events read (`:3235`) and the `gh pr ready <n>` ACTION (`:3953`). `wake.mjs` adds 2 (`:1481` PR state, `:2215` `holderOf` over `issues/${ref}`), `work-gate/pr-orders.mjs` 1 (`:322`, a `gh api repos/${REPO}/pulls/<n>/reviews` command printed INTO an order). 9 sites, 3 files.
- **Three of the six gate sites do not name a repository at all (measured).** `defaultRun` is bare `gh` (`work-gate.mjs:254`) and `git grep -F -e '--repo'` over `work-gate.mjs` and `work-gate/` returns exactly one line, a prose string in `pr-orders.mjs:166`. `:267`, `:2344` and `:3953` resolve the repository from the process's working directory; `packages/agent-org/host/a11ign-work-tick.service:14` sets `WorkingDirectory=/home/agent/repos/a11y-witness` (core). So today implicit and explicit agree, and after the split the gate keeps reading core only: a layer PR is INVISIBLE (no reviewer, no merge-conflict order, no unarmed-PR wake, no draft order), and nothing errors. That silence is the failure mode, not a crash. `readOpenRows` (`issue list`, 9 such lines) is the tracker and should stay as it is.
- **The reviewer for PR n fetches the WRONG PR (measured line, inferred consequence).** `wake.mjs:1145` runs `git -C <tick checkout> fetch origin +refs/pull/${pr}/head:refs/review/pr-${pr}`; the tick checkout's `origin` is core. For a layer PR 12 this succeeds, because core PR 12 exists, and the reviewer is handed core's PR 12 head in `~/reviews/reviewer-12` (`wake.mjs:1042`, `reviewCheckoutPath` = `${root}/${session}`). `linkReviewDependencies` then links the primary checkout's `node_modules` and every `packages/*` into the tree (inferred from `wake.mjs:1100-1120`), which a layer worktree cannot have.
- **`reviewer-<n>` is `parityOwner` and it is the join key everywhere (measured, reading 2).** `review-attribution.mjs:99-100` returns `reviewer-${n}`; `reviewerInstanceNumber` (`:112`) parses only `^reviewer-([1-9][0-9]*)$`. Measured: `reviewerInstanceNumber("reviewer-12")` = 12, `("reviewer-2")` = null (the retired standing pane), `("reviewer-nvda-worker-12")` = null. So a layer-qualified name is not recognised as an instance by the router, the teardown, the ceiling count or the gate's owed-verdict read (`wake.mjs:948,967,993,1384`, `work-gate.mjs:4260`), and a layer PR numbered 2 would be refused as "the retired reviewer".
- **Every PR-keyed state name collides (measured, reading 3).** 18 lines carry `pr-${...}` in 4 files (`pr-orders.mjs` 14, `work-gate.mjs` 2, `wake.mjs` 1, `trunk-red.mjs` 1): order `subject: pr-<n>` and `causeKey: <session>/<cause>/pr-<n>/<head8>`; plus the registry `reviewer-instances.json` (`work-gate.mjs:4150`, keyed by `reviewer-<n>`), the ledger `reviewer-refreshes` (`:4153`), the private ref `refs/review/pr-<n>` (`wake.mjs:1061`) and the tree `~/reviews/reviewer-<n>`. PR numbers are per repository and a new layer starts at 1 while core is past 2600: the numbers overlap from the first layer PR, and any state file that outlives a PR (registry, ledgers, `answer:`-style dedupe by cause key) will confuse core #12 with `nvda-worker#12`. I did not find a `session:reviewer-<n>` label anywhere in code (`git grep "session:reviewer"` over non-test files is empty), so the label part of the brief's hypothesis did NOT reproduce; the collision is in files, refs, trees and cause keys.
- **The verdict door hard-codes the repository (measured, reading 2).** `reviewer/pr-review-verdict.sh:27` is `REPO=a11ign/a11ign`, and its `gh pr review "$n" --repo "$REPO"` (`:103`) posts to core PR n. It also derives `reviewer-<n>` from the checkout path `.../reviews/reviewer-<n>` (header, lines 22-23), so the naming change in `parityOwner` has to reach it.
- **Not only these three files.** 19 non-test files run `gh pr list|view` (reading 4): the gate and wake are the ones that DECIDE; the rest (`merge-guard`, `auto-arm-sweep`, `queue-table`/`merge-queue`, `update-branch-sweep`, `pr-hold`, `ready-label-audit`, ...) are the merge-queue and sweeps, the subject of another item.

**Size:** 5 source files for this row (`work-gate.mjs`, `wake.mjs`, `work-gate/pr-orders.mjs`, `review-attribution.mjs`, `reviewer/pr-review-verdict.sh`); 9 enumeration sites in the first three (reading 1); 18 PR-keyed name lines in 4 files (reading 3); 19 files in the org read PRs at all (reading 4).

**Decision:** Make PR identity `{repo, number}` and the tick iterate the code-repository list from item 2. Core keeps every name it has (`reviewer-<n>`, `pr-<n>`, `~/reviews/reviewer-<n>`, `refs/review/pr-<n>`) so nothing in flight changes; a layer PR gets `reviewer-<layer>-<n>`, cause key `pr-<layer>-<n>`, ref `refs/review/<layer>/pr-<n>`, tree `~/reviews/reviewer-<layer>-<n>`. Add `reviewerInstanceOf(label)` returning `{repo, number}` (with `reviewerInstanceNumber` kept as the core-only wrapper so the 6 existing call sites (`wake.mjs` x5, `work-gate.mjs` x1) migrate one by one), give `readPrs`, the merged list, the commit-chain read and `gh pr ready` an explicit `--repo`, and make `prepareReviewCheckout` fetch from the layer's own clone (`~/repos/<layer>`, which the host must have: a provisioning row for `orchestrator`, not part of this one). `pr-review-verdict.sh` takes the repository from the checkout's `origin` instead of the literal. Cost: one `pr list` per repository per tick (100-PR cap each), and one clone plus one dependency install per layer on the tick host. Rejected: (a) a single global PR namespace such as `reviewer-<seq>` with a registry mapping to repo, because it renames every in-flight core session and needs a new state file to stay consistent; (b) leaving the tick core-only and starting layer reviewers by hand, because the reading shows the failure is silent (a layer PR nobody was told about); (c) a `--repo` sprinkled on the three implicit sites only, because it fixes the reads and leaves the fetch at `wake.mjs:1145` handing a reviewer the wrong PR.

**Owner:** engineer (the code); `orchestrator` for the follow-up host row that clones each layer and installs its dependencies on the tick host

**Depends on:** items 1 and 2 (the list and the `{repo, number}` shape of a pull request).

### ITEM 4 — `pr-open`, the PR template and the merge-blocking `Closes`/`Acceptance` parsers

**Readings.**

```
$ node -e 'import("./packages/agent-org/src/acceptance-commands.mjs").then(m=>{for(const b of ["Closes #12","Closes a11ign/a11ign#12","Closes: a11ign/a11ign#12","Closes a11ign/a11ign#12, a11ign/a11ign#13","Closes: none -- reason"])console.log(JSON.stringify(b),"=>",JSON.stringify(m.closesDeclarationReport(b)))})'
"Closes #12" => {"ok":true,"line":"CLOSES: #12"}
"Closes a11ign/a11ign#12" => {"ok":false,"line":"CLOSES: MALFORMED -- mentions \"Closes\" but names no `#<number>` and no `none — <reason>` opt-out"}
"Closes: a11ign/a11ign#12" => {"ok":false,"line":"CLOSES: MALFORMED -- mentions \"Closes\" but names no `#<number>` and no `none — <reason>` opt-out"}
"Closes a11ign/a11ign#12, a11ign/a11ign#13" => {"ok":false,"line":"CLOSES: MALFORMED -- mentions \"Closes\" but names no `#<number>` and no `none — <reason>` opt-out"}
"Closes: none -- reason" => {"ok":true,"line":"CLOSES: NONE -> reason"}
```

```
$ git grep -n -E '^const CLOSES_(NONE|LIST|MENTIONED)_PATTERN = ' -- packages/agent-org/src/acceptance-commands.mjs | cut -c1-170
packages/agent-org/src/acceptance-commands.mjs:3074:const CLOSES_NONE_PATTERN = /\bCloses:\s*none\b([^\n]*)/i;
packages/agent-org/src/acceptance-commands.mjs:3075:const CLOSES_LIST_PATTERN = /\bCloses:?\s*(#\d+(?:\s*(?:,|and)\s*#\d+)*)/i;
packages/agent-org/src/acceptance-commands.mjs:3081:const CLOSES_MENTIONED_PATTERN = /\bCloses\b/i;
```

```
$ node -e 'import("./packages/agent-org/src/pr-open.mjs").then(({checkRegion})=>{const rootFiles=new Set(["package.json"]);const t=(l,region,changed)=>{const r=checkRegion("Closes #12",[],{git:()=>changed.join("\0")+"\0",rowBody:()=>"## Region\n\n```\n"+region+"\n```\n",rootFiles});console.log(l,"=>",r.refusal?"REFUSED: "+r.refusal.split("\n").slice(1,3).join(" | ").trim():r.note)};t("core Region, core diff ","packages/nvda-worker/src/x.ts",["packages/nvda-worker/src/x.ts"]);t("core Region, layer diff","packages/nvda-worker/src/x.ts",["src/x.ts"]);t("prefixed Region, layer diff","nvda-worker:src/x.ts",["src/x.ts"])})' | cut -c1-250
core Region, core diff  => REGION: 1 changed path(s) against #12's Region (origin/main...HEAD): 1 inside, 0 exempt, 0 cleared by an Outside-Region line.
core Region, layer diff => REFUSED: src/x.ts | The Region it was read against: packages/nvda-worker/src/x.ts.
prefixed Region, layer diff => REFUSED: src/x.ts | The Region it was read against: (names no path).
```

```
$ git grep -n -E 'actions/checkout|pnpm install|npm run build|^        run: node packages/agent-org/src/acceptance-commands.mjs|GH_TOKEN' -- .github/workflows/reusable-acceptance.yml | grep -v ':\s*#' | cut -c1-130
.github/workflows/reusable-acceptance.yml:42:      - uses: actions/checkout@v4
.github/workflows/reusable-acceptance.yml:46:      - run: pnpm install --frozen-lockfile --ignore-scripts
.github/workflows/reusable-acceptance.yml:47:      - run: npm run build
.github/workflows/reusable-acceptance.yml:75:        run: node packages/agent-org/src/acceptance-commands.mjs
```

**What assumes one repository.**

- **The `Closes` parser REFUSES the cross-repository form (measured, readings 1 and 2).** `Closes #12` is `ok: true` (`CLOSES: #12`); `Closes a11ign/a11ign#12`, `Closes: a11ign/a11ign#12` and `Closes a11ign/a11ign#12, a11ign/a11ign#13` are all `ok: false`, `CLOSES: MALFORMED -- mentions "Closes" but names no ...`. The regex that refuses is `CLOSES_LIST_PATTERN = /\bCloses:?\s*(#\d+(?:\s*(?:,|and)\s*#\d+)*)/i` (`acceptance-commands.mjs:3075`): after `Closes` and optional colon it demands `#` immediately, so an `owner/repo` before the `#` fails it, and the fallback `CLOSES_MENTIONED_PATTERN = /\bCloses\b/i` (`:3081`) then classes the body MALFORMED. `Closes: none -- reason` parses (`CLOSES: NONE -> reason`), so a layer PR could only merge today by opting out of the row it exists to close. This is the MERGE-BLOCKING gate: `ci.yml`'s `acceptance` job runs `acceptance-commands.mjs`, which prints `closesDeclarationReport` and exits non-zero on it (`main`, `:3374-3380`).
- **Five files CALL this one parser (measured: `git grep -l -E 'extractClosesDeclaration\(|closesDeclarationReport\(' -- packages scripts .github ':!*.test.ts'` lists `acceptance-commands`, `arm-pr`, `closes-mismatch-check`, `pr-open`, `row-claim/file-overlap-rule`; a sixth, `close-rows-for-merged-pr`, only mentions it in a comment).** All read `numbers` as tracker row numbers, which stays right IF the parser returns tracker numbers only.
- **A bare `#N` is silently WRONG in a layer repository (inferred from reading 1 plus GitHub semantics; the GitHub half is external knowledge, not measured).** The parser accepts `Closes #12`, so a layer PR body with `Closes #12` passes every gate here, while GitHub resolves `#12` to the LAYER repository's issue 12 (Issues are disabled there), so the core row never closes. GitHub's own auto-close keyword works across repositories only in the form `Closes owner/repo#N`, and only when the PR's author has push access to the target repository (external knowledge, not measured here).
- **The closing side is keyed on `REPO` and a bare number (measured).** 11 non-test files read `closingIssuesReferences`/`closedByPullRequestsReferences` (`git grep -l -E 'closingIssuesReferences|closedByPullRequestsReferences' -- packages scripts .github ':!*.test.ts' | wc -l` = 11). `merge-guard/lookups.mjs:97-108` (`lookupClosingIssues(number)`) queries `repository(owner,name)` for `REPO` and returns `nodes{number ...}` with no repository field; `closes-mismatch-check.mjs` compares those numbers to the declared ones, so a cross-repo reference would be compared by number alone. `close-rows-for-merged-pr.mjs` (header lines 8-40) exists because a merge by `github-actions[bot]` did NOT close the row natively (3 of 3 bot merges failed to, measured in that file's header on 2026-09-07); it runs in this repository's workflows, so a layer merge needs it too, with a credential able to write to the CORE tracker in the layer repository (inferred; that is a secret, not code).
- **The Region check compares the local diff to a core-shaped Region (measured, reading 3).** `checkRegion` (`pr-open.mjs:245`) reads the row body from the tracker (`repos/${REPO}/issues/N`, `:510`, correct) and diffs `origin/main...HEAD` in the local tree. Against a layer worktree the diff is layer-relative: with a core-shaped Region (`packages/nvda-worker/src/x.ts`) `src/x.ts` is REFUSED as outside the Region; with a prefixed Region (`nvda-worker:src/x.ts`) it is REFUSED with "The Region it was read against: (names no path)", because the prefix declares nothing (item 2, reading 3). So every layer PR fails `pr-open` until both the grammar (item 2) and the diff-prefixing land. `pr-open` itself calls `gh pr create|edit` with no `--repo` (`:439`), i.e. the working directory's repository, which is correct for a layer worktree; only `editTreeRefusal` defaults to `REPO` (`:679`) and honours a `--repo` flag.
- **The Acceptance parser runs commands in the CHECKOUT OF THE REPOSITORY THE WORKFLOW RUNS IN (measured, reading 4).** `.github/workflows/reusable-acceptance.yml` does `actions/checkout@v4`, `pnpm install --frozen-lockfile --ignore-scripts`, `npm run build`, then `run: node packages/agent-org/src/acceptance-commands.mjs` (`:42-75`), and `runForReal` is `execSync(command, {shell: "/bin/bash"})` with the process's cwd (`acceptance-commands.mjs:3051`). `ci.yml:475` calls it as `uses: ./.github/workflows/reusable-acceptance.yml`, a same-repository path. A layer repository has neither `packages/agent-org/` nor that file: it needs either its own copy of the workflow (then a second copy of the parser to drift) or a cross-repository call plus a SECOND checkout of core to run the parser from (inferred; this is the design question, not measured). The job passes no `GH_TOKEN` (`:69` says so in a comment; reading 4 shows none in the file), so `closes-mismatch-check`, which needs one, is a separate ci.yml step (`ci.yml:432`).
- **The token-less job's file lists are cwd-relative (inferred from reading the code, not run in a layer tree).** `deriveClosureRequirements` walks a named test's local-import closure and charges `token`/`corpus`/`history` requirements; 85 tracked files declare `// no-token:` (measured: `git grep -l -E '^// no-token:' | wc -l`). A layer's test imports its own files, so the walk works in the layer checkout, but a layer test importing a core module (`../../agent-org/...`) or a `@a11ign/*` package would walk into a tree that is not there. `row-file.mjs:469` (`regionClosureWarning`) does the same walk for a row's Region files against the LOCAL checkout with `exists()`, so a layer path reports "do not exist in this checkout" (a warning).
- **The PR template names the tracker as if local (measured).** `.github/PULL_REQUEST_TEMPLATE.md:95` is the stub `Closes #`, and lines 85-91 tell the author `Closes #N`; a layer repository needs its own template whose stub is `Closes a11ign/a11ign#`. `docs/lane-ownership.json` puts `.github/workflows/` in the `the pipeline` lane (owner `ceo`), so any row touching the workflow edit gets `lane:ceo`: the workflow half of this item must be its own row.

**Size:** 4 source files in this row (`acceptance-commands.mjs`, `pr-open.mjs`, `closes-mismatch-check.mjs`, `merge-guard/lookups.mjs`) plus `.github/PULL_REQUEST_TEMPLATE.md` = 5; 1 regex pair to change (reading 2); 5 files call the parser (measured above); 11 files read the closing references; 1 workflow (`reusable-acceptance.yml`) and 1 caller line (`ci.yml:475`) belong to a separate `lane:ceo` row.

**Decision:** Teach the one parser the repo-qualified form and make it tracker-aware, without changing what its callers see. `CLOSES_LIST_PATTERN` becomes `(?:[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)?#\d+` per item; `extractClosesDeclaration(body, { tracker, here })` returns `numbers` = the tracker's rows only (so B4, `arm-pr` and `pr-open` keep working unchanged) plus `foreign` for anything else. When `here !== tracker` a bare `#N` is MALFORMED with the sentence "Issues are disabled in <here>; write `Closes <tracker>#N`", and a reference to a repository that is neither is MALFORMED (rows live in one tracker). `checkRegion` takes the layer name and prefixes each diff path (`nvda-worker:src/x.ts`) before comparing, using item 2's grammar. `closes-mismatch-check` and `lookupClosingIssues` compare `{repo, number}` pairs (GraphQL `nodes{number repository{nameWithOwner}}`, inferred to exist). The layer template's stub becomes `Closes a11ign/a11ign#`. Cost: one regex and one option on a parser 5 files call (so `acceptance-commands.test.ts` must stay green), and a second `--json` field on one GraphQL query. Rejected: (a) accepting bare `#N` in a layer and translating it, because the body would say something GitHub does not honour and the row would never close; (b) a bot rewriting bodies, because nothing else here edits a human's PR body and the mismatch check exists to catch exactly a body/GitHub disagreement; (c) making layer PRs use `Closes: none`, because it makes every layer PR skip the row-Region check that reading 3 shows is the only thing binding a PR to its row. The workflow half (a layer-callable `reusable-acceptance.yml` with a second checkout of core, `closeRows` running for layer merges with a credential that can write core issues) is a separate `ceo`-lane row: that credential is the same decision the branch-protection rows already treat as the chairman's.

**Owner:** engineer (parser, `pr-open`, template); `ceo` for the workflow row (pipeline lane)

**Depends on:** items 1 and 2 (the Region prefix grammar the Region check needs).

### ITEM 5 — The merge queue and the review requirement are per repository: every code repository needs its own ruleset AND classic protection, read back behaviourally, before its first PR merges

**Readings.**

```
$ git grep -l 'branches/main/protection\|rulesets\|A11Y_CHECK_BRANCH_PROTECTION\|A11Y_CHECK_MAIN_RULESET\|merge-queue-main' | wc -l
25
```

```
$ for f in merge-queue merge-guard arm-pr auto-arm-sweep update-branch-sweep; do echo "$f repo-identity=$(grep -c 'repo-identity' packages/agent-org/src/$f.mjs) GITHUB_REPOSITORY=$(grep -c 'GITHUB_REPOSITORY' packages/agent-org/src/$f.mjs)"; done
merge-queue repo-identity=1 GITHUB_REPOSITORY=0
merge-guard repo-identity=1 GITHUB_REPOSITORY=0
arm-pr repo-identity=0 GITHUB_REPOSITORY=2
auto-arm-sweep repo-identity=0 GITHUB_REPOSITORY=2
update-branch-sweep repo-identity=0 GITHUB_REPOSITORY=2
```

*Live GitHub state, taken 07:10-07:25Z on 2026-09-26; it can differ by the time it is re-read.*

```
$ for r in a11ign screenreader-worker auth-capture-check; do echo "$r protected=$(gh api repos/a11ign/$r/branches/main --jq .protected 2>&1 | head -n1 | cut -c1-40) rules=$(gh api repos/a11ign/$r/rules/branches/main --jq length 2>&1 | head -n1 | cut -c1-80)"; done
a11ign protected=true rules=2
screenreader-worker protected={"message":"Branch not found","documenta rules=0
auth-capture-check protected=false rules={"message":"Upgrade to GitHub Pro or make this repository public to enable this 
```

```
$ node -e 'import("./packages/agent-org/src/acceptance-commands.mjs").then(m=>{for(const b of ["Closes #12","Closes a11ign/a11ign#12"])console.log(JSON.stringify(b),m.extractClosesDeclaration(b).kind)})'
"Closes #12" closes
"Closes a11ign/a11ign#12" malformed
```

**What assumes one repository.**

- **measured** `packages/lab/src/packaging/branch-protection.test.ts` (1,510 lines) spells `a11ign/a11ign` in five live reads and imports no `REPO`: lines 443 (`pr list --repo`), 473 (`branches/main`), 478 (`branches/main/protection`), 931 (`rules/branches/main`), 951 (`rulesets/{id}`). The ruleset id `23681721` is in 14 lines of that file but only in FIXTURES (692-693, 733, 826, 1079-1080, 1148, 1182, 1393-1394); the live read at 931-951 discovers the id from `rules/branches/main`, so the id is not the live hazard, the repo literal is. `merge-queue-window.test.ts:313` pins `{ id: 23681721, updatedAt: ... }` as a live snapshot.
- **measured** the guard runs in ONE place: `.github/workflows/nightly.yml:241-265` reads the ruleset with `A11IGN_BOT_TOKEN` (the merging identity) and runs only `branch-protection.test.ts`. A layer repository is read by nothing today: reading 3 shows `screenreader-worker` already exists (created 2026-09-26T07:09:25Z, public, Issues off) with no branch, no rules and no ruleset, i.e. nothing protects it, and nothing in the tree would notice.
- **measured** the merge machinery names its repository two incompatible ways (reading 2): `merge-queue.mjs` and `merge-guard.mjs` import the constant `REPO` from `scripts/repo-identity.mjs` (116 `"--repo", REPO` / `repos/${REPO}` call sites across `packages/agent-org/src` and `scripts`, 48 files mention `repo-identity` (`git grep -l repo-identity | wc -l`)); `arm-pr.mjs:882`, `auto-arm-sweep.mjs:399`, `update-branch-sweep.mjs:684` read `GITHUB_REPOSITORY` (the repository the workflow runs IN). In a layer repository the second family would act on the layer, the first on the tracker: two answers to "which repository" in one merge.
- **measured** one file disagrees with itself: `merge-queue.mjs:277` runs `gh pr list --state open` with NO `--repo` (resolved from the working directory's `origin`), while lines 222, 235 and 256 of the same file pass `${REPO}`. In a layer checkout the queue listing would be the layer's and the compare/delete calls the tracker's.
- **measured** the arming call is per repository and per identity: `arm-pr.mjs:477` and `auto-arm-sweep.mjs:440` run `gh pr merge --auto --merge <n> --repo <repo>`. `auto-arm.yml` (one file, 17 `A11IGN_BOT_TOKEN` mentions) is a per-repository workflow and its secret is a per-repository or per-organisation secret. **Not readable by this account** (`gh api orgs/a11ign/actions/secrets` and `repos/a11ign/a11ign/actions/secrets` both 403), so whether a new repository inherits the token is UNKNOWN. The file's own comment (auto-arm.yml, #416) records that a `github-actions`-attributed merge does not apply `Closes #N` while a PAT merge does (12 of 12, 2026-09-07), so a layer without the token merges without closing the tracker row.
- **measured** `ci.yml:115` is the only workflow with a `merge_group:` trigger (`git grep -l 'merge_group:' -- .github/workflows` = 1). A layer repository whose `ci.yml` lacks it can never leave the queue, and the required context is a single job named `gate` (`ci.yml`, `gate` job) that a new repository's workflow must also produce.
- **measured** the live settings differ between the three repositories, so "copy the settings" is not an instruction: `a11ign` has `allow_auto_merge` true, squash off, rebase off, `delete_branch_on_merge` true; `screenreader-worker` has auto-merge OFF, squash and rebase ON, `delete_branch_on_merge` false (`gh api repos/a11ign/<r> --jq ...` at 07:2xZ). `arm-pr` uses `--merge` and needs auto-merge on.
- **measured** a private repository on this plan cannot carry the requirement at all: `auth-capture-check` (private) answers `rules/branches/main` and `rulesets` with HTTP 403 "Upgrade to GitHub Pro or make this repository public", and `branches/main.protected` is `false`. The organisation plan is `free` (`gh api orgs/a11ign --jq .plan.name`). Per `main-review-requirement.md` a 404 would be ambiguous, but this is a 403 with a message, so it is neither absent nor forbidden: the feature is unavailable. **The template repository therefore shows no protection model to copy; the model to copy is `a11ign/a11ign`'s.**
- **measured** the shipped Closes parser rejects the ruled spelling (reading 4): `Closes a11ign/a11ign#12` is `malformed`, and `Closes` is MERGE-BLOCKING per `.claude/rules/org-routing-and-timers.md`. Any layer PR written as the ruling says would fail the tracker's own gate today. `closedRowNumbers` (arm-pr.mjs:176) only ever reads `#(\d+)`, and `close-rows-for-merged-pr.mjs:430,456,514` run `gh issue close|edit|comment --repo <GITHUB_REPOSITORY>`, i.e. in the PR's repository, where Issues are disabled.

**Size:** 25 files read the protection surfaces (reading 1); of them 1 test (`branch-protection.test.ts`, 5 literal live-read sites) and 1 workflow step (`nightly.yml:241-265`) are the reader; the merge machinery is 5 agent-org entry points (reading 2) plus `merge-guard/` (12 files) and `pr-hold`, `queue-table`, `trunk-red`, `work-gate`; per new repository the settings to set are 2 surfaces (ruleset + classic protection) + 5 repository settings.

**Decision:** Before ANY pull request merges in a layer repository, that repository must carry both surfaces the tracker carries, and the same behavioural read that proves them on `a11ign/a11ign` must be run against it in CI. Order of creation, and what is measured versus not: (1) create the repository PUBLIC in the `a11ign` organisation (measured: a private repository cannot hold either surface on this plan; merge queue is also public-only on Free, external knowledge, not verified here); set `allow_auto_merge` true, merge commits only, `delete_branch_on_merge` true, Issues off. (2) The repository is empty, so `branches/main` is 404 "Branch not found" (measured on `screenreader-worker`) and classic protection has nothing to attach to (inferred from the endpoint's shape, NOT tried); a ruleset attaches by ref pattern and is expected to be creatable first (external knowledge, NOT verified). (3) The first push of `main` is therefore the one unprotected write: do it by an admin as a seed commit, ideally with the ruleset in `evaluate`/`disabled` so the push is not itself refused (whether an active `pull_request` rule refuses the creation of the branch is UNKNOWN: try it on a throwaway repository before the real one). (4) THEN, in one sitting: classic protection (1 approving review, `bypass_pull_request_allowances` EMPTY, `enforce_admins` true, required check `gate`), the `merge-queue-main` ruleset (`merge_queue` + `pull_request` requiring 1) set `active`. (5) Behavioural read-back: `rules/branches/main` lists both rules and `current_user_can_bypass` is `never` for the merging identity, and a throwaway PR reads `reviewDecision` `REVIEW_REQUIRED` (the observable `main-review-requirement.md` names); the read must name which instrument it used (admin read vs non-admin read). (6) Only then add `ci.yml` with `merge_group` and a `gate` job, the token secret and `auto-arm.yml`, and allow the first real PR. Make `branch-protection.test.ts` take its repository from the ONE declared list of code repositories, `docs/code-repositories.json`, which item 2's row creates (core + each layer), fail on a repository in the list that is unreadable, and have `nightly.yml` run it per repository. The bot merges cross-repo per repository, each in its own queue: `gh pr merge --auto --merge <n> --repo <layer>` with the merging identity's PAT; GitHub has NO cross-repository merge group (external knowledge), so a change spanning core and a layer is two merges and the ordering is the head-gate of ITEM 8, not the queue. On `Closes a11ign/a11ign#N` (EXTERNAL KNOWLEDGE, not measurable here because no cross-repository PR exists): GitHub documents the `owner/repo#N` closing-keyword form and closes the issue when the PR merges into the PR repository's default branch; I believe it also requires that the merging identity hold write access to the issue's repository, which the PAT would; verify on a throwaway pair before relying on it. The tracker's own parser must be taught the spelling (reading 4), and `close-rows-*` must close in the tracker repository, not in `GITHUB_REPOSITORY`. Costs: one more ruleset and protection to keep in step per repository (each protection edit is a logged admin act), one more secret to keep in step. Rejected: an organisation-level ruleset (the plan is Free, and the ruleset read is not in this account's reach, unverified; org rulesets are a paid feature, external knowledge) and copying the template repository's settings (it has none, it is private).

**Owner:** engineer, with `ceo` for the creation of the ruleset and protection (admin surfaces, `lane:ceo`-shaped: `enforce_admins` makes the edit a logged one).

**Depends on:** item 7 (which account may administer a layer repository). Item 8 depends on THIS row, not the reverse: the layer's `gate` job and `merge_group` trigger are added last, after the protection exists (step 6 of the order).

### ITEM 6 — The fleet, the lab and `host:check`: every host checks out ONE repository, and the worker runs from that checkout

**Readings.**

```
$ git grep -nE "Run \"(fetch|checkout|merge)\"|argv: \[git, .*(fetch|checkout|merge|clone)|git clone|git -C .* pull|git fetch --quiet|git( -c [^ ]+)? merge --" -- packages/control packages/worker-fleet ':!*.test.*' ':!*.md' ':!packages/worker-fleet/dist' | grep -vE ":[0-9]+:\s*(#|\*|//)" | cut -d: -f1 | sort | uniq -c
      4 packages/control/ansible/deploy.yml
      2 packages/control/ansible/lab-reset.yml
      1 packages/control/ansible/provision-role.yml
      1 packages/control/ansible/provision.yml
      3 packages/control/ansible/reset-checkout.yml
      2 packages/control/ansible/tasks/run-job.yml
      2 packages/control/src/fleet-playbook.mjs
      3 packages/control/src/lab-pipeline.mjs
      4 packages/worker-fleet/src/provisioning/bootstrap-control-plane.sh
      1 packages/worker-fleet/src/provisioning/bootstrap-windows-worker.ps1
```

```
$ git grep -nE "a11ign/a11ign\.git|worker_repo_url|A11Y_REPO_URL" -- packages/control packages/worker-fleet ':!*.test.*' ':!*.md' ':!packages/worker-fleet/dist' | grep -vE ":[0-9]+:\s*(#|\*|//)" | cut -c1-150 | head -n 15
packages/control/ansible/roles/worker/defaults/main.yml:15:worker_repo_url: https://github.com/a11ign/a11ign.git
packages/control/ansible/roles/worker/tasks/packages.yml:201:      & 'C:\Program Files\MinGit\cmd\git.exe' clone --quiet '{{ worker_repo_url }}' '{{ w
packages/worker-fleet/package.json:84:    "url": "git+https://github.com/a11ign/a11ign.git",
packages/worker-fleet/src/provisioning/bootstrap-control-plane.sh:36:REPO_URL="${A11Y_REPO_URL:-https://github.com/a11ign/a11ign.git}"
packages/worker-fleet/src/provisioning/bootstrap-windows-worker.ps1:28:$RepoUrl  = if ($env:A11Y_REPO_URL) { $env:A11Y_REPO_URL } else { 'https://gith
```

```
$ node -e 'import("./packages/nvda-worker/src/worker-files.mjs").then(m=>console.log(m.WORKER_FILES.length, m.WORKER_FILES.filter(f=>f.includes("/")).length))'
29 0
```

```
$ grep -nE "cd /d|packages.(worker-fleet|lab)" packages/nvda-worker/src/run-server.cmd packages/nvda-worker/src/run-capture-check.cmd | grep -v ":rem"
packages/nvda-worker/src/run-server.cmd:17:cd /d "%~dp0..\..\.." || exit /b 1
packages/nvda-worker/src/run-capture-check.cmd:14:cd /d "%~dp0..\..\.." || exit /b 1
packages/nvda-worker/src/run-capture-check.cmd:33:"%NODE_EXE%" "packages\lab\src\harnesses\capture-check.mjs" > capture-check.log 2>&1
```

**What assumes one repository.**

- **Every guest is a full clone of a11ign/a11ign, and a deploy is `git fetch` + `checkout` + `merge --ff-only` of ONE ref (measured).** `packages/control/ansible/deploy.yml:183-196` runs the three git calls in `a11y_repo_path` (`C:\Users\witness\a11y-witness`, `group_vars/a11y_workers.yml:40`) and asserts `guest_head.stdout_lines | last | trim == a11y_expected_commit` in the next task. `provision.yml:69` and `provision-role.yml:123` repeat the merge. A layer in a second repo means a second `fetch/checkout/merge/assert` block per play, and `a11y_expected_commit` (one sha) becomes a pair. Reading 1 counts 10 files that run a git verb on a host; a further 30 files name a checkout path variable (`git grep -lE "a11y_repo_path|worker_repo_path|lab_repo_path|CONTROL_CHECKOUT|CONTROL_PLANE_CHECKOUT|A11Y_REPO_PATH|REPO_PATH" -- packages/control packages/worker-fleet ':!*.test.*' ':!*.md' ':!packages/worker-fleet/dist' | wc -l` gave 30, measured).
- **The repo URL is a literal in four places (measured, reading 2):** `roles/worker/defaults/main.yml:15` (worker_repo_url, consumed by `packages.yml:201` `git clone`), `bootstrap-control-plane.sh:36`, `bootstrap-windows-worker.ps1:28`; `reset-checkout.yml` and `update-origin-remote.yml` take `-e new_repo_url=` and regex-refuse anything but `https://github.com/<o>/<r>.git` (reset-checkout.yml:88, update-origin-remote.yml:57), and both ASSUME one origin per box: `remote set-url origin` (reset-checkout.yml:170, :234). A second remote per box is a new concept for both plays.
- **What a worker RUNS is entirely inside packages/nvda-worker/src -- except three reaches (measured).** `WORKER_FILES` has 29 entries, none with a `/` (reading 3), and `nvda-worker` source imports no `@a11ign/*` package (item 10 reading 4). The three exceptions: (a) `run-server.cmd:29` re-applies `packages\worker-fleet\src\provisioning\apply-foreground-lock-timeout.ps1` on every start (a WARNING and continue if absent, so a layer-only checkout would start the worker and silently lose the ForegroundLockTimeout fix that makes every capture return 0 phrases -- the file's own comment says so); (b) `run-capture-check.cmd:33` runs `packages\lab\src\harnesses\capture-check.mjs`, which imports `../training/page-server.mjs`, `./captured-text.mjs` and three `@a11ign/worker-fleet/*` subpaths (capture-check.mjs:14-20); (c) both launchers `cd /d "%~dp0..\..\.."` (run-server.cmd:17, run-capture-check.cmd:14), i.e. they assume the package sits exactly three directories under the checkout root, `packages/nvda-worker/src/`. A layer repo whose package is at its root breaks all three launchers.
- **The parity hash is a CONTENT hash over one directory, so it survives the move; what breaks is where the directory is found (measured).** `codeVersion(dir)` (`code-version.mjs:34-53`) hashes the 29 files in `WORKER_FILES` order, CRLF-normalised, and `workerSourceDir()` is `new URL("./", import.meta.url)`. Three callers on the operator side compute `expected` from it: `fleet-playbook.mjs:85`, `lab-job.mjs:57` (both by RELATIVE PATH `../../nvda-worker/src/code-version.mjs`, because `control` runs from a raw checkout with no `node_modules` -- ADR 0012, enforced by `control-has-no-dependencies.test.ts`) and `deploy.yml:68` (`import("./packages/nvda-worker/src/code-version.mjs")` from `a11y_repo_root`); `worker-code-check.mjs:56` and `deploy-worker.mjs:35-36` do it by package name. **If the layer is installed from the registry into `node_modules`, `workerSourceDir()` points at the INSTALLED copy and the parity check compares the fleet against whatever version was installed, not against the commit the operator meant to deploy (inferred from code-version.mjs:27; not run).** ADR 0030's precondition would keep passing while comparing the wrong thing.
- **Dirty-tree and protocol guards read the layer by `git` in the CWD repository (measured).** `code-drift.mjs:210` runs `git status --porcelain -- packages/nvda-worker/src`; `check-worker-code.mjs:60` and `deploy-worker.mjs:255` run `git show HEAD:packages/nvda-worker/src/protocol-version.mjs`. In a second repo these read the wrong repository (an empty status = "clean", and a failing `git show` prints a note and returns, `deploy-worker.mjs:262-269`, i.e. the guard turns itself off, which is that file's own stated fear).
- **The provision stamp hashes files from THREE packages by fixed repo-relative path (measured):** `stamp-provision-revision.ps1:52-84` (`$ENVIRONMENT_FILES`) lists `packages/worker-fleet/.../provision-nvda-worker.ps1`, `packages/nvda-worker/src/run-server.cmd`, `apply-foreground-lock-timeout.ps1`, `packages/control/ansible/roles/worker/defaults/main.yml` and the speech-viewer module, and THROWS if one is missing under `$RepoPath` (:107-110). It hashes CONTENT only, CRLF-normalised (:107-121), so `provisionRevision` (a capture cache key and a fleet-consistency MUST_MATCH) is unchanged by the move IF the layer is placed at the same relative path and the bytes match -- a move that changes a path or line endings re-stamps the fleet and costs a recapture.
- **Control plane and lab checkouts are single-repo too (measured):** `lab-pipeline.mjs:603` and `fleet-playbook.mjs:887` do `cd ${CONTROL_CHECKOUT} && git fetch origin && git checkout <ref> && git merge --ff-only`; `tasks/run-job.yml:173-196` fetches and resolves ONE `lab_ref` in `lab_repo_path` (`/opt/a11y`, `group_vars/a11y_lab.yml:66`); `lab-reset.yml` restores tracked files against `origin/<ref>` (:82, :192, :220). The lab needs the layer only as an import: `capture-check.mjs` and `capture-fixtures.mjs` import `@a11ign/nvda-worker` (index.mjs pulls capture-core, so guidepup must resolve on the lab). `lab-job.yml:1083` runs capture-check from the lab checkout with `--worker=`.
- **`host:check` is NOT affected by the layer move (measured).** It is `node packages/agent-org/src/host-units.mjs` (package.json:178) and compares the 14 shipped `.service/.timer` units in `packages/agent-org/host/` with `~/.config/systemd/user`; all 7 services set `WorkingDirectory=/home/agent/repos/a11y-witness` and no host file mentions `nvda-worker` or `nvda-speech` (`git grep -nE "nvda-worker|nvda-speech" -- packages/agent-org/host | wc -l` gave 0). Its one cross-package import is `../../worker-fleet/src/cli-flags.mjs` and `../../guards/src/local-import-closure.mjs` (host-units.mjs:39-40), both staying in core. It stays correct as long as `control`, `lab`, `worker-fleet` and `guards` stay in the core repo; four units run `npm run primary:update` first (fleet-watch, lab-watch, work-tick, corpus-release-nightly), which updates ONE checkout, so a host holding a layer checkout gets it updated by nothing.
- **`worker:deploy` (deploy-worker.mjs, legacy UTM per-file push) is a different mechanism and is not the fleet path (measured).** It pushes each `WORKER_FILES` entry with `utmctl file push` to `C:\Users\witness\a11y-witness\src\capture\nvda` (deploy-worker.mjs:66) and needs macOS; `fleet:deploy` (package.json:104) is checkout-based. The parity hash treats both alike, so the per-file push would carry the layer's 29 files unchanged; only the checkout path needs a second repo.

**Size:** 10 files run a git verb on a host (reading 1) + 4 files carry the repo URL (reading 2) + 3 files reach a sibling package at runtime on the guest (reading 4 and the `apply-foreground-lock-timeout.ps1` line); the four rows named in DECISION touch about 25 files (9 + 7 + 5 + 4 as listed there).

**Decision:** Keep ONE fleet checkout of the core repository on every host and make each LAYER a declared second checkout at the path the monorepo already used (`packages/nvda-worker`), described in one manifest, `packages/control/layers.json` (`{ layer, remote, path, pin }`), read by one resolver, `packages/control/src/layer-checkouts.mjs`, which every operator-side caller uses instead of `../../nvda-worker/src/code-version.mjs`. `fleet:deploy` pins a PAIR (core sha, layer sha; `--layer-ref nvda-worker=<sha>`) and the parity hash stays a content hash computed from the LAYER checkout directory, never from `node_modules`. Placing the layer at the same relative path keeps `run-server.cmd`, the scheduled tasks, the launchers' `cd /d %~dp0..\..\..` and `provisionRevision` byte-identical, so **no worker re-provision and no cache-key change is forced by the split**. Cost: every git block in reading 1 gains a second repository (about 16 files over three fleet-gated rows) and `a11y_expected_commit` stops being one sha. Rejected: (1) a git submodule at `packages/nvda-worker` -- it gives the pair for free (the core commit records the layer sha) but every layer fix then needs a core commit, which is the coupling the split removes, and `git submodule update` would have to be added to a dozen guest calls that each already carry `-c core.hooksPath=a11y-no-hooks`; it remains the runner-up if the chairman wants one commit to name the whole fleet. (2) Installing the layer from the registry into `node_modules` on control and lab -- it would make `workerSourceDir()` point at an installed copy, defeating ADR 0030, and `control` has no `node_modules` by design (ADR 0012). (3) A self-contained worker repo that clones alone -- it needs `apply-foreground-lock-timeout.ps1` and `capture-check.mjs` moved into it, which is item 10's launcher edge and a fleet re-provision; do it later, not as part of the split. Order: row 6a (below, no fleet) first; 6b guests (`deploy.yml`, `provision.yml`, `provision-role.yml`, `packages.yml`, `bootstrap-windows-worker.ps1`, `reset-checkout.yml`, `update-origin-remote.yml`); 6c control plane and lab (`fleet-playbook.mjs:887`, `lab-pipeline.mjs:603`, `run-job.yml`, `lab-reset.yml`, `bootstrap-control-plane.sh`); 6d the launcher reach (`run-capture-check.cmd`, `apply-foreground-lock-timeout.ps1`, the stamp list). 6b to 6d are `Fleet: Yes`.

**Owner:** orchestrator (fleet and lab); row 6a may go to engineer.

**Depends on:** row 6a: none (it declares today's path and changes no behaviour). Rows 6b to 6d: item 10 (the launcher edge and the `by-name` rewrite decide what 6d owns) and item 8 (CI paths that also name `packages/nvda-worker`), and a layer repository that holds code.

### ITEM 7 — Access: the `gh` wrapper and the three accounts are organisation-wide, but the permission model on new repositories is `admin`, which the tracker forbids

**Readings.**

```
$ grep -c 'a11ign/[a-z]' packages/agent-org/host/gh; git config --global --get-all credential.helper | grep -v '^$'
0
```

*Live GitHub state, taken 07:10-07:25Z on 2026-09-26; it can differ by the time it is re-read.*

```
$ for r in a11ign screenreader-worker auth-capture-check corpus-backups; do echo "$r: $(gh api repos/a11ign/$r/collaborators --jq '.[]|.login+":"+.role_name' 2>&1 | head -n 7 | paste -sd' ' | cut -c1-150)"; done
a11ign: DanBeckDev:admin Cemmaw:write a11ign-bot:write a11ign-ai-workers:write a11ign-ai-leads:write a11ign-ci:write
screenreader-worker: DanBeckDev:admin a11ign-bot:admin a11ign-ai-workers:admin a11ign-ai-leads:admin a11ign-ci:admin
auth-capture-check: DanBeckDev:admin a11ign-bot:admin a11ign-ai-workers:admin a11ign-ai-leads:admin a11ign-ci:admin
corpus-backups: DanBeckDev:admin a11ign-bot:write a11ign-ai-workers:write a11ign-ai-leads:write a11ign-ci:write
```

*Live GitHub state, taken 07:10-07:25Z on 2026-09-26; it can differ by the time it is re-read.*

```
$ gh api orgs/a11ign/teams/bots/repos --jq '.[]|.name+" admin="+(.permissions.admin|tostring)+" push="+(.permissions.push|tostring)' | paste -sd';'
a11ign admin=false push=true;corpus-backups admin=false push=true;auth-capture-check admin=true push=true;agent-org admin=true push=true;screenreader-worker admin=true push=true
```

```
$ echo "bots-team refs: $(git grep -nwi bots | wc -l)"; git grep -c 'A11IGN_BOT_TOKEN' -- .github/workflows; git grep -n 'REPO=a11ign/a11ign\|"a11ign/a11ign"\|worker_repo_url:' -- packages/agent-org packages/control/ansible/roles ':!*.test.ts' | cut -c1-110
bots-team refs: 0
.github/workflows/auto-arm.yml:17
.github/workflows/nightly.yml:10
.github/workflows/trunk.yml:1
packages/agent-org/host/board-report-dispatch.sh:8:REPO="a11ign/a11ign"
packages/agent-org/src/org-watch.mjs:704:  const repo = process.env.GITHUB_REPOSITORY ?? "a11ign/a11ign";
packages/agent-org/src/reviewer/pr-review-verdict.sh:27:REPO=a11ign/a11ign
packages/control/ansible/roles/worker/defaults/main.yml:15:worker_repo_url: https://github.com/a11ign/a11ign.g
```

**What assumes one repository.**

- **measured** the routing wrapper `packages/agent-org/host/gh` names NO repository (reading 1: 0 matches for `a11ign/<name>`; it picks an ACCOUNT by `GH_CONFIG_DIR`, then `HERDR_WORKSPACE_ID` against `~/leads/workspaces.txt`, else `/home/agent/workers/gh`, refusing the person's account for any agent). The git credential helper is scoped to the HOST (`credential.https://github.com.helper = !/home/agent/.local/bin/gh auth git-credential`, reading 1), so a push to any `github.com` repository authenticates as whichever account the wrapper chose. **Nothing in the wrapper, the helper or the three units' `GH_CONFIG_DIR` needs to change for a new repository; what must be true is that the ACCOUNT holds a permission on the repository** (reading 2).
- **measured** the permission model on the new repositories is a different one from the tracker's. `a11ign/a11ign`: direct collaborators, `DanBeckDev` admin, `Cemmaw`, `a11ign-bot`, `a11ign-ai-workers`, `a11ign-ai-leads`, `a11ign-ci` all `write`. `screenreader-worker` and `auth-capture-check` (the template): the org team `bots` is attached with `admin` (reading 3), and every account except `Cemmaw` shows `admin` (reading 2). `corpus-backups` is the third pattern (bots team `push=true admin=false`, workers and leads write per reading 2, though its own service comments say the workers can only pull, see below).
- **measured** that contradicts the documented model: `packages/agent-org/host/gh` (line 9 comment) and `host-units.mjs:545` state `a11ign-ai-leads` is "write, not admin"; on both new repositories it is `admin` (reading 2). An AI account with admin can edit the ruleset and classic protection of the repository whose requirement `main-review-requirement.md` says nobody may walk past, and `branch-protection.test.ts` can then read admin-only `branches/main/protection` as the workers account: the two families of access (read the protection / be exempt from it) collapse. On `a11ign/a11ign` the workers account is `admin:false` and that read is 404 (measured earlier in the tree's own comments, `branch-protection.test.ts:25`).
- **measured** the `bots` team is referenced NOWHERE in the tree (reading 4: 0 matches for the word, backlog included). It exists only as live GitHub state (5 repositories listed, reading 3), so nothing pins that a new repository gets it, at what level, or that the team's membership equals the three accounts. There is no test, no runbook line and no Ansible task. Also notable: the org already holds a PRIVATE repository named `agent-org`, and `packages/agent-org` is this repository's own package name (`gh api orgs/a11ign/repos`): whatever it is, the name is taken.
- **measured** four sites hard-code the tracker as the ONLY repository (reading 4): `board-report-dispatch.sh:8` (`REPO="a11ign/a11ign"`), `reviewer/pr-review-verdict.sh:27` (its `gh pr review`, `statuses/<sha>` POST and reviews read at lines 80, 93, 103 all use `$REPO`), `org-watch.mjs:704` (fallback), `ansible/roles/worker/defaults/main.yml:15` (`worker_repo_url`, the only clone URL the Windows workers get). The reviewer script is the sharp one: run for a layer PR #7 it would post the review on the TRACKER's PR #7, a different pull request. `review-attribution.mjs:100` names the reviewing session `reviewer-${Number(prNumber)}`, so two repositories' PR #7 share one reviewer seat (measured: the function takes the number only).
- **measured** tokens in workflows: 5 `secrets.` references, all `A11IGN_BOT_TOKEN` (auto-arm.yml 17 mentions, nightly.yml 10, trunk.yml 1) plus `ORG_SECRETS_READ_TOKEN` at `trunk.yml:141`. **Not readable by this account**: `gh api orgs/a11ign/actions/secrets` is 403 (needs org admin) and `repos/a11ign/a11ign/actions/secrets` needs `admin:org`, so whether these are repository secrets (must be re-created per layer) or organisation secrets (inherited only if the layer is in the selected-repositories list) is UNKNOWN. Publishing uses OIDC (`release.yml` `id-token: write`), `NPM_TOKEN` appears only in a `release.yml` comment (line 355) and in `trunk.yml:138`, the liveness job that reads the ORG secret list with `ORG_SECRETS_READ_TOKEN`, so each publishing repository's npm trust is configured on npm's side, not in this tree; there are no deploy keys in the tree (`git grep -il "deploy.key"` finds only unrelated ssh docs).
- **inferred** (external knowledge, not tested): a workflow's `GITHUB_TOKEN` is scoped to the repository it runs in and cannot read ANOTHER PRIVATE repository; for a PUBLIC one any token, or none, can read. Because the layer must be public to carry a merge queue (ITEM 5), the core-head-against-layer-head job of ITEM 8 needs no cross-repository token to CHECK OUT, but anything that WRITES the tracker from a layer workflow (label a row, comment, close) needs the PAT, i.e. a per-layer secret.
- **measured** the corpus-backups precedent is that per-repository rights differ by design and are recorded in unit comments (`a11ign-corpus-release-nightly.service:32-36` says the workers account can only READ it; `host-units.mjs:485` requires `ceo`'s ruling for a unit to use the human account there), but the `collaborators` reading shows `write` for the workers account. Comments and live state disagree on that repository today, which is the argument for a declared, tested list.

**Size:** 4 files hard-code the tracker as the only repository (reading 4: `board-report-dispatch.sh`, `reviewer/pr-review-verdict.sh`, `org-watch.mjs`, `roles/worker/defaults/main.yml`) and 0 files in the wrapper (reading 1); the permission state of 2 repositories is already divergent (reading 2) and is declared nowhere (the `bots` team has 0 references, reading 4).

**Decision:** Keep the wrapper and the credential helper as they are (they are account-scoped and host-scoped; changing them would add a per-repository table where none is needed). Declare, in one shipped file, the access every code repository must give each account, and pin it: the three agent accounts get `write` (matching `a11ign/a11ign` and `corpus-backups`), NEVER `admin`; the person's account is the only admin; the `bots` team on a layer is `push`, not `admin`. Then change the two layer repositories that exist (`screenreader-worker`, and the template if it is to be reused) from team-`admin` to team-`push`. This is an org-admin act (the chairman's), so the row ships the declaration, the test and a read-only live check and asks for the edit; it does not perform it. Costs: one more declared list to keep in step with the `code-repositories` list of ITEM 5 (the repository names come from `docs/code-repositories.json`, item 2, and a test pins that `repository-access.json` names exactly that set, so there is one list of repositories and one table of who may do what to each), and the layers lose the accidental ability of workers to read `branches/main/protection`, so the protection read there falls back to the non-admin instrument, exactly as on the tracker. Rejected: giving the workers admin on layers so the stronger admin read works (it makes the requirement a matter of trust, which `enforce_admins` was set to avoid); an org-level `bots` permission change (it would move the tracker's own team level); and per-repository copies of the wrapper (there is nothing repository-shaped in it to copy).

**Owner:** engineer for the declaration and test; `ceo` for the permission change (a decision only the owner can make: the permission edit).

**Depends on:** none.

### ITEM 8 — CI: 14 workflows check out one repository each; the cross-repository gate installs what is PUBLISHED and nothing builds core-head against a layer's head

**Readings.**

```
$ ls .github/workflows | wc -l; for f in .github/workflows/*.yml; do b=$(grep -v '^ *#' $f); printf '%-27s co=%s otherRepoKey=%s names=%s org=%s code=%s\n' $(basename $f) $(echo "$b"|grep -c 'uses: actions/checkout') $(echo "$b"|grep -Ec '^ *repository:') $(echo "$b"|grep -c 'a11ign/a11ign') $(echo "$b"|grep -Ec 'packages/agent-org|scripts/[a-z-]*board|gh (pr|issue|project|api)') $(echo "$b"|grep -Ec 'rstest|npm run (build|test|lint|typecheck|guards)|pnpm exec|tsc|pytest|changeset|npx a11ign|uses: \./|registry-consumer-gate|generate-consumer'); done
14
action-smoke.yml            co=1 otherRepoKey=0 names=0 org=0 code=2
auto-arm.yml                co=4 otherRepoKey=0 names=0 org=4 code=0
board-report.yml            co=1 otherRepoKey=0 names=0 org=3 code=0
board-summary-check.yml     co=1 otherRepoKey=0 names=0 org=2 code=0
capture-regression.yml      co=1 otherRepoKey=0 names=0 org=0 code=0
ci.yml                      co=7 otherRepoKey=0 names=0 org=3 code=19
consumer-gate.yml           co=2 otherRepoKey=0 names=1 org=0 code=3
nightly.yml                 co=8 otherRepoKey=0 names=0 org=7 code=6
registry-consumer-gate.yml  co=2 otherRepoKey=0 names=0 org=0 code=7
release.yml                 co=1 otherRepoKey=0 names=0 org=0 code=11
reusable-acceptance.yml     co=1 otherRepoKey=0 names=0 org=2 code=1
reusable-board.yml          co=1 otherRepoKey=0 names=0 org=0 code=2
reusable-build-test.yml     co=1 otherRepoKey=0 names=0 org=0 code=23
trunk.yml                   co=4 otherRepoKey=0 names=0 org=6 code=7
```

```
$ node --input-type=module -e 'import{readFileSync as r}from"node:fs";const s=await import("./scripts/select-changed-tests.mjs"),c=await import("./scripts/ci-changed.mjs"),R=process.cwd(),A=c.knownPackages(R),G=c.readWorkspaceDependencyGraph(R,A);for(const f of ["packages/nvda-worker/src/server.mjs","packages/nvda-worker/src/capture-pure.mjs"]){const{testPackages:T}=c.classify([f],A,G,{repoRoot:R}),{result:x,everyTestFile:E,closureOf:C}=s.selectionFor([f],{repoRoot:R,allPackages:A,testPackages:T}),g=s.alwaysRunTests(E,{closureOf:C,repoRoot:R}),k=s.narrowByDeclaredScope(g,[f],{readSource:p=>r(p,"utf8")});const n={};for(const y of g){const q=y.test.split("/")[1];n[q]=(n[q]||0)+1}console.log(f.split("/").pop(),"selected="+x.selectedTests.length,"guards="+g.length,"afterScope="+k.kept.length,"of="+E.length,JSON.stringify(n))}'
server.mjs selected=9 guards=230 afterScope=214 of=729 {"agent-org":9,"cli":2,"control":11,"judge":8,"lab":181,"nvda-worker":3,"scorer":1,"worker-fleet":15}
capture-pure.mjs selected=55 guards=230 afterScope=214 of=729 {"agent-org":9,"cli":2,"control":11,"judge":8,"lab":181,"nvda-worker":3,"scorer":1,"worker-fleet":15}
```

```
$ echo "changesets=$(ls .changeset/*.md | wc -l) testFiles=$(git ls-files '*.test.*' | wc -l) nvdaWorkerTests=$(git ls-files 'packages/nvda-worker/*.test.*' | wc -l) mergeGroupWorkflows=$(git grep -l 'merge_group:' -- .github/workflows | wc -l) privatePkgs=$(git grep -l '"private": true' -- 'packages/*/package.json' | wc -l)/$(git ls-files 'packages/*/package.json' | wc -l)"
changesets=208 testFiles=731 nvdaWorkerTests=83 mergeGroupWorkflows=1 privatePkgs=5/12
```

```
$ git grep -c 'git+https://github.com/a11ign/a11ign.git' -- 'packages/*/package.json'
packages/cli/package.json:1
packages/evidence/package.json:1
packages/judge/package.json:1
packages/nvda-worker/package.json:1
packages/pdf/package.json:1
packages/scorer/package.json:1
packages/worker-fleet/package.json:1
```

THE 14 WORKFLOWS AS A READING (columns from reading 1; KIND is my classification, with the two the regexes got wrong corrected by hand and marked *):

| workflow | (a) checks out ONE repo | (b) names `a11ign/a11ign` (non-comment) | (c) KIND |
|---|---|---|---|
| action-smoke.yml | yes (1 checkout, no `repository:`) | no | code-only (`uses: ./`) |
| auto-arm.yml | yes (4) | no | tracker-only (arms and update-branches PRs; per-repo, needs the PAT) |
| board-report.yml | yes (1) | no | tracker-only (board editions, Discussions) |
| board-summary-check.yml | yes (1) | no | tracker-only |
| capture-regression.yml | yes (1) | no | code-only* (runs `packages/lab/src/harnesses/capture-check.mjs`) |
| ci.yml | yes (7) | no | BOTH: `ts`, `python`, `ansible`, `changeset`, `rulesFitness`, `guardSweep` are code; `board`, `deliberateRefusals`, `acceptance`, `ownedPaths` are the tracker's PR contract |
| consumer-gate.yml | yes (2) | YES, `uses: a11ign/a11ign@<sha>` at line 51 | code-only (the published Action) |
| nightly.yml | yes (8) | no | BOTH (coverage and doc report; ruleset read, board membership) |
| registry-consumer-gate.yml | yes (2) | no | code-only (installs the registry; cross-repository by nature, checks out only this repo for its script) |
| release.yml | yes (1) | no | code-only |
| reusable-acceptance.yml | yes (1) | no | BOTH (runs the PR body's Acceptance through `agent-org/acceptance-commands.mjs`) |
| reusable-board.yml | yes (1) | no | tracker-only* (runs `board-*.test.ts`) |
| reusable-build-test.yml | yes (1) | no | code-only |
| trunk.yml | yes (4) | no | BOTH (revert/liveness watchdogs, `closeRows`; build and test of main's tip) |

Totals: 14 of 14 check out one repository and none carries a `repository:` key (reading 1 column `otherRepoKey`); 1 names `a11ign/a11ign` outside a comment; tracker-only 4, code-only 6, both 4.

**What assumes one repository.**

- **measured** every workflow assumes the repository it runs in holds BOTH the code and the org machinery: 0 of 14 check out a second repository (reading 1), so no workflow today can build core against a layer or the reverse. The tracker-only 4 (`auto-arm`, `board-report`, `board-summary-check`, `reusable-board`) stay; the both 4 (`ci`, `nightly`, `reusable-acceptance`, `trunk`) must be split into the code half a layer repeats and the tracker half it must not.
- **measured** three of `ci.yml`'s twelve jobs (`deliberateRefusals`, `acceptance`, `ownedPaths`) run scripts that live in `packages/agent-org/src/` (`merge-guard.mjs --ci-gate`, `closes-mismatch-check.mjs`, `acceptance-commands.mjs`, `owned-path-signoff.mjs`) against the PR body and PR number of the repository they run in. In a layer repository that directory is absent (agent-org stays in the tracker, per `ceo`), so either the layer copies the scripts (the drift this repo names as its most-repeated defect) or calls tracker-hosted reusable workflows. `reusable-build-test.yml` is already a `workflow_call` unit used by `ts`/`python` through a LOCAL path (`uses: ./.github/workflows/...`); a cross-repository call `uses: a11ign/a11ign/.github/workflows/<file>@<sha>` is possible for a public repository and checks out the CALLER (external knowledge, not tried here).
- **measured** the token-less `acceptance` job (`reusable-acceptance.yml`, `permissions: contents: read`, no secret) installs with pnpm, builds, then runs the PR body's stated Acceptance through `packages/agent-org/src/acceptance-commands.mjs`. A layer PR's Acceptance would run in the layer checkout; the command guard that refuses tokens, `gh` and fleet is tracker code.
- **measured** the guards dominate a layer-only run and live in the tracker (readings 2 and 3, reproducing `#2610`'s measurement below): `server.mjs` selects 9 tests, `capture-pure.mjs` 55, plus 214 always-run guards after `narrowByDeclaredScope` (230 before it) of 729 test files in the selector's view (731 by `git ls-files '*.test.*'`: the two the selector does not see are `packages/lab/nightly/bounded-window-reads.test.ts` and `isolation-gate-real-consumer.test.ts`, which run only in `nightly`). The 230 sit in `lab` (181), `worker-fleet` (15), `control` (11), `agent-org` (9), `judge` (8), `nvda-worker` (3), `cli` (2), `scorer` (1). So a layer repository that carries only its own tests runs at most its 83 test files (reading 3, `nvdaWorkerTests=83`, 3 of them guards) versus 9-55 + 214 today: the win is real only if the 181 `lab` guards stay in core and are NOT copied. The layer's PR then no longer runs the tree-wide guards over core, which is exactly the coverage the head gate below must replace.
- **REFERENCE (not my measurement)**: row #2610's own body states "9 selected for `server.mjs` and 55 for `capture-pure.mjs`, plus 214 always-run guard tests, of 729 test files" (from `gh issue view 2610 --json body`, its Open-check reading). I re-ran the same selector and got the same numbers (reading 2), which confirms the number, not the method: both use the shipped selector, so any selector defect is shared.
- **measured** how always-run is decided: `scripts/select-changed-tests.mjs:373 alwaysRunTests` marks a test a guard when `discoversFromTree` says its source enumerates tracked files or walks a directory (skipping build output), or when any module in its import closure does (`asHelper` stricter rule); `narrowByDeclaredScope` (#929) then drops guards whose declared walk scope the diff cannot reach. `scripts/ci-changed.mjs` classifies the diff into booleans and `testPackages` = touched packages plus their transitive dependents, computed from the real `package.json` dependency graph, not a hand-written map.
- **measured** the #2519 gate (`registry-consumer-gate.yml`, `registry-consumer-gate.test.ts`; the 14th workflow, pinned by name in `workflow-count.test.ts`) installs `a11ign@<spec>` from the REGISTRY into an empty directory: job `install` (ubuntu) then `combination` (windows-2022, NVDA). Triggers: daily, after `release` completes (`workflow_run`), on dispatch. It proves the PUBLISHED contract. It cannot see a layer's unpublished head or core's, and its own header says it "says which layers it did NOT check". So today a layer merge is tested against core only after it is published and the next daily run, a gap of up to a release cycle plus a day. **A head gate does not exist; this row is it.**
- **measured** release and changesets are one pipeline for seven public packages: `release.yml` runs `changeset publish` with OIDC provenance (`id-token: write`), and `scripts/manifest-repository-check.mjs` (run by `release.yml`, #1536) refuses any manifest whose `repository.url` is not `GITHUB_REPOSITORY` (reading 4: all 7 public manifests name `a11ign/a11ign`; `packages/nvda-worker/package.json` among them). `.changeset/config.json` has `baseBranch: main`, empty `linked`/`fixed`, `updateInternalDependencies: patch` (an in-workspace mechanism), and 208 `.md` files (README.md is one). `@a11ign/lab` (private) depends on `@a11ign/nvda-worker` and `@a11ign/worker-fleet` depends on it too (`grep -n '@a11ign/nvda-worker' packages/lab/package.json packages/worker-fleet/package.json` gives `lab/package.json:13` and `worker-fleet/package.json:66`, both the range `0.0.0`): after the split those become registry ranges, so core's tests would test the PUBLISHED layer, not its head.
- **measured** `ci.yml:115` is the only workflow that listens to `merge_group` (reading 3). Each layer's own required workflow needs it or its queue stalls (ITEM 5).

**Size:** 14 workflows (reading 1): 4 tracker-only, 6 code-only, 4 both, 0 with a second checkout; 1 workflow to add (the head gate) and 1 pinned count to change (`workflow-count.test.ts`, 14 to 15); 7 manifests to re-point at their repository when a package moves (reading 4).

**Decision:** Add the missing gate: a reusable workflow `head-consumer-gate.yml`, hosted in core and called by every repository, that checks out core's head and the layer's head side by side (both public, so `actions/checkout` with a `repository:` key needs no token; that is the first workflow in this repository with one, reading 1), builds them together and runs the combination proof #2519 runs on published packages. In core it runs on every PR against each layer's default branch; in a layer it runs on the layer's PR against core's default branch, called by `uses:` at a pinned SHA. Its decision (which pair, which refs, refusing to pass when either checkout is unreadable) is a pure script with a test with positive controls. Keep #2519 as it is: it answers a different question (what the registry serves) and the two together are the contract. Costs: one more workflow (the 15th), a Windows job per PR that touches a contract path (route it through `ci-changed`'s `testPackages` so it does not run on docs), and a rule that a change breaking both sides lands layer-first with a compatible core (there is no cross-repository merge group, external knowledge). Rejected: copying the tree-wide guards into each layer (wins nothing, per #2610); running the head gate only nightly (the gap #2519 already has); and replacing the registry gate with the head gate (a published `a11ign` that cannot resolve its sibling passes a head build and is the very failure #2519 was built for). Two further rows are implied and NOT in this one: the layer's thin `ci.yml` calling core's reusable workflows, and per-repository `release.yml`, changesets and manifest `repository.url`.

**Owner:** engineer (no fleet: `windows-2022` is a GitHub-hosted runner, as in #2519).

**Depends on:** item 5 (the layer's `gate` job and `merge_group` trigger come after its protection).

### ITEM 9 — Agent rules: the loaded set is budgeted per repository, the shared rules are single-sourced, and a layer session cannot afford the nested file it inherits

**Readings.**

```
$ wc -c CLAUDE.md .claude/rules/*.md packages/nvda-worker/CLAUDE.md
 5271 CLAUDE.md
 1739 .claude/rules/agent-practices.md
 2033 .claude/rules/gh-api-budget.md
 2214 .claude/rules/guards-and-assertions.md
 3075 .claude/rules/main-review-requirement.md
 4321 .claude/rules/org-routing-and-timers.md
 1325 .claude/rules/waiting-conditions.md
17968 packages/nvda-worker/CLAUDE.md
37946 total
```

```
$ grep -nE "BUDGET_BYTES =|WARN_BYTES =" packages/lab/src/packaging/prefix-budget.mjs; grep -nE "^const LOADED|^import \{ RULES_FILES" packages/lab/src/packaging/prefix-budget.test.ts
34:export const BUDGET_BYTES = 20_000;
40:export const WARN_BYTES = 18_000;
55:import { RULES_FILES } from "./rules-files.ts";
62:const LOADED = ["CLAUDE.md", ...RULES_FILES] as const;
```

```
$ awk '/^## /{sec=$0} {n[sec]+=length($0)+1} END{for(s in n) print n[s], s}' CLAUDE.md | sort -rn
1932 ## What this is
1833 ## Where else to look
1442 ## Code conventions
28 
```

```
$ git grep -nE '"worktree", "add"' -- packages/agent-org/src ':!*.test.*' | cut -c1-140
packages/agent-org/src/carry-branch.mjs:126:      run("git", ["worktree", "add", "--detach", dir, `origin/${branch}`], { cwd: repoRoot });
packages/agent-org/src/row-claim.mjs:1270:    run("git", ["worktree", "add", "-b", branch, worktree, "origin/main"]);
packages/agent-org/src/wake.mjs:1149:    else git("git", ["-C", repoRoot, "worktree", "add", "--quiet", "--force", "--detach", path, head]);
packages/agent-org/src/wake.mjs:4068:    const made = git(["worktree", "add", "--detach", dir, "origin/main"], primary);
```

**What assumes one repository.**

- **The budget is enforced by ONE test over ONE named set, and nested files are outside it (measured).** `prefix-budget.test.ts:62` sets `LOADED = ["CLAUDE.md", ...RULES_FILES]` (6 rules files, named in `rules-files.ts`, never globbed); `BUDGET_BYTES = 20_000` and `WARN_BYTES = 18_000` are `ceo`'s numbers (`prefix-budget.mjs:34,40`; only `ceo` moves them, and `prefix-budget.test.ts` retypes them as `CEO_*` so a change reads red). The loaded set is 19,978 B (reading 1: 5,271 + 14,707), 22 B under the refusal. `packages/nvda-worker/CLAUDE.md` (17,968 B) is NOT in the set and no test budgets it; only root `CLAUDE.md` has a second limit (`claude-md-links.test.ts:39`, 40,000 characters).
- **The set is asserted by 19 test files that read the rules by path (measured):** `git grep -lE "RULES_FILES|\.claude/rules" -- '*.test.ts' '*.test.mjs' | wc -l` gave 19 (16 in `packages/lab/src/packaging`, 1 in `packages/lab/src/training`, 1 in `control`, 1 in `nvda-worker`). `content-preservation.test.ts` names `packages/nvda-worker/CLAUDE.md` as one of four nested destinations (`:212`) and refuses text that vanished; `wake-engineer-brief.test.ts:172` pins the heading `## The capture path` in it and names three worker files it governs; `corpus-size-figures.test.ts:101`, `pr-open-region.test.ts:189,194` and `region-paths.test.ts:697-741` also name it. When that file moves to a layer repo these tests read a file that is no longer there (item 10 records them as reaches INTO the layer).
- **What a layer session loads is the layer repository's own tree, and nothing of this repository (inferred from how Claude Code works; not measured here).** Claude Code loads `CLAUDE.md` from the working directory up to the filesystem root plus `.claude/rules/*.md` of the project, so a session in a layer repo gets the layer's `CLAUDE.md` and rules, NOT the six files above. Two external options exist that could reach across repositories -- an `@path` import line inside a `CLAUDE.md`, and `--add-dir` with the environment option that makes added directories' `CLAUDE.md` load (`CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD`). **Both are external knowledge, unverified in this session; nothing in the tree uses either (`git grep -nE "add-dir|ADDITIONAL_DIRECTORIES|@import" -- ':!docs/backlog.md' ':!*.test.*' | wc -l` gave 0).**
- **Consequence, computed (measured bytes, inferred composition): moving the nested file to a layer root makes it load in EVERY layer session, and it does not fit.** Layer root `CLAUDE.md` = today's nested 17,968 B (32 B under the 18,000 B warn band on its own). Adding only the CODE half of the shared rules -- `guards-and-assertions.md` 2,214 + `agent-practices.md` 1,739 + the `## Code conventions` section 1,442 = 5,395 B -- gives 23,363 B, **3,363 B over the 20,000 B refusal**. Copying all six rules plus `CLAUDE.md` would give 37,946 B. So the layer cannot be handed the shared rules and keep the same budget without evicting narrative from the nested file (the budget's own remedy, `prefix-budget.mjs` REMEDY), or `ceo` ruling a number for it. **This ADR does not move the budget.**
- **Which shared rules a layer engineer needs (judgement from the headings and bodies, sizes measured):** CODE, needed: `guards-and-assertions.md` (2,214; `rm` guard, assertion emptiness), the `## Code conventions` section of `CLAUDE.md` (1,442; ESLint gates, Clean Code subset). BOTH: `agent-practices.md` (1,739; subagent model routing, context, web research, scratchpad -- host-level, not tracker). ORG-ONLY, not needed by a layer session: `org-routing-and-timers.md` (4,321; timers, lane labels, who reads what), `waiting-conditions.md` (1,325; labels, blocked-by, Not-before -- rows live only in the tracker). HOST or per-repository, needed only where the session runs `gh` or merges: `gh-api-budget.md` (2,033; which gh account a wrapper picks) and `main-review-requirement.md` (3,075; `main` needs one approving review, read behaviourally, two surfaces; the layer repo's own protection is item 4's question, not a rule text to copy). ORG-ONLY sum = 5,646 B; excluded-or-deferred sum = 10,754 B (5,646 + 2,033 + 3,075).
- **Where sessions and worktrees are created, all of ONE repository (measured, reading 4):** `row-claim claim --branch --worktree` runs `git worktree add -b <branch> <path> origin/main` from the CWD repository (`row-claim.mjs:1270`), and wake's spawner always claims `--worktree=../wt-<row>` on `agent/<slug>-<row>` (`wake.mjs:4155`); standing role seats use `<worktreesDir>/role-<role>` created `--detach` from `origin/main` of the single `primary` checkout (`wake.mjs:4062-4068`, where `primary = join(root, basename(PRIMARY_CHECKOUT))` and `PRIMARY_CHECKOUT = ${HOST_REPOS}/a11y-witness`, `wake.mjs:3976,3995`); the reviewer of PR n runs in `<root>/reviews/reviewer-<n>` (`wake.mjs:1149`, `reviewCheckoutPath`); `carry-branch.mjs:126` makes a temporary detached tree. So a layer-repo engineer needs a `../wt-<row>` (or `role-*`) tree OF THE LAYER repository, and today every one of these creators takes the tracker checkout as its only repository (the host list is not a reading because it is host state: 73 trees when measured -- 63 `wt-*`, 6 `role-worker-*`, 1 `role-product-manager`, 1 primary, 2 `reviewer-*`).
- **`--worktree`'s claim also reads the ROW through the CWD repository's git remote for gh (inferred: `git grep -cE "--repo|a11ign/a11ign|REPO\b" -- packages/agent-org/src/row-claim.mjs` gave 15 matching lines; not read line by line).** With Issues disabled on a layer repo, a claim run inside a layer checkout would ask the wrong repository for the row. Whichever agent measured item 1 owns that.

**Size:** 6 shared rules files + 1 nested file + 19 test files read the loaded set (readings 1, 2; `git grep -lE "RULES_FILES|\.claude/rules" ...` = 19); 4 worktree-creating sites (reading 4).

**Decision:** Keep the org-only rules (`org-routing-and-timers.md`, `waiting-conditions.md`, and the host/protection pair until item 4 rules) in the tracker repository only, and single-source the CODE rules once in core: move the `## Code conventions` section of `CLAUDE.md` into its own file `.claude/rules/code-conventions.md` (the same 1,442 B, so the core set still totals 19,978 B and the content-preservation pins are moved with it), and name the two sets in `rules-files.ts` as `ORG_RULES` and `CODE_RULES` (`guards-and-assertions.md`, `agent-practices.md`, `code-conventions.md`). A layer repository gets `CODE_RULES` BY REFERENCE, never by copy: its root `CLAUDE.md` carries one `@`-import line per code-rules file pointing at the host's primary core checkout, and the layer's own tooling refuses a file named `guards-and-assertions.md` (or any name in `CODE_RULES`) inside the layer's `.claude/rules/` -- a copy is refused by name, so it cannot drift. **That delivery mechanism is unverified here: whether a session in a git worktree loads an `@`-import that leaves its repository without an approval prompt, and whether `.claude/rules` of an `--add-dir` directory loads, must be measured on the host with one real session before the row is finished (row 9b, `Fleet: No`, a measurement, not a guess).** Budget: the layer's projected set (its root `CLAUDE.md` plus `CODE_RULES`) must pass the SAME 20,000 B refusal and 18,000 B warn band; the row that moves the nested file therefore evicts at least 3,363 B (target 3,500 B) of incident narrative from `packages/nvda-worker/CLAUDE.md` into `docs/` first (keep the RULE, move the narrative, do not delete; the preservation test refuses deletion). Cost: two rules-file edits in core, one narrative eviction of about 3.4 KB, one host measurement. Rejected: (1) copying the shared files into each layer -- they drift, and a byte-compare guard makes a copy a second source that must be kept in step by hope; (2) a git submodule of `.claude/rules` -- `git worktree add` does not initialise submodules, so every `../wt-<row>` starts with empty rules; (3) asking `ceo` to raise the layer budget -- it may become necessary, but the first move is the one `ceo` already ruled (#2217): evict narrative, and a budget that moves the first time it binds is not a budget.

**Owner:** engineer (rows 9a and 9c); orchestrator for the host measurement (row 9b); `ceo` only if the eviction cannot reach the budget.

**Depends on:** item 2 (the repository list and the layer's name) and item 5 (the treatment of `main-review-requirement.md` is item 5's ruling).

### ITEM 10 — Undeclared edges: 115 non-comment lines in 57 files reach INTO nvda-worker/nvda-speech by path, 9 files reach OUT, and the MOVE needs most of them closed

**Readings.**

```
$ git grep -nE 'nvda-(worker|speech)[/\\]' -- . ':!packages/nvda-worker' ':!packages/nvda-speech' ':!docs' ':!*.md' ':!pnpm-lock.yaml' ':!.changeset' ':!runs' ':!*/fixtures/*' | grep -v "@a11ign/nvda-" | grep -vE "^[^:]+:[0-9]+:\s*(//|\*|#|/\*|rem |<!--)" | wc -l
115
```

```
$ git grep -nE 'nvda-(worker|speech)[/\\]' -- . ':!packages/nvda-worker' ':!packages/nvda-speech' ':!docs' ':!*.md' ':!pnpm-lock.yaml' ':!.changeset' ':!runs' ':!*/fixtures/*' | grep -v "@a11ign/nvda-" | grep -vE "^[^:]+:[0-9]+:\s*(//|\*|#|/\*|rem |<!--)" | cut -d: -f1 | sort -u | grep -vE "\.test\.(ts|mjs)$"
action.yml
.c8rc.json
.github/ISSUE_TEMPLATE/backlog-row.yml
package.json
packages/control/ansible/auth-leak-check.yml
packages/control/ansible/deploy.yml
packages/control/ansible/roles/worker/tasks/tasks.yml
packages/control/src/fleet-playbook.mjs
packages/control/src/lab-job.mjs
packages/lab/src/harnesses/occurrence-verdict-stability.mjs
packages/worker-fleet/src/check-worker-code.mjs
packages/worker-fleet/src/code-drift.mjs
packages/worker-fleet/src/deploy-worker.mjs
packages/worker-fleet/src/protocol-guard.mjs
packages/worker-fleet/src/provisioning/build-lean-worker-image.ps1
packages/worker-fleet/src/provisioning/stamp-provision-revision.ps1
```

```
$ git grep -nE 'nvda-(worker|speech)[/\\]' -- . ':!packages/nvda-worker' ':!packages/nvda-speech' ':!docs' ':!*.md' ':!pnpm-lock.yaml' ':!.changeset' ':!runs' ':!*/fixtures/*' | grep -v "@a11ign/nvda-" | grep -vE "^[^:]+:[0-9]+:\s*(//|\*|#|/\*|rem |<!--)" | cut -d: -f1 | sort -u | grep -E "\.test\.(ts|mjs)$" | awk -F/ '{print $1"/"$2}' | sort | uniq -c
      3 packages/cli
      3 packages/evidence
     28 packages/lab
      7 packages/worker-fleet
```

```
$ git grep -nE "(\.\./){2,}(cli|evidence|guards|scorer|worker-fleet|lab|\.\./docs)|packages.lab.src.harnesses" -- packages/nvda-worker packages/nvda-speech ':!*.md' | cut -d: -f1,2
packages/nvda-worker/src/auth-flow.test.ts:32
packages/nvda-worker/src/auth-flow.test.ts:100
packages/nvda-worker/src/budget-ladder.test.ts:32
packages/nvda-worker/src/container-prefix-parity.test.ts:155
packages/nvda-worker/src/focus-target-suspect-parity.test.ts:25
packages/nvda-worker/src/off-origin-activation.test.ts:108
packages/nvda-worker/src/run-capture-check.cmd:33
packages/nvda-worker/src/screenreader-coverage-doc.test.ts:37
packages/nvda-worker/src/tests-run-without-a-screen-reader.test.ts:7
packages/nvda-worker/src/windows-trim-parity.test.ts:28
```

**What assumes one repository.**

- **The premise reproduces exactly (measured).** #2612's 115 lines / 57 files / 41 test files / 16 others, and #2613's split of the 41 (28 lab, 7 worker-fleet, 3 cli, 3 evidence), all read the same here (readings 1-3), using #2613's own command. Sorted by who reaches in, the 16 non-test files are: **source (9):** `control` 2 (`fleet-playbook.mjs:85`, `lab-job.mjs:57`, both real `import`s of `../../nvda-worker/src/code-version.mjs`), `worker-fleet` 6 (`check-worker-code.mjs:60` and `deploy-worker.mjs:255` `git show HEAD:packages/nvda-worker/...`, `code-drift.mjs:210` `git status -- packages/nvda-worker/src`, `protocol-guard.mjs:93` a message string, `build-lean-worker-image.ps1:26` and `stamp-provision-revision.ps1:54`), `lab` 1 (`occurrence-verdict-stability.mjs:56`, reads `nvda-speech/nvda_speech/labels.py` at runtime and is the ONLY edge INTO nvda-speech: `git grep -nE "nvda_speech" -- . ':!packages/nvda-speech' ':!*.md' ':!docs' ':!pnpm-lock.yaml' ':!.changeset'` prints that one line). **Config, CI and ansible (7):** `action.yml:584` (`node packages/nvda-worker/src/server.mjs`), `.c8rc.json`, `package.json:37` (`"worker": "node packages/nvda-worker/src/server.mjs"`), `.github/ISSUE_TEMPLATE/backlog-row.yml` (a placeholder string), and Ansible `deploy.yml:68`, `roles/worker/tasks/tasks.yml:73`, `auth-leak-check.yml`. The 11 fleet files #2612 counts (worker-fleet x6, control x5 with three Ansible) are exactly those in reading 2 minus config/CI/lab. My own first pass with a forward-slash-only regex found 110 lines / 57 files because it missed the Ansible `\\packages\\nvda-worker\\` spellings; #2612/#2613's regex (`[/\\]`) is the right one.
- **`control` and `worker-fleet` reach in two different ways and only one can become a package dependency (measured).** `worker-fleet` and `lab` DECLARE `@a11ign/nvda-worker` (`worker-fleet/package.json:66`, `lab/package.json:13`) and already import it by name: 4 files in `worker-fleet` and 12 in `lab` (`git grep -nE "from \"@a11ign/nvda-worker[^\"]*\"|import\(\"@a11ign/nvda-worker" -- packages ':!packages/nvda-worker' ':!*/fixtures/*'` lists them). `control` declares nothing (`packages/control/package.json:13`, `"dependencies": {}`) and MUST run from a raw checkout (ADR 0012, `control-has-no-dependencies.test.ts`), so its two imports and `deploy.yml:68` cannot become `by-name`: they need item 6's resolver over a declared layer checkout.
- **The reaches OUT of the layer are 8 test files and 1 launcher, 9 files (measured, reading 4); #2612's Open-check agrees.** Targets: `cli` (auth-flow.test.ts:32,100), `worker-fleet` (budget-ladder.test.ts:32 `source-walk.mjs`; windows-trim-parity.test.ts:28 a `.ps1`), `scorer` (container-prefix-parity.test.ts:155, a `.py`), `evidence` source (focus-target-suspect-parity.test.ts:25 `verify.js`; off-origin-activation.test.ts:108 `left-site.ts`), `guards` (tests-run-without-a-screen-reader.test.ts:7 `files-under.mjs`), core `docs/` (screenreader-coverage-doc.test.ts:37) and `lab` (run-capture-check.cmd:33, a RUNTIME reach on the Windows worker). The two prose hits `git grep` also prints for a looser regex (`capture-pure.mjs:2065`, `focus-reveal-walk-depth.test.ts:7`) are comments and not edges. `nvda-worker` source imports NO `@a11ign/*` package (`git grep -nE "(from|import\(|require\()\s*[\"']@a11ign/" -- packages/nvda-worker packages/nvda-speech` prints only its own README, `isolation-smoke.mjs` self-import, and 11 `@a11ign/evidence` imports in TEST files; `@a11ign/evidence` is its declared devDependency, `nvda-worker/package.json:30`).
- **Whether an out-edge can be `by-name` depends on the target being installable by a layer repository (measured, `package.json` private flags):** published, so nameable: `evidence` (Apache-2.0), `cli`, `scorer`, `worker-fleet`, `judge`, `pdf`. NOT published (`private: true`): `guards`, `lab`, `control`, `agent-org`, `nvda-speech`. So `tests-run-without-a-screen-reader.test.ts` (guards) and the launcher (lab) cannot be `by-name` at all; the two reads of a `.ps1` and a `.py`, and the `docs/` read, cannot be `by-name` either because the published `files` list is `src`, README and LICENSE (`nvda-worker/package.json` `files`; #2613 says the same for the layer's own files, and the argument is symmetric). Those four out-edges can only be CUT (assertion moved to the core side, per #2612 done-when 4).
- **`nvda-speech` is a different licence and a different language (measured).** `GPL-3.0-or-later`, `private: true`, no `src`, a Python package (`nvda_speech/`); `nvda-worker` is `AGPL-3.0-or-later` and published. `licence-boundary.test.ts` pins the boundary (per #2612). Its one inbound edge (lab reading `labels.py`) has no by-name form at all, because it is a private, unpublished Python file: it must be cut (data behind an export, or moved) or the two share a repository.

**Size:** 115 lines in 57 files reach in (41 test files, 9 source files, 7 config/CI/ansible files; readings 1-3); 9 files reach out (8 tests + 1 launcher; reading 4).

**Decision:** The MOVE requires, at the moment code leaves the repository: (A) every `direction: "out"` baseline entry closed as `cut`, i.e. the parity assertion now lives in core and reads the layer by package name or the layer no longer needs it -- **none may remain `by-name` to a private package, and none may remain `owned-by`** (the one launcher edge `run-capture-check.cmd:33` is `owned-by` item 6d and must be closed before the move because a worker runs it); (B) every `direction: "in"` entry from SOURCE and from Ansible/launchers closed: `control` x2 + `deploy.yml:68` through item 6's resolver, `worker-fleet` x6 through the same resolver or by name, `lab`'s `labels.py` cut; (C) every `in` entry from a TEST either `by-name` (where the layer exports it, and the reader's package declares the dependency) or `travels` (whose whole subject is the layer, and which then runs in the layer's suite). **What MAY remain:** `travels` test entries (they are not edges after the move, they are files that moved), root configuration and CI entries that item 8 has already rewritten (`action.yml:584` is a consumer-facing entry point that runs the worker by repository path, so it may remain only until item 8 makes it install the published package; the issue-template placeholder is a string and is not an edge), and `by-name` entries (a declared dependency is the intended end state). **What may NOT remain:** any `owned-by:<row>` naming a row that is still open when the layer repository is created, and any `direction: "in"` entry with `kind` import/read/launcher (as opposed to `data`) and no disposition. Cost: none beyond #2612 and #2613; this row adds one derived verdict, `layer-edges.mjs --check-movable`, that exits non-zero while any entry violates A-C, so the chairman's "ready to move" is read from the baseline and not asserted. Rejected: a rule that ALL `in` test entries must be `by-name` -- 42 files read layer source by path for pins about it, and rewriting them all to by-name is #2613's decision to make per test; forcing it here would cost more than moving them with the layer.

**Owner:** engineer (the derived verdict; the dispositions are #2612/#2613's).

**Depends on:** rows #2612 and #2613 (the baseline and its test dispositions), item 6 (which owns the deploy, parity, provisioning and launcher entries) and item 8 (which owns the config and CI entries).

## The three findings

Found by reading, and each stated with a decision because the move would otherwise find it.

### Finding 1 — `nvda-speech` is GPL-3.0-or-later and `nvda-worker` is AGPL-3.0-or-later: may they share a repository?

```
$ node -e 'for (const p of ["nvda-worker","nvda-speech","evidence","cli"]) { const j = require("./packages/" + p + "/package.json"); console.log(p, j.license, j.private ? "private" : "public") }'
nvda-worker AGPL-3.0-or-later public
nvda-speech GPL-3.0-or-later private
evidence Apache-2.0 public
cli AGPL-3.0-or-later public
```

```
$ for f in LICENSE packages/nvda-worker/LICENSE packages/nvda-speech/LICENSE; do echo "$f: $(head -n1 $f | xargs)"; done
LICENSE: GNU AFFERO GENERAL PUBLIC LICENSE
packages/nvda-worker/LICENSE: GNU AFFERO GENERAL PUBLIC LICENSE
packages/nvda-speech/LICENSE: GNU GENERAL PUBLIC LICENSE
```

```
$ echo "worker->speech: $(git grep -nE 'nvda[-_]speech' -- packages/nvda-worker ':!*.md' | wc -l) speech->worker: $(git grep -nE 'nvda-worker' -- packages/nvda-speech ':!*.md' | wc -l)"
worker->speech: 0 speech->worker: 0
```

```
$ node -e 'const fs=require("fs");const l=[];for(const d of fs.readdirSync("packages")){const p="packages/"+d+"/package.json";if(!fs.existsSync(p))continue;const j=require("./"+p);if(/^(A?GPL|GPL)-/i.test(j.license)&&j.private!==true)l.push(d)}console.log(l.length, l.join(" "), "| without nvda-worker:", l.filter(d=>d!=="nvda-worker").length)'
6 cli judge nvda-worker pdf scorer worker-fleet | without nvda-worker: 5
```

**Measured:** the two are different licences, `nvda-speech` is private (never distributed) and a Python package,
`nvda-worker` is published; **neither source tree names the other** (reading 3: 0 and 0), so the pairing "`nvda-worker`
with `nvda-speech`" is co-location by `ceo`'s ruling and not a code dependency. `nvda-speech/README.md` already gives
the repository's own reasoning: the port is taken under GPL-3.0, "which combines with this repo's AGPL-3.0 engine".
**External knowledge, not verified and not legal advice:** GPL-3.0 section 13 and AGPL-3.0 section 13 each permit
combining a work under one with a work under the other, with the AGPL's network clause applying to the combination.

**Decision:** the two MAY share one layer repository, so this is not a correction to `ceo`'s ruling. The repository
stands on **AGPL-3.0-or-later as its default (`LICENSE` at the root, byte-identical to `packages/nvda-worker/LICENSE`)**
and `packages/nvda-speech` keeps its own `LICENSE`, its `license` field and its "derived from NVDA (GPL-2.0-or-later)"
notice, each package declaring its own licence exactly as today. **Which test moves:** `licence-boundary.test.ts` has
three tests and they divide. "Every package declares a licence" moves with a layer as a copy scoped to its packages.
"Every published copyleft package ships its licence text" needs a layer-sized copy, because its floor is written
as `>= 4` and measured "5" in-tree (reading 4 gives 6 today: 5 remain in core, so core's test keeps passing, and a
layer holding 1 needs its own exact count, not the core floor). **"No permissively-licensed package imports a
copyleft one" STAYS in core:** its subject, `@a11ign/evidence` (Apache-2.0), stays there, and a layer that depends on
`evidence` by name is the allowed direction; that test's own guard (`copyleft.length > 0`) is still satisfied by
the five AGPL packages that remain. The layer's copy carries only the first two. This is
part of item 10's row, not a separate one. **Observation for `ceo`, not a correction:** because neither tree
references the other, co-locating `nvda-speech` buys nothing at code level; it only moves the one edge below.

### Finding 2 — `nvda-speech` is not edge-free: `lab` reads its `labels.py` by relative path

```
$ git grep -nE 'nvda_speech' -- . ':!packages/nvda-speech' ':!*.md' ':!docs' ':!pnpm-lock.yaml' ':!.changeset' | cut -c1-150
packages/lab/src/harnesses/occurrence-verdict-stability.mjs:56:const LABELS = readFileSync(fileURLToPath(new URL("../../../nvda-speech/nvda_speech/lab
```

**Measured:** one inbound edge, `packages/lab/src/harnesses/occurrence-verdict-stability.mjs:56`, a runtime `readFileSync`
of `../../../nvda-speech/nvda_speech/labels.py` (this pattern, `nvda_speech`, is the Python package name and matches nothing else outside the package). It has no by-name form, because a private Python file cannot be installed by a layer (item 10, reading 4
and its bullets).

**Decision:** this edge must be CLOSED, as `cut`, before `nvda-speech` moves, and item 10's `--check-movable` refuses
the move while it is open. Which cut (the labels exported as data by the layer at a version the harness names, or the
harness taking the file's path as an argument) is #2612's disposition to record and is not decided here. If `ceo`
would rather leave `nvda-speech` in core, the edge disappears and the licence question with it; that is a different
first layer, so it is put to `ceo` as an option with this reading, not taken.

### Finding 3 — the merge queue and the review requirement are per repository, and an unprotected layer is a hole in a rule the org paid for

**Measured** (items 5 and 7, all *live* readings): `a11ign/screenreader-worker` exists, public, empty, with no branch,
no rule and no ruleset; the template `auth-capture-check` is private, unprotectable on this plan, and shows no model
to copy; `branch-protection.test.ts` reads only `a11ign/a11ign` (5 literal live reads) and nothing reads a layer;
the agent accounts hold `admin` on both layer repositories against the documented "write, not admin".

**Decision:** what protects a layer repository BEFORE its first pull request merges is the order in item 5, which is
binding. (1) create it PUBLIC with `allow_auto_merge` true, merge commits only, delete-branch-on-merge, Issues off;
(2) the first push of `main` is an admin's seed commit and is **the one unprotected write, named in the runbook**;
(3) in one sitting, classic protection (one approving review, `bypass_pull_request_allowances` EMPTY,
`enforce_admins` true, required check `gate`) and the `merge-queue-main` ruleset set `active`; (4) the behavioural
read-back (`rules/branches/main` lists both rules, `current_user_can_bypass` is `never` for the merging identity, a
throwaway pull request reads `reviewDecision` `REVIEW_REQUIRED`) run for that repository in `nightly.yml`, naming
which instrument it used; (5) only then the layer's `ci.yml` with `merge_group` and a `gate` job, the token secret
and `auto-arm.yml`. **Steps 2 and 3 are NOT VERIFIED: whether a ruleset can be created before the branch exists, and
whether an active `pull_request` rule refuses the first push, are unknown and need a throwaway repository first.**
`screenreader-worker` must take no push until item 7's declaration and item 5's steps are done.

## The chairman's three claims read against the measurements

### Claim 1 — CI and tests are a clear win

**Only if the tree-wide guards stop running on a layer's pull request, and what would have to change is stated
here.** Item 8, reading 2 reproduces #2610's measurement with the shipped selector: a change to one `nvda-worker` source
file selects **9** tests (`server.mjs`) or **55** (`capture-pure.mjs`), **plus 214 always-run guard tests of 729 test
files** (230 before narrowing by declared scope; **181 of the 230 are in `lab`**, 15 in `worker-fleet`, 11 in
`control`, 9 in `agent-org`, 8 in `judge`, 3 in `nvda-worker`). `nvda-worker` itself has 83 test files, 3 of them
guards (item 8, reading 3). So a layer repository that carries only its own tests runs at most 83 against 223 to
269 today, **and the win is real only if the 181 `lab` guards stay in core and are not copied in**: a copy wins nothing
(#2610). Three things have to be true. (a) The guards stay in core, which is why item 10's edge work matters: 41
test files read layer source by path and must `travel` with it or become by-name. (b) What the guards covered over
the layer is replaced by something cheaper, which is item 8's head gate, a 15th workflow with a Windows job on the
contract paths. (c) A layer PR's `acceptance`, `deliberateRefusals` and `ownedPaths` jobs, which run tracker scripts
against the PR body, are called from core's reusable workflows (item 4's workflow row, `ceo`'s lane) and not copied.
**The claim holds for the layer's own pull requests and is paid for by a gate core's pull requests now run; it is not a
saving for the organisation.** It is unmeasured after the fact: #2610's script, re-run after the move, is the test.

### Claim 2 — context per call is a smaller win, and is NOT promised

**#2610 owns the per-call reading and it had not merged when this was written, so no per-call number is given here
and none is promised.** What this ADR measured is bytes loaded before a session reads a line of code, which is not tokens
per call and is mostly cache-read after the first call. **Today a session under `packages/nvda-worker` loads 37,946 B**
(19,978 B of shared rules plus the 17,968 B nested `CLAUDE.md`; item 9, reading 1). **A layer session would load its own
root `CLAUDE.md` plus the code rules by reference: 23,363 B as the nested file stands, 3,363 B over the 20,000 B
refusal**, and at most 20,000 B after item 9's row evicts narrative to `docs/`. So the prefix falls from 37,946 B to
at most 20,000 B, **for sessions in that package only**: every session in the tracker still loads 19,978 B, and a
layer engineer must still be pointed at the engineer brief, which lives in core. **Nothing here shows the reading
after the move; that is the "after" run of #2610's identical command.**

### Claim 3 — the price is the machinery

**Sized, and it is not the file count.** The ten row bodies declare 62 distinct Region paths (item 1's directory
entry counts once and stands for its 61 files), against **135 tracked files in the two packages that move**
(`git ls-files packages/nvda-worker packages/nvda-speech | wc -l`). By files the machinery is comparable to the code, not larger. **What makes it the
larger half is what it is: 20 rows instead of one move; three admin acts on GitHub (the protection, the team level,
the token secret); three rows that need the fleet (6b to 6d); four rows that edit `.github/workflows/`, the pipeline
lane whose owner reviews (5, 8, 4b, 8b); and a silent-failure mode in every one until it is done.** The chairman should read
"the price" as 20 rows and a fixed order, not as a number of lines.


## The sum

**Sum:** **20 rows**: the ten in the appendix, and ten more that the ten name and their claimants file when they
reach them (3b the tick host clones each layer, 4b the layer-callable acceptance workflow and layer-side row closing
in `ceo`'s pipeline lane, 5b the merge-queue sweeps per repository, 6b/6c/6d the guests, the control plane and lab, and
the launcher reach, all `Fleet: Yes`, 8b the layer's own thin `ci.yml`, 8c per-repository release, changesets and
manifest `repository.url`, 9b the host measurement of cross-repository rules, 9c delivering the code rules to a
layer). **None of the ten bodies is `Fleet: Yes`; the three `Fleet: Yes` rows are follow-ons (6b to 6d).**

**First two:** **item 1 (`REPO`) and row 6a (the fleet's layer resolver).** Item 1 first for two reasons that are
measured: it changes no behaviour and every later item edits lines it has already labelled, and its Region is the
directory `packages/agent-org/src/`, which overlaps items 2, 3 and 4, so **B4 forbids them being in flight at the same
time as it**. Row 6a second because it is the only piece of the largest item that needs no host (`Fleet: No`), it
is what item 10's `--check-movable` and every `Fleet: Yes` row depends on, and those rows have the longest lead time
because each needs the orchestrator and a fleet window. **This confirms `ceo`'s ordering with one refinement:
the "fleet checkout" that can go first is row 6a only.** **Then 7 and 5**, small, and required before the
layer repository takes its first push, then 2, 3 and 4, then 8 and 9a and 10, and 6b to 6d once the layer holds code
and the edges are closed.

## Consequences (including the ones the chairman will not like)

- **It is 20 rows and a fixed order, before one line moves, and three of them wait on a person with admin on
  the GitHub organisation** (the protection, the team level, the secret). That is the price `ceo` said it was.
- **A layer pull request is invisible to the gate until items 2 and 3 land, with no error** (item 3). Nobody may open one
  on `screenreader-worker` before then, and the rows that make it visible are ahead of the rows that move code.
- **A change that spans core and a layer is two merges, layer-first, with a compatible core.** GitHub has no
  cross-repository merge group (external knowledge, not verified); item 8's head gate detects the breakage before
  the merge, and it is a 15th workflow.
- **A layer repository must be public** (item 5); the worker's source is already published, so this costs nothing
  new for `nvda-worker`, and it rules out a private layer.
- **The engineer brief, the org rules and the row-claim machinery stay in the tracker**, so an engineer in a layer
  repository reads them across a repository boundary by a mechanism that is NOT VERIFIED (item 9, row 9b).
- **Each layer added costs about eight per-repository steps**: an entry in the list, a protection and ruleset, an access
  table row, a thin `ci.yml`, a token secret, a clone and install on the tick host, a release trust on npm's side, a
  reviewer worktree convention. The sum above is for the first layer only.
- **The reviewer, the session names and every state file keyed by a bare PR number would collide** across
  repositories (item 3); core keeps its names and layers get qualified ones, which every reader must learn.
- **Some of what this ADR proposes is not verified**: whether an active ruleset refuses the first push, whether
  `Closes owner/repo#N` closes a tracker row from a layer merge and under whose permission, whether a session loads an
  `@`-import from outside its repository. Each is a named step with an owner, not an assumption.

## Alternatives rejected

- **A tracker per repository** (the alternative `ceo` rejected): it multiplies every item by the repository count.
  Items 2, 3, 4, 5, 7 and 8 each iterate a list today's design keeps as ONE tracker plus a list of code repositories.
- **Keep one repository and scope the guards instead.** NOT rejected on the measurements: `narrowByDeclaredScope`
  today drops 16 of 230 guards (item 8, reading 2), and nobody has tried narrowing more. It is the option that costs no
  machinery, and #2610's "after" reading is what compares it. It is recorded as the alternative to the split, not to the
  machinery; the chairman ruled the split.
- **A git submodule at `packages/nvda-worker`** (item 6's runner-up): the core commit would name the fleet's layer sha
  for free, but every layer fix then needs a core commit, which is the coupling the split removes.
- **Install the layer from the registry onto control and lab**: it makes the parity hash compare against whichever version
  was installed (defeating ADR 0030) and `control` has no `node_modules` by design (ADR 0012).
- **Copy the shared rules into each layer, or copy the guards**: rules drift (a copy is refused by name in item 9), and
  copied guards win nothing (#2610).
- **One global PR namespace for reviewers** (`reviewer-<seq>` plus a registry): it renames every in-flight core session and
  needs a new state file to stay consistent (item 3).
- **`Closes: none` for layer pull requests, or a bot that rewrites bodies**: the first skips the row-Region check, the
  only thing binding a PR to its row; the second edits a human's body, which nothing else here does (item 4).
- **Give the agent accounts `admin` on layers so the strong protection read works**: it turns the requirement into a
  matter of trust, which `enforce_admins` was set to avoid (item 7).
- **An organisation-level ruleset, or a private layer**: the plan is Free, so neither is available (item 5).
- **Do the whole fleet item first** (a literal reading of "the fleet checkout comes first"): rows 6b to 6d cannot start
  before the layer holds code and item 10's edges are closed, so they would be blocked, not first.

## What would falsify this

- **#2610's "after" reading shows a layer pull request still selects the tree-wide guards**, or the head gate makes
  core's pull requests slower than the guards saved. Then Claim 1 falls, and the alternative above is the better trade.
- **A throwaway pair of repositories shows `Closes a11ign/a11ign#N` does not close the row on a layer merge, or
  needs a credential this design does not give**: items 4 and 5 grow by a credential row that `ceo` must decide.
- **A ruleset cannot be created before `main` exists, or an active rule refuses the first push**: item 5's order is
  wrong and the first-push window is longer than one seed commit.
- **Row 9b shows a session does not load rules from outside its repository**: the code rules must be copied with a
  byte-compare guard, and item 9's "by reference, never by copy" is false.
- **Item 1's classification finds a site that is both the tracker and the code** (a `gh` call that needs the row
  and the pull request in one query): then `TRACKER_REPO` and `CORE_REPO` are not separable at that site and item 2's
  list is more than iteration.
- **The counts change**: any reading here re-taken at another commit that differs is a fact about that commit; the ADR
  is falsified only if the difference is in an item's SHAPE (a site the item did not name).

## Appendix: the ready-to-file row bodies

One per item, in the ADR's order. Each carries its Region, Acceptance and Done-when; `product-manager` files them
from this list, adding an Open-check from a fresh read at the filing commit. **The ADR does not file rows and does not
start any of them.** The ten follow-on rows named in "The sum" have no body here.


### ROW 1

````markdown
## What it is

**Child of #69, item 1: `REPO` answers two questions and the split makes them different.** `scripts/repo-identity.mjs:22` exports one `REPO`, imported by 39 files (30 in `agent-org`) and mentioned by 48; 89 lines in `agent-org` source pass `"--repo"`. Issues, the board and labels are the tracker (`a11ign/a11ign` forever, by `ceo`'s ruling on #69); pull requests, the merge queue, protection and checkouts are the code side, which becomes plural in items 2 to 5. This row names the two meanings and changes NO behaviour: `TRACKER_REPO` and `CORE_REPO` are both `a11ign/a11ign` today, `REPO` stops being exported, and every `agent-org` use is rewritten to one of the two.

## Region

```
scripts/repo-identity.mjs
packages/lab/src/packaging/repo-identity-consolidated.test.ts
packages/agent-org/src/
scripts/check-transfer-urls.mjs
scripts/ci-changed.mjs
scripts/commands.mjs
scripts/generate-commands-doc.mjs
scripts/generate-consumer-gate.mjs
scripts/release-reuses-verdict.mjs
```

## Acceptance

```bash
npx rstest run --config scripts/rstest/rstest.config.mjs --include packages/lab/src/packaging/repo-identity-consolidated.test.ts
```

**The test must show, and it FAILS before the change (`REPO` is exported):** `repo-identity.mjs` exports `TRACKER_REPO` and `CORE_REPO` and does not export `REPO`; every file that imported `REPO` now imports one of the two (the file list is derived from `git ls-files`, not typed); every `"--repo"` argument in `packages/agent-org/src` outside tests is `TRACKER_REPO`, `CORE_REPO` or a named parameter; the classification is pinned as two lists (tracker sites, code sites) that together equal the set of sites, with a positive control that a fixture file using bare `REPO` is refused.

## Done-when

1. `git grep -nE '\bREPO\b' -- packages/agent-org/src ':!*.test.*'` prints only comments; pasted on the row with its count.
2. The row states the classification counts (tracker sites, code sites, and any site that is both and how it was resolved).
3. `npm run test:org` and `npm run typecheck` are green, and no behaviour changed: the diff contains no changed string literal other than the two constants' names.
4. The row lists the sites that will become plural in items 2 to 5, so those rows start from a list.

## Not in this row

Making the code side a list (item 2); the `Closes` parser (item 4); protection (item 5); any package's `repository.directory`; moving any code.

## Fleet

No.
````


### ROW 2

````markdown
## What it is
B4 (`file-overlap-rule.mjs`) and the other PR-reading row-claim rules read one repository (`REPO`), and a Region path has no repository. Measured at c77c1ba0f: `lookupOpenPrFiles` is one `gh pr list --repo REPO`; `nvda-worker:src/x.ts` in a Region declares `[]` and is not even flagged as stray. Make the repository list data, teach the Region grammar an optional `<name>:` prefix (unprefixed = core), and make `lookupOpenPrFiles`, `lookupOwnPrComments` and `readOpenPrReviewHealth` take `{repo, number}` and iterate the list.
New-file: docs/code-repositories.json
New-file: packages/lab/src/packaging/region-repo-prefix.test.ts
## Region
```
docs/code-repositories.json (new)
packages/agent-org/src/region-paths.mjs
packages/agent-org/src/row-claim/file-overlap-rule.mjs
packages/agent-org/src/row-claim/blocked-by-rule.mjs
packages/agent-org/src/row-claim/own-pr-health-rule.mjs
packages/agent-org/src/row-claim.mjs
packages/agent-org/src/wake.mjs
packages/lab/src/packaging/region-repo-prefix.test.ts (new)
```
## Acceptance
```bash
npx rstest run --config scripts/rstest/rstest.config.mjs --include packages/lab/src/packaging/region-repo-prefix.test.ts
```
## Done-when
1. `declaredRegionFiles` of a Region section whose fenced line is `nvda-worker:src/x.ts` returns `["nvda-worker:src/x.ts"]`; the same with an unlisted prefix is returned by `unrecognisedRegionPaths`; an unprefixed path is unchanged (pinned by the new test, and `region-paths.test.ts` stays green).
2. `fileOverlapReason(["nvda-worker:.github/workflows/ci.yml"], [a core PR touching `.github/workflows/ci.yml`])` is NOT a refusal (it compares a layer path with a core path), and against a layer PR touching the same file it IS one naming `nvda-worker#<n>` (new test, both directions).
3. `lookupOpenPrFiles` calls `gh pr list --repo` once per listed repository and returns `null` if any call fails (new test with an injected `run`).
4. `blocked-by-rule` and `own-pr-health-rule` PR reads pass the PR's own repository, not `REPO` (new test asserts the `--repo` argument).
5. The tracker reads (`issue view`, `issue comment`, labels) still use `REPO`.
## Not in this row
The `Closes` cross-repository form (item 4), the work-gate/wake enumeration (item 3), and moving any package.
## Fleet
No
````


### ROW 3

````markdown
## What it is
The gate and wake enumerate one repository and name everything by a bare PR number. Measured at c77c1ba0f: 9 PR-reading sites in `work-gate.mjs`/`wake.mjs`/`pr-orders.mjs`, 3 of them repository-less `gh` calls resolved from the tick's working directory; `wake.mjs:1145` fetches `refs/pull/<n>/head` from core's `origin`; `pr-review-verdict.sh:27` hard-codes `REPO=a11ign/a11ign`; `reviewerInstanceNumber("reviewer-nvda-worker-12")` is `null`. Make a PR `{repo, number}`, keep core's names unchanged, give layers qualified names, and iterate the repository list.
New-file: packages/lab/src/packaging/work-gate-two-repos.test.ts
## Region
```
packages/agent-org/src/work-gate.mjs
packages/agent-org/src/wake.mjs
packages/agent-org/src/work-gate/pr-orders.mjs
packages/agent-org/src/review-attribution.mjs
packages/agent-org/src/reviewer/pr-review-verdict.sh
packages/lab/src/packaging/work-gate-two-repos.test.ts (new)
```
## Acceptance
```bash
npx rstest run --config scripts/rstest/rstest.config.mjs --include packages/lab/src/packaging/work-gate-two-repos.test.ts
```
## Done-when
1. `reviewerInstanceOf("reviewer-nvda-worker-12")` is `{repo: "nvda-worker", number: 12}`, `reviewerInstanceOf("reviewer-12")` is `{repo: "core", number: 12}`, `reviewerInstanceOf("reviewer-2")` stays `null` (retired) and `reviewerInstanceOf("reviewer-nvda-worker-2")` is NOT null (new test).
2. With an injected `run` returning PR 12 for two repositories, `readPrs` returns two entries with different `repo`, and the gate emits two orders with DIFFERENT `causeKey` and `session` (new test).
3. Every `gh` argv the gate builds for a PR carries `--repo` or `repos/<repo>/` (a new test scans the argv list produced by an injected `run`; `git grep -F -e '--repo' packages/agent-org/src/work-gate.mjs` is no longer empty).
4. `prepareReviewCheckout` for a layer PR fetches from that layer's clone and names `refs/review/<layer>/pr-<n>`; for core the argv is byte-identical to today's (new test with an injected `git`).
5. `pr-review-verdict.sh` no longer contains `REPO=a11ign/a11ign` as a literal and posts to the repository of the checkout it runs in.
6. The new test declares `// no-token: <fn>` in its first lines, per #827, because the row's test imports `wake.mjs`.
## Not in this row
Cloning layer repositories and installing their dependencies on the tick host (`orchestrator`, host units); the merge queue, `auto-arm`, `update-branch` and the other 16 PR-reading files; `trunk-red` for a layer's `main`.
## Fleet
No
````


### ROW 4

````markdown
## What it is
The merge-blocking `Closes` parser refuses `Closes a11ign/a11ign#12` (measured at c77c1ba0f: `CLOSES: MALFORMED`), and `pr-open`'s Region check refuses every diff from a layer worktree. Make `extractClosesDeclaration` accept the repo-qualified form, tracker-aware (`numbers` stays tracker rows only), refuse a bare `#N` where the repository is not the tracker, and have `checkRegion` prefix layer diff paths. Update the core template note.
New-file: packages/lab/src/packaging/closes-cross-repo.test.ts
## Region
```
packages/agent-org/src/acceptance-commands.mjs
packages/agent-org/src/pr-open.mjs
packages/agent-org/src/closes-mismatch-check.mjs
packages/agent-org/src/merge-guard/lookups.mjs
.github/PULL_REQUEST_TEMPLATE.md
packages/lab/src/packaging/closes-cross-repo.test.ts (new)
```
## Acceptance
```bash
npx rstest run --config scripts/rstest/rstest.config.mjs --include packages/lab/src/packaging/closes-cross-repo.test.ts
```
## Done-when
1. `extractClosesDeclaration("Closes a11ign/a11ign#12", {tracker: "a11ign/a11ign", here: "a11ign/nvda-worker"})` is `{kind: "closes", numbers: [12]}`; the comma form gives `[12, 13]`; `Closes: a11ign/a11ign#12` too (new test).
2. In a body checked with `here = "a11ign/nvda-worker"`, bare `Closes #12` is `malformed` naming the qualified form; with `here = tracker` it is `closes [12]` exactly as today (new test; `acceptance-commands.test.ts` stays green).
3. A reference to a third repository (`Closes a11ign/other#4`) is `malformed`.
4. `checkRegion` given layer name `nvda-worker`, diff `src/x.ts` and a row Region `nvda-worker:src/x.ts` reports 1 inside; the same diff against an unprefixed Region is refused (new test).
5. `closes-mismatch-check` compares repo-qualified pairs: a resolved `{repo: "a11ign/nvda-worker", number: 12}` is NOT counted as the declared tracker row 12 (new test).
6. `.github/PULL_REQUEST_TEMPLATE.md` still parses (the template-left-unfilled case still reports `MISSING`), and says a layer PR writes `Closes a11ign/a11ign#N`.
## Not in this row
`.github/workflows/reusable-acceptance.yml`, `ci.yml:475` and `trunk.yml`'s `closeRows` (pipeline lane, `ceo`); any credential for cross-repository closing; the layer repository's own template file.
## Fleet
No
````


### ROW 5

````markdown
## What it is
Child of #69. Give every code repository the same review requirement and merge queue the tracker has, and make it provable before the first PR: `branch-protection.test.ts` today reads only `a11ign/a11ign` (five literal reads); `screenreader-worker` was created empty with no branch, no rules and no ruleset. Read the ONE declared list of code repositories (`docs/code-repositories.json`, created by item 2's row; this row adds each repository's default branch and required check name to it), make the live protection read iterate it, run it from `nightly.yml`, and write the creation order as a runbook so the first push is the only unprotected write and it is named.

## Region
```
packages/lab/src/packaging/branch-protection.test.ts
packages/lab/src/packaging/layer-repository-protection.test.ts (new)
packages/lab/src/packaging/nightly-ruleset-read.test.ts
docs/code-repositories.json
.github/workflows/nightly.yml
docs/new-code-repository.md (new)
```

## Acceptance
```bash
npx rstest run --config scripts/rstest/rstest.config.mjs --include packages/lab/src/packaging/layer-repository-protection.test.ts
```
Fleet: No. The live read is opt-in (`A11Y_CHECK_MAIN_RULESET=1`) and is not part of this command, as in `branch-protection.test.ts`.

## Done-when
1. `docs/code-repositories.json` carries, per repository, owner/name, default branch and required check name, and `branch-protection.test.ts` reads it and contains no `a11ign/a11ign` literal on a non-comment line (`grep -v '^[0-9]*: *\(\*\|//\)'` returns none).
2. The new test pins, with a positive control that the list is non-empty, that every listed repository is read by the live check and that an unreadable one is `CANNOT_TELL`, never a pass.
3. `nightly.yml` runs the read once per listed repository and the existing `nightly-ruleset-read.test.ts` pins that.
4. `docs/new-code-repository.md` gives the order of creation, marks each step MEASURED or NOT VERIFIED, and names the one unprotected write.
5. A read-back run against `a11ign/screenreader-worker` is posted on the row (output verbatim) showing both surfaces present or the missing one named.

## Not in this row
Creating the ruleset or protection (an admin act, `ceo`'s). Teaching the Closes parser or `close-rows-*` the tracker/code split (rows of items 1-4). Changing `main-review-requirement.md` prose (its text is pinned by regex in `prefix-pins.mjs`; add a one-line pointer only).

## Fleet
No.
````


### ROW 6

````markdown
## What it is

**Child of #69: one place says where a layer's code lives on a host and which commit of it is deployed, and every operator-side reader of the worker's code version asks that place instead of reaching `../../nvda-worker/src/` by path.** Today `fleet-playbook.mjs:85`, `lab-job.mjs:57` and `ansible/deploy.yml:68` import `packages/nvda-worker/src/code-version.mjs` by relative path (control runs from a raw checkout, ADR 0012, so it cannot use the package name), and `code-drift.mjs:210`, `check-worker-code.mjs:60` and `deploy-worker.mjs:255` run `git status`/`git show` for `packages/nvda-worker/src` in the current repository. In a second repository each of these reads the wrong tree, and the parity guard (ADR 0030) would compare the fleet against the wrong code without failing. This row adds `packages/control/layers.json` and `packages/control/src/layer-checkouts.mjs` (`layerSourceDir(name)`, `layerGit(name, args)`), declares `nvda-worker` with `path: "packages/nvda-worker"` (so **behaviour is byte-identical today**), and rewrites the six readers. It moves no code and touches no host. It is the first of four rows for item 6: 6b guests, 6c control plane and lab, 6d the launcher reach are `Fleet: Yes` and follow.

## Region

```
packages/control/layers.json (new)
packages/control/src/layer-checkouts.mjs (new)
packages/control/src/layer-checkouts.test.ts (new)
packages/control/src/fleet-playbook.mjs
packages/control/src/lab-job.mjs
packages/control/ansible/deploy.yml
packages/worker-fleet/src/code-drift.mjs
packages/worker-fleet/src/check-worker-code.mjs
packages/worker-fleet/src/deploy-worker.mjs
```

## Acceptance

```bash
npx rstest run --config scripts/rstest/rstest.config.mjs --include packages/control/src/layer-checkouts.test.ts
```

The test must show: `layerSourceDir("nvda-worker")` equals `workerSourceDir()` (same directory today); it REFUSES an undeclared layer and a declared layer whose path is absent, naming the layer and the path, never falling back to the monorepo path; `layer-checkouts.mjs` imports only `node:` modules (`control-has-no-dependencies.test.ts` still passes); and no file in `packages/control/src`, `deploy.yml`, `code-drift.mjs`, `check-worker-code.mjs` or `deploy-worker.mjs` still contains the literal `nvda-worker/src` (the six readers are listed in the test, and the test asserts the list is non-empty and that each file exists, so an empty list cannot pass). Positive control: a fixture layer at a second path gives a different `codeVersion` from the real one.

## Done-when

1. `layers.json` declares `nvda-worker` and NOTHING else, listed in one place (not discovered by glob).
2. The six readers use the resolver; `git grep -n "nvda-worker/src" -- packages/control/src packages/control/ansible/deploy.yml packages/worker-fleet/src/code-drift.mjs packages/worker-fleet/src/check-worker-code.mjs packages/worker-fleet/src/deploy-worker.mjs` prints only comments.
3. `node -e` over `codeVersion(layerSourceDir("nvda-worker"))` prints the same 16 hex characters as before the change (pasted on the row).
4. The row names the four follow-on rows (6b, 6c, 6d) and files them with `Fleet: Yes`.

## Not in this row

Any change to a playbook's git block, `a11y_expected_commit`, provisioning, launchers or the provision stamp (6b to 6d); moving code between repositories; `#2612`'s guard (this row is one of its `owned-by:` targets).

## Fleet

No.
````


### ROW 7

````markdown
## What it is
Child of #69. The accounts reach every repository through the `gh` wrapper and the host-scoped git credential helper, so the wrapper needs no change; what is undeclared is the PERMISSION each account holds on each code repository. Today `a11ign/screenreader-worker` and the template give the agent accounts `admin` through the `bots` team (which the tree never names), against the documented "write, not admin" and against the tracker. Declare the model, pin it, and read it back.

## Region
```
packages/agent-org/host/repository-access.json (new)
packages/lab/src/packaging/layer-repository-access.test.ts (new)
packages/agent-org/src/host-units.mjs
docs/repository-access.md (new)
```

## Acceptance
```bash
npx rstest run --config scripts/rstest/rstest.config.mjs --include packages/lab/src/packaging/layer-repository-access.test.ts
```
Fleet: No. The live `collaborators` read is opt-in and read-only (`A11Y_CHECK_REPO_ACCESS=1`) and is not part of this command.

## Done-when
1. `repository-access.json` lists every code repository with, per account (`DanBeckDev`, `a11ign-bot`, `a11ign-ai-workers`, `a11ign-ai-leads`, `a11ign-ci`, `Cemmaw`), the role it must hold; no agent account is `admin` anywhere.
2. The test asserts the wrapper `packages/agent-org/host/gh` names no repository (with the positive control that it does name accounts) and that the list is non-empty.
3. `host-units.mjs`'s "write, not admin" sentence and the declaration agree (one derives from the other, or the test pins both).
4. The opt-in live check reads `repos/<r>/collaborators` for each listed repository and reports each difference from the declaration by name; its output on `screenreader-worker` is posted on the row verbatim.
5. `docs/repository-access.md` names the `bots` team, the level it must hold on a layer, and who may edit it.

## Not in this row
Editing team or collaborator permissions on GitHub (the chairman's); moving or creating secrets; the reviewer script's repository (`pr-review-verdict.sh:27`) and `worker_repo_url` (rows of the other items).

## Fleet
No.
````


### ROW 8

````markdown
## What it is
Child of #69. #2519's `registry-consumer-gate` proves the published packages resolve each other; no workflow builds core's head against a layer's head, and none of the 14 workflows checks out a second repository. Add the head gate as a reusable workflow plus a pure decision script, so a layer PR and a core PR are each tested against the other's head before merge, not after a publish.

## Region
```
.github/workflows/head-consumer-gate.yml (new)
scripts/head-consumer-gate.mjs (new)
packages/lab/src/packaging/head-consumer-gate.test.ts (new)
packages/lab/src/packaging/workflow-count.test.ts
```

## Acceptance
```bash
npx rstest run --config scripts/rstest/rstest.config.mjs --include packages/lab/src/packaging/head-consumer-gate.test.ts
```
Fleet: No.

## Done-when
1. `scripts/head-consumer-gate.mjs` decides, purely, which two repositories and refs to check out for a caller (core PR or layer PR) and returns CANNOT_TELL, never a pass, when either ref cannot be resolved; its test has a positive control that the layer list is non-empty.
2. `head-consumer-gate.yml` is `workflow_call`, checks out both repositories with a `repository:` key, builds them together and runs the same combination proof as #2519; the test pins that it does not `npm install` a published `@a11ign/*` package for the pair under test.
3. `workflow-count.test.ts` lists the 15th workflow by name with its trigger.
4. The row posts one run of the gate against `a11ign/screenreader-worker`'s default branch, verbatim, or names what stopped it.

## Not in this row
The layer's own `ci.yml`; per-repository `release.yml`, changesets and manifest `repository.url`; copying any guard; changing #2519.

## Fleet
No.
````


### ROW 9

````markdown
## What it is

**Child of #69: split the always-loaded rules into the set every repository shares (`CODE_RULES`) and the set only the tracker needs (`ORG_RULES`), name both in `rules-files.ts`, and give the budget test a second, declared set -- "what a session in layer X loads" -- checked against the same 20,000 B refusal `ceo` set (#2217).** Measured at `c77c1ba0f`: the tracker's loaded set is 19,978 B; `packages/nvda-worker/CLAUDE.md` is 17,968 B and is budgeted by nothing; the layer projection (that file as a layer root + `guards-and-assertions.md` 2,214 + `agent-practices.md` 1,739 + the `## Code conventions` section 1,442) is **23,363 B, 3,363 B over**. This row (a) moves the `## Code conventions` section of `CLAUDE.md` byte-for-byte into `.claude/rules/code-conventions.md`, (b) adds `CODE_RULES`/`ORG_RULES` to `rules-files.ts`, (c) adds to `prefix-budget.test.ts` a projected layer set for `nvda-worker` with its own assertion and a positive control, and (d) evicts 3,500 B of incident narrative from `packages/nvda-worker/CLAUDE.md` to `docs/` (rule kept, link kept) until (c) passes. It moves nothing between repositories and does not change `BUDGET_BYTES` or `WARN_BYTES`.

## Region

```
.claude/rules/code-conventions.md (new)
CLAUDE.md
packages/lab/src/packaging/rules-files.ts
packages/lab/src/packaging/prefix-budget.test.ts
packages/lab/src/packaging/prefix-pins.mjs
packages/lab/src/packaging/content-preservation.test.ts
packages/nvda-worker/CLAUDE.md
docs/operational-lessons.md
```

## Acceptance

```bash
npx rstest run --config scripts/rstest/rstest.config.mjs --include packages/lab/src/packaging/prefix-budget.test.ts
```

The test must show, and this fails before the change (no projected layer set exists, and once declared it reads 23,363 B): the tracker set (`CLAUDE.md` + every file of `ORG_RULES` and `CODE_RULES`) is still within 20,000 B; the projected `nvda-worker` layer set (`packages/nvda-worker/CLAUDE.md` + `CODE_RULES`, root conventions included) is within 20,000 B; `CODE_RULES` and `ORG_RULES` together equal `RULES_FILES` exactly and share no file; **positive control, in the test file:** a set one byte over the budget is asserted `over` and the projected set is asserted NON-EMPTY and larger than `CODE_RULES` alone, so a set that resolves to nothing cannot pass "within budget".

## Done-when

1. `wc -c CLAUDE.md .claude/rules/*.md` total is unchanged within 60 B of 19,978, pasted on the row; `packages/nvda-worker/CLAUDE.md` is at most 14,600 B (20,000 less the 5,395 B of `CODE_RULES` it will be read with, so the projected set fits).
2. Every line removed from `packages/nvda-worker/CLAUDE.md` exists byte-identically in a file under `docs/` and is linked from the heading it came from (`content-preservation.test.ts` green, unchanged assertions).
3. The row states, in one sentence each, which `ORG_RULES` a layer session does NOT get and that `code-conventions.md` was moved and not reworded.
4. The row files row 9b (a measurement on the host: does a worktree session load an `@`-import of a file outside its repository, with or without a prompt; does `--add-dir` load `.claude/rules`), and does not claim the delivery mechanism works.

## Not in this row

Delivering `CODE_RULES` to a real layer repository (needs the repository and row 9b); `main-review-requirement.md`'s treatment (item 5's ruling); how `row-claim` and the wake spawner create a layer worktree (items 2 and 3); any change to `BUDGET_BYTES`, `WARN_BYTES` or `REMEDY` (only `ceo` moves them).

## Fleet

No.
````


### ROW 10

````markdown
## What it is

**Child of #69, after #2612 and #2613: turn the baseline's dispositions into a machine verdict on whether the layer MAY move.** #2612 records every edge across the layer boundary in `packages/guards/layer-edges.baseline.json` with a disposition (`cut`, `by-name`, `owned-by:<row>`, `travels`) and #2613 assigns the test half; neither says which combinations are acceptable at the moment the code leaves. Measured at `c77c1ba0f`: 115 non-comment lines in 57 files reach in (41 tests, 9 source, 7 config/CI/ansible) and 9 files reach out. The move needs: no `out` entry that is not `cut` (a `by-name` to a private package -- `guards`, `lab` -- cannot be installed by a layer repository); no `in` source, Ansible or launcher entry without a disposition of `cut` or `by-name`; no `owned-by` naming an open row; `travels` and `by-name` test entries allowed. This row adds `--check-movable` to `layer-edges.mjs` (exit non-zero, naming each violating entry and the row that owns it) and its fixture test. It changes no code outside the guard and moves nothing.

## Region

```
packages/guards/src/layer-edges.mjs
packages/guards/layer-edges.baseline.json
packages/lab/src/packaging/layer-edges-movable.test.ts (new)
packages/lab/src/packaging/fixtures/layer-movable/ (new)
```

`layer-edges.mjs` and its baseline are created by #2612 (blocked-by); this row is filed blocked by #2612 and #2613 and the Region lists the files as they will exist.

## Acceptance

```bash
npx rstest run --config scripts/rstest/rstest.config.mjs --include packages/lab/src/packaging/layer-edges-movable.test.ts
```

The test must show, one fixture baseline each: an `out` entry with `by-name` to a `private: true` package is NOT movable; an `out` entry `cut` is movable; an `in` source entry with no disposition is NOT movable; a `travels` test entry is movable; an `owned-by:<n>` entry is NOT movable while row `<n>` is open and IS movable when the fixture marks it closed; a `by-name` test entry is movable. **Positive controls in the test file:** a fixture baseline of only movable entries is asserted `movable: true`, and the real baseline is asserted non-empty, so a verdict that always says "movable" or that reads an empty file cannot pass.

## Done-when

1. `node packages/guards/src/layer-edges.mjs --check-movable` prints one line per violating entry with the owning row, and exits non-zero on the real tree today (the deploy path is recorded there); pasted on the row with its count.
2. The verdict reads each target package's `private` flag from its `package.json`, not from a list in the guard.
3. The row states whether the guard runs in the required `ts` job or the always-run set, and how many seconds it adds.
4. The row lists which `owned-by` rows must close before the chairman's move claim: at least item 6's four rows and item 8's CI row.

## Not in this row

Cutting any edge (#2612, #2613, item 6, item 8); moving code between repositories.

## Fleet

No.
````
