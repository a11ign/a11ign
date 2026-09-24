# Reviewer instancing: the two named constraints, measured

Row #2325, from `ceo`'s #1950 ruling (c). **Read 2026-09-24 ~11:47-11:51Z by `worker-tooling`**, on the agent
host, at `main` `76c0977b7`. Both readings are a moment: re-run them before quoting either.

#1950 ruled reviewers instanceable and named two constraints it could not settle: **bot self-approval** and
**codex credentials and sandbox**. This document answers each with a reading, then says what the per-PR build
row needs.

**Answer in one paragraph.** Self-approval is not a constraint: `a11ign-bot` approves a PR authored by either
account an engineer instance acts as, and refuses only its own PR. Two codex instances under the one credential
both completed, exit `0` and `0`, and the credential file did not change, but this run **could not exercise a
token refresh**, so the refresh race is unmeasured by it (production has one live reading, below). One sandbox
fact the build must know: a codex execpolicy `forbidden` rule is bypassed by a compound shell script.

## 1. Self-approval

**The test.** For each PR author, open a DRAFT throwaway PR as that account (REST only: a ref, one file, a
pull; no local branch), have `a11ign-bot` run `gh pr review --approve`, read `reviewDecision`, then close the PR
and delete its branch. Draft, so nothing could enter the merge queue and it stayed open for seconds. The three
accounts were reached through their own `GH_CONFIG_DIR` (`/home/agent/workers/gh`, `/home/agent/.config/gh`,
`/home/agent/reviewer/gh`); the row names all three, so no config was borrowed to get past a limit.
`<author>` below stands for that account's config dir.

**Result: all three readings match the expectation.**

