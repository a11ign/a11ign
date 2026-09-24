# Agent practices — every session in this repo (chairman's direction, 2026-09-11)

These load with CLAUDE.md in every session. They are habits, not gates; the org clock on #912 reads whether
they are followed.

**EVERY WAKE LOADS THIS FILE, BUDGETED AT 20,000 BYTES WITH `CLAUDE.md` (#2217).** It carries the RULE and
one clause of why; **the incident behind each is in
[`docs/operational-lessons.md`](../../docs/operational-lessons.md), under a section named for that rule.**
**A section added here is a permanent tax charged hundreds of times a day** —
`prefix-budget.test.ts` prints it. **Evict or move, never truncate.**

## Model routing for subagents

- `model="haiku"` for data gathering: file reads, counting, directory walks, grep, API listings.
- `model="sonnet"` for analysis and judgment over gathered material.
- `model="opus"` only for multi-step reasoning that a cheaper tier has measurably got wrong.
- **Every subagent call names its model.**

## Context

- `/compact` at 50–70% fill, before auto-compact; quality degrades past 70%.
- **A model change needs evidence (ceo, #1950):** two `ceo` rulings in a week reversed as WRONG, not stale,
  justify raising that cause's effort or model via #1952. **Never pin a session to Opus.**
- `/clear` between unrelated topics; a fresh window beats stale history.
- Batch related requests into one message; every round-trip re-sends the whole config stack.

## Web research

- **Run research in a subagent** (`haiku` gathers, `sonnet` digests) so pages stay in its context and
  only the digest reaches yours — with sources, never a page dump. **One fetch that the main session must
  read itself is the exception, not the habit.**

## Timers and state

- **No session holds a standing cron.** After a restart, list them once and **`CronDelete` anything you
  find.**
- **THE CLOCK WAS NEVER THE DEFECT — the defect was that the tick WAS a model turn.** `work:tick` runs
  `work-gate.mjs` (no model) and hands what it finds to `wake.mjs`: **you are woken WITH the answer in
  your prompt, not to go and look.**
- **Do not create a cron to check for work.** If you want one, the gate is missing a question — add it to
  `work-gate.mjs`, where it costs an API call instead of a turn. A cron is right only for a WALL-CLOCK
  event, never for "has anything changed yet".
- **The row is the state.** Read the row, the PR and the API before acting on any message, `ceo`'s
  included.
- A product PR opens as a DRAFT and is marked ready only on a "convinced"; docs-and-tests PRs open ready.
  **Nobody merges by hand.**
- **`Acceptance:` and `Closes` are MERGE-BLOCKING** — a malformed body does not merge. The two defects
  that cost four red runs: a DUPLICATED `Acceptance:` section, and a MISSING `Closes`. A PR finishing no
  row declares `Closes: none -- <reason>`, em dash required.
- **A settled draft with no verdict goes to the external reviewer; an engineer reviews only when `ceo`
  names one** (#1394). An engineer with no row in build claims the next Ready row.

## The API budget — `gh api rate_limit` is a broken gauge (2026-09-22, #1967)

- **Never decide anything from `gh api rate_limit`.** It has reported a FULL pool during a total GraphQL
  outage of that same token, and has lied twice three weeks apart (#1275, #1967).
- **Read `X-Ratelimit-*` off a real call to the pool you care about** — `gh api graphql -f
  query='{viewer{login}}' -i`, or `gh api <rest-path> -i` — and let `X-Ratelimit-Resource` confirm which
  pool answered. **The headers come back on the 403 too**, so an exhausted pool is readable.
- **Pools are per TOKEN and per RESOURCE, and the endpoint can be right about one while lying about the
  other: a sanity check on core is not a sanity check.** Same token, same second: `graphql` off by
  1,360. `gh pr view`/`pr list`/`issue list` spend GRAPHQL;
  `gh api` spends CORE.
- **Per TOKEN means per ACCOUNT, and there are two here.** The default `~/.config/gh` authenticates as a
  person (`DanBeckDev`), and `GH_CONFIG_DIR=/home/agent/workers/gh` as `a11ign-ai-workers` — which is what
  `a11ign-work-tick.service` sets. So an exhausted pool always has a healthy-looking neighbour, and
  **you must not switch to the other config to get past your own limit.** One export changes who every
  subsequent write is attributed to, and that disposition is `ceo`'s (`lane:ceo`, #916) rather than yours.
  Wait out your own reset.
- **You may already be spending an account you did not pick, so name it before you read its pool.**
  `/home/agent/.local/bin/gh` is a ROUTING WRAPPER sitting ahead of `/usr/bin/gh`: with `GH_CONFIG_DIR`
  unset it selects the workers config when `HERDR_WORKSPACE_ID` is listed in
  `/home/agent/workers/workspaces.txt`, and the person's otherwise — which is why a systemd unit, having no
  workspace id, must DECLARE `GH_CONFIG_DIR`. **Run `gh api user --jq .login` first, then the headers** —
  the pool you are about to spend is decided by your PATH and your workspace id, not by what you typed.

## `lane:ceo` protects review, not authorship (ceo, 2026-09-18)

- **A `lane:<owner>` label refuses any OTHER session unconditionally** (`laneReason`,
  `row-claim/runner-rule.mjs`). A `Lane-exception:` line changes nothing at claim time — only the label
  does.
- **The test before leaving a row in a lane other than `any`: does the label protect a DECISION only the
  owner can make (a publish order, a freeze, a ruling), or a PATH that needs the owner's REVIEW but not
  their hands?** A path re-lanes to `lane:any`; a decision stays, and the wait is then a real cost of it.
  Full ruling: `docs/lane-ownership.json`'s `_claimVsAuthorRuling`.

## `main` REQUIRES an approving review (ceo, 2026-09-22, #2022)

- **One approving review, and `bypass_pull_request_allowances` EMPTY** — the allowance goes with it or
  the requirement is decorative, reading as universal while absent on half the merges. An
  `a11ign-bot`-authored PR waits; the hatch is a human admin editing the protection, which
  `enforce_admins: true` makes a logged edit rather than a standing hole.
- **Read it back BEHAVIOURALLY, never off the field** (`branch-protection.test.ts`):
  `required_approving_review_count == 1` proves the setting is set, not that it bites. The observable is
  **`reviewDecision`**, EMPTY when the base requires no approval, and needing no admin.
- **A 404 from `branches/main/protection` means absent OR forbidden, never "unprotected".**
  `branches/main.protected` is the discriminator and needs no admin.
- **TWO SURFACES CARRY THE REQUIREMENT, and a reading of one is not a reading of the other (2026-09-23,
  #2086/#2090).** `ceo` ruled ADD, NOT SWAP: the `merge-queue-main` ruleset (id `23681721`) carries a
  `pull_request` rule with `required_approving_review_count: 1`, and classic `branches/main/protection`
  STAYS and stays authoritative — it is the only surface whose exemption list can be ENUMERATED rather
  than merely queried for one identity. **Requirements compose and exemptions do not:** the most
  restrictive applies, so an identity must be exempt in BOTH, and the ruleset rule can only close a hole.
- **PICK THE INSTRUMENT BY WHAT YOU HOLD, AND SAY WHICH ONE YOU USED.** With repository admin:
  `branches/main/protection`, behind `A11Y_CHECK_BRANCH_PROTECTION=1` — the only one that can answer
  *nobody is exempt*. Without admin, which is every session and every CI job here: `rules/branches/main`
  plus `rulesets/{id}`, behind `A11Y_CHECK_MAIN_RULESET=1`, which answers **for the asking identity only**.
  Both are wired in `branch-protection.test.ts` under two switches: the admin read cannot pass where
  admin is absent.
- **`current_user_can_bypass: "never"` answers FOR ME ALONE and does not mean nobody is exempt.**
  `bypass_actors` — the field that could say — is withheld from a token without write access to the
  ruleset, so **its absence means "you may not look", never "the list is empty"**. `CANNOT_TELL` stands
  unchanged as the verdict for *is anyone else exempt*; what a non-admin session gains is the right to
  assert **the requirement exists and I cannot walk past it**. Quoting a green cheap run as evidence that
  nobody can is the overclaim #2022 exists to prevent, and **a check that certifies less than it appears
  to does not become acceptable by being cheap** (`ceo`, #2086). The code keeps `VERDICT.REQUIRED` (needs
  admin) and `BINDING.BINDS_ME` (needs nothing) as separate vocabularies.

## A review OUTLIVES the head it was posted on (2026-09-23, #2084)

- **`main` KEEPS stale reviews on BOTH surfaces; the defect is closed by READING `reviewDecision`, not by
  dismissing reviews.** `dismiss_stale_reviews` covers APPROVING reviews only, so it could not have
  cleared the `CHANGES_REQUESTED` that stalled #2049 for seven hours — and *Update branch*, which
  `update-branch-sweep.mjs` runs after every merge, would have stalled 15 of the last 40 merges.
- `readPrs` asks for `reviewDecision` on the `pr list` call it already makes, and **`pr-review-blocked`**
  names every green, unheld PR GitHub is holding — including one that opened READY and never reached the
  reviewer lane.
- **A grep count in a row body is a reading at a moment: re-run it at YOUR commit.**

## A waiting condition is DATA, not a sentence (chairman, 2026-09-19)

- **If a conclusion changes what should happen next, it goes in a FIELD, not a comment.** The comment is
  the reasoning; the field moves the org. **Nothing in this org reads comments.**
- **Waiting on a SESSION → `answer:<session>`. Removing the label IS the act of answering**, so there is
  nothing to remember.
- **Waiting on another row → `gh issue edit <n> --add-blocked-by <m>`**, GitHub's own dependency edge,
  returned by the `--json blockedBy` call the gate makes.
- **Waiting on a date → `Not-before: YYYY-MM-DD`; on an HOUR → `Not-before: YYYY-MM-DDTHH:MM:SSZ`**
  (#2113 — seconds and the `Z` are required, anything else fails open). Use the timestamp whenever the
  condition turns true at a named time.
- **`Fleet-hold-until: YYYY-MM-DDTHH:MM:SSZ` says TWO things and only one is enforced.** It refuses
  `fleet:deploy`/`fleet:provision` until T (code); it also *means* "my captures own the workers until T",
  and **nothing reads it for that**. Declare both; the second is a note to humans.
- **All of these CLEAR THEMSELVES, and that is the point.** `blocked` has **no referent** — it never says
  what blocks the row, so only a human can lift it. Use it only for a wait no field can express, and say
  what would clear it.

## Routing — who reads what (chairman, 2026-09-14)

- **`product-manager` is the first reader, and ruler, for rows, the queue and process:** filing and
  amendments, Region and done-when wording, holds, lane labels, promotions, claim reports, merge
  close-outs, host-run announcements. An engineer's report goes there, never to `ceo`.
- **Three things come up to `ceo`:** a ruling `product-manager` cannot make (a rule or ADR conflict, a
  crossing into a `ceo` lane, the publish path); ONE state reading per tick; anything for the chairman.
- **That reading is POSTED and DELIVERED (#2083):** post on **#928** (the RECORD), then deliver it with
  **`npm run prompt:session -- ceo "…"`**. **Both halves, or it is unrecorded or undelivered.**
- **`orchestrator` is the first reader for fleet and lab questions**; answers are posted on the row.
- **The author of a draft prompts its parity reviewer** on open and after every head-changing push:
  `npm run prompt:session -- reviewer "…"` for odd PR numbers, `reviewer-2` for even. **`prompt:session`
  CLEARS THE SESSION FIRST and a raw `herdr … agent prompt` does not** — use the raw call only to
  RE-prompt the same draft. No verdict 30 minutes after it goes to `product-manager`, who re-prompts once,
  then `ceo`.
- **ONE CALL IS ENOUGH, AND RETRYING IS THE WRONG THING (#1966).** `prompt:session` **queues** the order
  (**exit `2` is `QUEUED`, not a failure**) and the next `work:tick` delivers it, cleared. **Do not retry
  and do not poll:** it clears its target first, so a retry landing as a session goes idle wipes the work
  it interrupted. A refusal naming a session the org does not know is a typo — NOT queued, and it says so.
- **`ceo` keeps:** the publish order, freeze decisions, reviewer spot-checks, the board edition read,
  rulings arriving through `product-manager`, and the chairman.

## An approval prompt a human learns to click through is worse than no prompt (2026-09-23, #2076)

- **Write `rm -f "${D:?}"/*.md`, never `rm -f $D/*.md`.** `:?` makes the shell abort on an unset or empty
  variable, so the expansion that would become `rm -f /*.md` is impossible; the quotes stop a path with a
  space re-splitting. **The prompt stops firing because the danger is gone, not because the guard was
  overridden** — the only version of "stop asking me" worth having, and one of the few guards
  `--dangerously-skip-permissions` does not disable, so it reaches a human every time.
- **The cost is not the seconds:** one such line reached the chairman **several times in one morning**.
  Every avoidable prompt **makes the unavoidable ones cheaper to ignore**, and the next is real.
- **The general form: when a command is refused for its SHAPE rather than its EFFECT, change the shape.**
  Reaching for an override, or asking a human to approve it again, both leave the next session to
  rediscover the same refusal — and one of them trains the reviewer out of reviewing.
- **Prevention rather than cleanup.** Quoting alone defuses the BARE-VARIABLE case, and buys nothing once
  a glob is attached: an empty `"$D"` in `rm -f "$D"/*.md` still expands to `rm -f /*.md`, because the glob
  sits OUTSIDE the quotes. So quote always, and reach for `:?` **the moment a glob joins the variable.**
- **Count this population with `roles-readme.test.ts`'s classifier, which splits the arguments and drops
  the flags, not with a regex over the whole line** — `rm -f -- "$path"` puts a `--` where the regex
  expects the target, so a line-anchored grep under-reads it.

## Assertions

- **An emptiness assertion names where its positive control lives.** `assert.deepEqual(offenders, [])`
  passes when the population is empty, so somewhere there must be an assertion that it is not — and the
  writer must be able to point at it. **A control you believe in is not one you can point at.**
- **Where the population comes from decides whether a machine can help you:** a local collection is
  refused unpinned by `local/uncontrolled-emptiness`; the **64 derive from a CALL** have only this
  line (#1157).
