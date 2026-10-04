# Creating a code repository

**The order a new code repository is created in, so that the review requirement and the merge queue exist before
the first pull request merges and the first push is the ONLY unprotected write.** ADR 0039 item 5 (#69, row #3123);
the order is `ceo`'s, fixed on #2701. A push to a public repository is published the moment it lands, which is why
this page exists before `a11ign/screenreader-worker` takes one.

Every step is marked **MEASURED** (watched happening, with the date and where) or **NOT VERIFIED** (taken from
the ADR, from GitHub's documentation or from memory, and not tried). Where the ADR guessed and the measurement
disagreed, the disagreement is stated.

**Where the facts live.** `.agent-org/project.json`'s `code` array is THE list of code repositories (the
`agent-org` tool owns its schema). [`docs/code-repository-protection.json`](./code-repository-protection.json)
holds the two facts that list does not: each repository's **default branch** and **required check name**.
`layer-repository-protection.test.ts` fails when a listed repository has no entry, `branch-protection.test.ts`
takes its repository from the pair, and `nightly.yml`'s `mainRulesetBinds` job reads every listed repository
once a night. A repository that is declared but cannot be read is `CANNOT_TELL`, which fails; nothing here
treats "could not look" as "protected".

## The order

| # | Step | Status |
|---|---|---|
| 1 | **Create it PUBLIC in the `a11ign` organisation, EMPTY.** Set `allow_auto_merge` true, merge commits only, `delete_branch_on_merge` true, Issues off. | Creating a public repository as `a11ign-ai-workers` is **MEASURED** (2026-10-03: `gh repo create a11ign/zz-throwaway-protection-3123 --public`; the org reads `members_can_create_public_repositories: true`). That a **private** repository cannot hold either surface on this plan is the ADR's measurement and was NOT re-run. The four settings were **NOT VERIFIED**: the throwaway was not given them. |
| 2 | **Add its entry to `docs/code-repository-protection.json`** (`repo`, `defaultBranch`, `requiredCheck`) and read the empty repository back: `A11Y_CHECK_MAIN_RULESET=1 A11Y_PROTECTION_REPO=<owner/name> A11Y_PROTECTION_BRANCH=<branch> pnpm exec rstest run --config scripts/rstest/rstest.config.mjs --include packages/lab/src/packaging/layer-repository-protection.test.ts --disableConsoleIntercept`. It is EXPECTED to fail, naming every surface as missing. | **MEASURED** against `a11ign/screenreader-worker` as created (2026-10-03): all four surfaces `ABSENT`. The entry goes in BEFORE the repository is added to the `code` array, because the test refuses a listed repository with no entry. |
| 3 | **THE SEED PUSH: the one unprotected write.** An admin pushes one commit to the default branch. Nothing is required of it, and nothing has been created that could refuse it. Name it in the pull request or the row that does it. | **MEASURED** (2026-10-03): `branches/main` is `404 Branch not found` on an empty repository, and the push of `main` to a repository with no ruleset is not in doubt. See *The two unknowns* below for why a ruleset created first is not needed and is only safe without its `merge_queue` rule. |
| 4 | **Classic protection and the `merge-queue-main`-style ruleset, in ONE sitting, ruleset `active`.** Classic: one approving review, `bypass_pull_request_allowances` EMPTY, `enforce_admins` true, required check `gate`. Ruleset: `merge_queue` plus `pull_request` requiring 1. Classic protection can only follow the push: it has no branch to attach to before it. | Both applied and read back on the throwaway (2026-10-03). Classic on a branch that does not exist is **MEASURED** `404 Branch not found`; the ADR said "inferred, NOT tried". The classic body used was `{"required_status_checks":{"strict":false,"contexts":["gate"]},"enforce_admins":true,"required_pull_request_reviews":{"required_approving_review_count":1},"restrictions":null}` and the ruleset was the tracker's own `merge-queue-main` (`gh api repos/a11ign/a11ign/rulesets/23681721`) minus its `id`. An admin act, `ceo`'s: this row creates nothing. |
| 5 | **The behavioural read-back, NAMING ITS INSTRUMENT.** With repository admin: `A11Y_CHECK_BRANCH_PROTECTION=1 A11Y_PROTECTION_REPO=<owner/name> pnpm exec rstest run … --include packages/lab/src/packaging/branch-protection.test.ts --disableConsoleIntercept` (the only instrument that can say *nobody is exempt*). Without admin: the same with `A11Y_CHECK_MAIN_RULESET=1` (answers FOR THE ASKING IDENTITY ONLY), and `layer-repository-protection.test.ts`'s live read for the surfaces. Then a throwaway pull request must read `reviewDecision` `REVIEW_REQUIRED`. | **MEASURED** on the throwaway: `rules/branches/main` listed `pull_request` and `merge_queue`, `current_user_can_bypass` was `never`, the admin read of `branches/main/protection` returned `enforce_admins: true`, and a pull request from a second branch read `reviewDecision: REVIEW_REQUIRED`, `mergeStateStatus: BLOCKED`. Which instrument was used is part of the claim (`.claude/rules/main-review-requirement.md`). |
| 6 | **Declare it**: add it to `.agent-org/project.json`'s `code` array. From the next night `nightly.yml` reads it. | The array is the `agent-org` tool's schema; a change to the tool itself is a pull request in `a11ign/agent-org`. |
| 7 | **The `bots` downgrade**: the chairman's act (ADR 0039 item 7). The agent accounts hold `admin` on the layer repositories against the documented "write, not admin", and while they do, a read made as one of them is not the read of a bound identity. | **NOT VERIFIED** here: nothing in this row touches team permissions. |
| 8 | **Only then** the repository's own `ci.yml` (with `merge_group` and a `gate` job), the token secret and `auto-arm.yml`, and the first real pull request. | **NOT VERIFIED** here. The required check `gate` blocks every pull request until a `gate` job exists, so this step is also what makes the first one mergeable. |

## The cut, MEASURED (2026-10-04, #2702): `filter-repo --path` alone LOSES FILES on this history

`git filter-repo --path packages/<dir>` pruned **2 of the 112 files** at the tip of `packages/worker-fleet`, with no error: its default pruning of
"degenerate" merge commits drops a file a merge carried. A sample of files would not have found it, so **compare the WHOLE tip tree** (every path, every
blob) of the cut against the source before the seed push.

- **The recipe that kept all 112:** `git subtree split --prefix=packages/<dir>` into a scratch clone first, then `git filter-repo --to-subdirectory-filter packages/<dir> --prune-degenerate never`.
- **Both `--replace-text` AND `--replace-message`** with `scripts/history-purge-replacements.txt`: the text flag rewrites file contents only, and commit
  messages carried internal addresses (25 of the 543 messages in this cut). Each extraction test keeps a positive control that raw messages still need it.
- **The licence:** the cut adds a root `LICENSE` byte-identical to the package's, as a callback on the root commit (it is in no package).
- Read the result back with the first commit's test (`screenreader-*-extraction.test.ts`): licence, boundary, leak scan.

## The two unknowns, MEASURED (2026-10-03, throwaway `a11ign/zz-throwaway-protection-3123`)

ADR 0039 listed these as UNKNOWN and said to try them on a throwaway repository first. The verbatim output is on
#3123 (the measurement comment), and the throwaway's deletion is recorded there too.

1. **Can a ruleset exist before `main` does? YES.** A `merge_queue` + `pull_request` ruleset, `active`, was
   created on a repository with no branch, and `rules/branches/main` listed both rules while `branches/main`
   was still `404`.
2. **Does an active `pull_request` rule refuse the seed push? NO. An active `merge_queue` rule DOES.** The ADR
   had the question about the wrong rule. With both rules `active`, a repository admin with no bypass actors was
   refused: `GH013 … Changes must be made through the merge queue`. With `pull_request` ALONE `active`, the same
   push created `main`. **The control:** that same `pull_request`-only ruleset then refused a *later* push to
   `main` (`Changes must be made through a pull request`), so the seed passing is about creation and not about a
   rule that never bites.

**What that does to the order.** The ADR's draft put the ruleset before the seed push and said "ideally in
`evaluate`/`disabled`". It need not be there at all, and if it is, it must not carry `merge_queue` at `active`.
`enforcement: evaluate` was measured only on a branch created after `main` existed (`probe`, refs pattern
`refs/heads/probe`), where it did not refuse the push; **it was NOT measured on the creation of the first
branch**, so this page does not claim it. The order above, seed first and everything in one sitting after, needs
none of those claims.

## What the checks do and do not establish

- **`BINDS_ME` is not "nobody is exempt".** The no-admin read answers for the asking identity only, and
  `bypass_actors` is withheld from a token without write access to the ruleset. The nightly runs as
  `A11IGN_BOT_TOKEN`, the identity that completes merges. Reading a new repository as a different identity is a
  true statement about the wrong subject (`.github/workflows/nightly.yml`, `#2120`).
- **`layer-repository-protection.test.ts` can say `PARTLY_READ`.** Classic protection is admin-only, and a `404`
  from it is "absent OR forbidden", never "unprotected". The verdict lists what it did not read.
- **Nothing here creates anything.** Making the ruleset and the protection is an admin's act, and the push
  itself is #2701's, after this row and item 7's.