| author | `a11ign-bot` `--approve` | `reviewDecision` |
|---|---|---|
| `a11ign-ai-workers` (#2326) | exit 0 | `APPROVED` |
| `DanBeckDev` (#2327) | exit 0 | `APPROVED` |
| `a11ign-bot` (#2328) | **refused** | `REVIEW_REQUIRED` |

### Authored by `a11ign-ai-workers`

```
$ GH_CONFIG_DIR=<author> gh api user --jq .login
a11ign-ai-workers

$ GH_CONFIG_DIR=<author> gh api repos/a11ign/a11ign/git/refs -f ref=refs/heads/throwaway/2325-workers -f sha=<main 76c0977b7d17bad4bfb76bc14b31951c097303c7> --jq .ref
refs/heads/throwaway/2325-workers

$ GH_CONFIG_DIR=<author> gh api -X PUT repos/a11ign/a11ign/contents/.throwaway-2325-workers --field message=... --field branch=throwaway/2325-workers --jq .commit.sha
7216a43995adc676f5195bef66bb2d00be13f62c

$ GH_CONFIG_DIR=<author> gh api repos/a11ign/a11ign/pulls -f title=... -F draft=true --jq '{number,draft,author:.user.login}'
{"author":"a11ign-ai-workers","draft":true,"number":2326}

$ GH_CONFIG_DIR=<a11ign-bot> gh api user --jq .login
a11ign-bot

$ GH_CONFIG_DIR=<a11ign-bot> gh pr review 2326 --repo a11ign/a11ign --approve --body 'throwaway #2325 measurement'
exit=0

$ GH_CONFIG_DIR=<a11ign-bot> gh pr view 2326 --repo a11ign/a11ign --json number,author,reviewDecision,isDraft
{"author":{"id":"U_kgDOE5mUzw","is_bot":false,"login":"a11ign-ai-workers","name":""},"isDraft":true,"number":2326,"reviewDecision":"APPROVED"}

$ GH_CONFIG_DIR=<a11ign-bot> gh api repos/a11ign/a11ign/pulls/2326/reviews --jq '[.[]|{user:.user.login,state}]'
[{"state":"APPROVED","user":"a11ign-bot"}]

$ gh pr close 2326 --delete-branch  (as author)
✓ Closed pull request a11ign/a11ign#2326 (THROWAWAY #2325 (workers) - measurement only, do not review)
delete-branch exit=0
PR=2326
```

### Authored by `DanBeckDev`

```
$ GH_CONFIG_DIR=<author> gh api user --jq .login
DanBeckDev

$ GH_CONFIG_DIR=<author> gh api repos/a11ign/a11ign/git/refs -f ref=refs/heads/throwaway/2325-DanBeckDev -f sha=<main 76c0977b7d17bad4bfb76bc14b31951c097303c7> --jq .ref
refs/heads/throwaway/2325-DanBeckDev

$ GH_CONFIG_DIR=<author> gh api -X PUT repos/a11ign/a11ign/contents/.throwaway-2325-DanBeckDev --field message=... --field branch=throwaway/2325-DanBeckDev --jq .commit.sha
b7462c57ab3d430a90779ce80c0ee849f9c5ea2a

$ GH_CONFIG_DIR=<author> gh api repos/a11ign/a11ign/pulls -f title=... -F draft=true --jq '{number,draft,author:.user.login}'
{"author":"DanBeckDev","draft":true,"number":2327}

$ GH_CONFIG_DIR=<a11ign-bot> gh api user --jq .login
a11ign-bot

$ GH_CONFIG_DIR=<a11ign-bot> gh pr review 2327 --repo a11ign/a11ign --approve --body 'throwaway #2325 measurement'
exit=0

$ GH_CONFIG_DIR=<a11ign-bot> gh pr view 2327 --repo a11ign/a11ign --json number,author,reviewDecision,isDraft
{"author":{"id":"MDQ6VXNlcjQ2NDI5Mzcx","is_bot":false,"login":"DanBeckDev","name":"Dan Beck"},"isDraft":true,"number":2327,"reviewDecision":"APPROVED"}

$ GH_CONFIG_DIR=<a11ign-bot> gh api repos/a11ign/a11ign/pulls/2327/reviews --jq '[.[]|{user:.user.login,state}]'
[{"state":"APPROVED","user":"a11ign-bot"}]

$ gh pr close 2327 ; gh api -X DELETE repos/a11ign/a11ign/git/refs/heads/throwaway/2325-DanBeckDev   (as author)
✓ Closed pull request a11ign/a11ign#2327 (THROWAWAY #2325 (DanBeckDev) - measurement only, do not review)
delete-branch exit=0
PR=2327
```

### Authored by `a11ign-bot` (the refusal)

```
$ GH_CONFIG_DIR=<author> gh api user --jq .login
a11ign-bot

$ GH_CONFIG_DIR=<author> gh api repos/a11ign/a11ign/git/refs -f ref=refs/heads/throwaway/2325-bot -f sha=<main 76c0977b7d17bad4bfb76bc14b31951c097303c7> --jq .ref
refs/heads/throwaway/2325-bot

$ GH_CONFIG_DIR=<author> gh api -X PUT repos/a11ign/a11ign/contents/.throwaway-2325-bot --field message=... --field branch=throwaway/2325-bot --jq .commit.sha
5349e5e17b5645acfab2a7fba3776d005ccc09a4

$ GH_CONFIG_DIR=<author> gh api repos/a11ign/a11ign/pulls -f title=... -F draft=true --jq '{number,draft,author:.user.login}'
{"author":"a11ign-bot","draft":true,"number":2328}

$ GH_CONFIG_DIR=<a11ign-bot> gh api user --jq .login
a11ign-bot

$ GH_CONFIG_DIR=<a11ign-bot> gh pr review 2328 --repo a11ign/a11ign --approve --body 'throwaway #2325 measurement'
failed to create review: GraphQL: Review Can not approve your own pull request (addPullRequestReview)
exit=1

$ GH_CONFIG_DIR=<a11ign-bot> gh pr view 2328 --repo a11ign/a11ign --json number,author,reviewDecision,isDraft
{"author":{"id":"U_kgDOE5cTPg","is_bot":false,"login":"a11ign-bot","name":""},"isDraft":true,"number":2328,"reviewDecision":"REVIEW_REQUIRED"}

$ GH_CONFIG_DIR=<a11ign-bot> gh api repos/a11ign/a11ign/pulls/2328/reviews --jq '[.[]|{user:.user.login,state}]'
[]

$ gh pr close 2328 ; gh api -X DELETE repos/a11ign/a11ign/git/refs/heads/throwaway/2325-bot   (as author)
✓ Closed pull request a11ign/a11ign#2328 (THROWAWAY #2325 (bot) - measurement only, do not review)
delete-branch exit=0
PR=2328
```

Throwaway PRs #2326, #2327, #2328 are closed and `gh api repos/a11ign/a11ign/branches --paginate` lists no
`throwaway` branch (0 of them). Nothing was armed, labelled or merged.

**What it means for the build.** A per-PR reviewer can approve any engineer-authored PR under the one
`a11ign-bot` account, so instancing adds no approval problem. **The refusal is the reason an
`a11ign-bot`-authored PR waits** (`.claude/rules/main-review-requirement.md`), and nothing about instancing
changes that.

## 2. Two codex reviewers at once

**The test.** Two `codex exec` processes started in the same second, each in its own shallow clone under `/tmp`
of a different open PR head (#2321 at `dcab537`, #2320 at `61941dc`), both under `~/.codex/auth.json` and
`~/.codex/config.toml`, with the reviewer's `approval_policy = "never"` and `sandbox_mode = "workspace-write"`.
The prompt asked for eight sandbox probes and **no GitHub write**. It is a sandbox measurement, not a review.

**Not cleared first.** The two production reviewers (`reviewer` pid 1387091, `reviewer-2` pid 1387601, started
2026-09-23 13:30Z) were live and `reviewer-2` was mid-review, and stopping them to measure would have cost two
reviews. The credential is the shared resource, so this run had **four** codex processes on it, not two.

```
auth.json before: sha256[:16]=b11f6996cda7a229 2026-09-23 19:47:26.389921336 +0100
clone a ok: 38 MB
clone b ok: 38 MB
instance a: exit=0 start=11:49:36 end=11:50:17
instance b: exit=0 start=11:49:36 end=11:50:07
auth.json after: sha256[:16]=b11f6996cda7a229 2026-09-23 19:47:26.389921336 +0100
```

| | instance a (#2321) | instance b (#2320) |
|---|---|---|
| exit status | **0** | **0** |
| wall clock | 41 s | 31 s |
| `auth.json` | unchanged, sha256 prefix and mtime identical before and after | same file |
| write in cwd / `/tmp` | OK / OK | OK / OK |
| write in `$HOME` | `Read-only file system` | `read-only file system` |
| read `~/.codex/auth.json` | `readable` | `readable` |
| `gh api user` | **rejected by execpolicy** | ran, printed `a11ign-bot` |

**Which constraint remains: one, and it is not concurrency.** Both instances completed and no lock or refresh
failure appeared, but the access token was valid to 2026-10-03T18:47Z, so **neither run refreshed it and this
run says nothing about a refresh race**. What supports "no race" is production: `last_refresh` is
`2026-09-23T18:47:26Z`, five hours after both live reviewers started, so a refresh was written while both were
running and neither stopped. That is one reading, not a test, and it did not have four processes on it. **A
per-PR build multiplies the processes, so a refresh with N live instances is the reading still owed.** Forcing
one here was refused as a measurement, because a refresh rotates the token and could log out the two production
reviewers mid-review.

**A finding the run did not ask for: the sandbox's write rules are policy, not a wall.** `codex execpolicy
check` on the reviewer's rules (`~/.codex/rules/default.rules`):

```
$ codex execpolicy check --rules ~/.codex/rules/default.rules -- gh api user --jq .login
{"matchedRules":[{"prefixRuleMatch":{"matchedPrefix":["gh","api"],"decision":"forbidden","justification":"the reviewer's only write is one verdict comment per PR"}}],"decision":"forbidden"}
$ codex execpolicy check --rules ~/.codex/rules/default.rules -- gh pr comment 1 --body x
{"matchedRules":[]}
$ codex execpolicy check --rules ~/.codex/rules/default.rules -- zsh -lc 'x=$(gh api user --jq .login); echo $x'
{"matchedRules":[]}
```

Instance a's plain `gh api user` was refused. Instance b wrapped the same call in one `zsh -lc` script with
`$(...)` and it ran, as `a11ign-bot`. So `gh api` is only refused when it is the whole command. `gh pr comment`
matching **no rule** is by design (the one permitted write). **Two caveats on the probe itself:** instance b
never executed step 8, it printed a hard-coded "Refused by policy" line, and instance a declined step 8 itself,
so **the refusal of `gh pr comment` was not measured**, and it has no rule to measure. Each result is one run of
one prompt, so the a/b difference is what each model chose to type, not a property of the instance.

## 3. What the per-PR build needs

**Address.** A per-PR reviewer cannot take the PR number as `session:<name>` today. `session:<name>` is a
routing address, not a process handle (#1951): `arm-pr`'s `LIVE_SESSIONS` is the `live` names in
`packages/agent-org/docs/roles/sessions.json` and refuses a label outside it; `row-claim` counts B2 per
address; `sessions.json` says to add no per-instance field. The two places that already know a reviewer by name
are `wake.mjs`'s `route`, which matches a herdr workspace **label** (so a per-PR pane labelled
`reviewer-<PR>` routes with no change), and `pr-review-verdict`'s `A11Y_REVIEWER_SESSION`, which records the
name in the `review/<name>` commit status.

So what changes, in order of size:

1. **Keep `session:reviewer` as the one roster ROLE and address the instance by PR only in herdr**
   (`herdr agent rename` to `reviewer-<PR>`; `A11Y_REVIEWER_SESSION=reviewer-<PR>`). `sessions.json`,
   `LIVE_SESSIONS`, `arm-pr` and `row-claim` do not change. This matches #1951 and is the recommendation.
2. If the chairman wants `session:reviewer-<PR>` as a label on the PR, `sessions.json` needs a **pattern**
   entry instead of a name (`LIVE_SESSIONS.includes` becomes a match), and `unknownSessionLabels`,
   `laneReason` and `runnerReason` (they compare a label suffix to a name) each need the same change. That is
   a `ceo` ruling on the roster, not a build detail.

**The odd/even split is then retired.** It lives in `parityOwner` (`review-attribution.mjs`), which
`work-gate.mjs` calls to choose whom to order, in the odd/even sentence in `.claude/rules/org-routing-and-timers.md`
and the gate's prompt text at `work-gate.mjs:2591`. With one instance per PR the owner of PR *n* is the
instance opened for *n*, and the arithmetic has nothing left to decide. The `reviewer-2` name stays valid for
history: merged PRs carry it, so it moves to `retired` rather than being deleted.

**Before the build row is filed:** the refresh reading in section 2, and a decision on the compound-script
bypass, because N instances is N sandboxes that hold the `a11ign-bot` credential and can read `auth.json`.
