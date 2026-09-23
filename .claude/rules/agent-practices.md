# Agent practices — every session in this repo (chairman's direction, 2026-09-11)

These load with CLAUDE.md in every session. They are habits, not gates; the org clock on #912 reads
whether they are followed.

## Model routing for subagents

- `model="haiku"` for data gathering: file reads, counting, directory walks, grep, API listings.
- `model="sonnet"` for analysis and judgment over gathered material.
- `model="opus"` only for multi-step reasoning that a cheaper tier has measurably got wrong.
- Measured 2026-09-10 over 30 days: Opus carried 66% of billable tokens and Haiku under 1%, with no
  routing rule anywhere. Every subagent call names its model.

## Context

- `/compact` at 50–70% context fill, before auto-compact; quality degrades past 70%.
- `/clear` between unrelated topics; a fresh window beats stale history.
- Batch related requests into one message; every round-trip re-sends the whole config stack.

## Web research

- Measured 2026-09-11 over 30 days: 576 web search and fetch calls put about 2.9 million tokens of page
  content into main-session contexts. Run research in a subagent (`haiku` to gather, `sonnet` to
  digest) so the pages stay in its context and only the digest reaches yours; ask for a digest with
  sources, never a page dump. One fetch that the main session must read itself is the exception, not
  the habit.

## Timers and state

- **No session holds a standing cron. This reverses the rule that stood here until 2026-09-17, and the
  reversal is the point.** Every session used to hold one (engineers every 10 min, the fleet operator
  every 10 min, the product-manager every 30 min), and each firing was a MODEL TURN that woke to ask a
  question a script answers in one API call: about 672 turns a day, most finding nothing. That emptied a
  weekly allowance in three days and put both Codex reviewers on their own quota the same way.
  `CronList` after a restart is no longer the first command; **`CronDelete` on anything you find there
  is.**
- **THE CLOCK WAS NEVER THE DEFECT — a tick that costs no tokens can run all day.** The defect was that
  the tick WAS a model turn. So the tick moved out of the model: `npm run work:tick` runs
  `work-gate.mjs` (two `gh` calls, no model) and hands what it finds to `wake.mjs`, which prompts only a
  session herdr reports as `idle` or `done`, and only once per cause. You are woken WITH the answer
  already in your prompt; you no longer wake to go and look.
- **So: do not create a cron to check for work.** If you think you need one, the gate is missing a
  question rather than you needing a timer — add it to `work-gate.mjs`, where it costs an API call
  instead of a turn, and where the repository can see it. A cron is still right for something that must
  happen at a WALL-CLOCK time regardless of state (a nightly, a board edition); it is never right for
  "has anything changed yet".
- Measured on the agent host 2026-09-17, after the sessions were stopped: no user or root crontab, no
  `at` queue, no systemd timer but `herdr.service`. These were in-session `CronCreate` crons, which is
  why nothing outside the sessions could ever see them — and why this rule, not a host change, is what
  keeps them from coming back.
- The row is the state. Read the row, the PR and the API before acting on any message, including one
  from ceo.
- A product PR opens as a DRAFT and is marked ready only when the reviewer writes "convinced";
  docs-and-tests PRs open ready. Nobody merges by hand.
- **`Acceptance:` and `Closes` are now MERGE-BLOCKING (2026-09-17).** `acceptance` and `ownedPaths` are
  back in `gate`'s `needs`, so a malformed PR body no longer merges red -- it does not merge. Two things
  cost four red runs before this landed, both body defects rather than broken code: a DUPLICATED
  `Acceptance:` section (the checker cannot tell which command to run, so it refuses), and a MISSING
  `Closes` declaration. When a PR finishes no row, the declaration is `Closes: none -- <reason>` with an
  em dash; it is required either way. Editing the body re-runs the check, so a mistake costs a minute.
- **A settled draft with green checks and no verdict is reviewed by the external reviewer (`by reviewer:`);
  an engineer reviews only when ceo names one** — a reviewer stalled past a re-prompt, or a product path
  ceo wants two eyes on. ceo spot-checks the reviewer's first five verdicts and one in five after. The
  chairman's instruction, ruled by ceo on 2026-09-13 (#1394) and effective in ceo's heartbeat v10 (#912,
  comment 5655501080). An engineer with no row in build claims the next Ready row; an open draft is not
  their work unless ceo has named them.
  *A record, not an instruction:* from 2026-09-12 until that ruling, a free engineer reviewed settled
  drafts unasked, because every verdict from 14:02Z that day was engineer-to-engineer and a draft could
  wait thirty minutes between wake-ups for the clock to name someone.

## The API budget — `gh api rate_limit` is a broken gauge (measured 2026-09-22, #1967)

- **Never decide anything from `gh api rate_limit`.** It has been measured reporting a FULL pool during a
  total GraphQL outage of that same token, pointing three quarters of an hour past the real reset. Two
  sessions burned a cycle on it on 2026-09-22: one read the headers and reported the pool exhausted, a peer
  read the endpoint, saw `5000/5000`, and sent a correction stating the finding was backwards and that
  nothing had spent the pool that day. The gauge was wrong, not the finding — and it has now lied twice,
  three weeks apart (#1275, #1967).
- **Read `X-Ratelimit-*` off a real call to the pool you care about** — `gh api graphql -f
  query='{viewer{login}}' -i` for graphql, `gh api <rest-path> -i` for core — and let
  `X-Ratelimit-Resource` confirm which pool answered. **The headers come back on the 403 too**, so an
  exhausted pool is still readable: the call exits non-zero and the response lands on the error's `stdout`
  (`poolFromHeaders`, `queue-table.mjs`). Code already reads them — `rateLimitHeaders`/`logRateLimit` in
  `close-rows-for-merged-pr.mjs`, `apiBudget` in `queue-table.mjs` — so this line is about what you type by
  hand. The harness's own rate-limit advice, to run that endpoint and sleep until the reset it names,
  cannot be corrected from this repo; that is why the correction has to live where every session loads it.
- **Pools are per TOKEN and per RESOURCE, and the endpoint can be right about one while lying about the
  other.** Reproduced 2026-09-22 19:08:44Z, same token, same second: on `core` it read `remaining 4955`
  against the headers' `4954`, same reset — plausible, checkable, true — while on `graphql` it read
  `used 0, remaining 5000, reset 20:08:43Z` against the headers' `used 1360, remaining 3640, reset
  19:19:20Z`. **A sanity check on core is not a sanity check.** `gh pr view`, `gh pr list` and
  `gh issue list` spend GRAPHQL; `gh api` spends CORE; one can be dead while the other is healthy, so read
  the pool you are about to spend rather than the one that answers first. Per TOKEN means every session
  authenticating as the same ACCOUNT shares one counter — and which account you are is not a constant
  here. The default `~/.config/gh` authenticates as a person (`DanBeckDev`), and
  `GH_CONFIG_DIR=/home/agent/workers/gh` as `a11ign-ai-workers` — which is what
  `a11ign-work-tick.service` sets. So an exhausted pool always has a healthy-looking neighbour, and
  **you must not switch to the other config to get past your own limit.** One export changes who every
  subsequent write is attributed to; nobody has ruled that a blocked session may spend the other
  account's quota, and that disposition is `ceo`'s (`lane:ceo`, #916) rather than yours. Wait out your
  own reset.
- **You may already be spending an account you did not pick, so name it before you read its pool.**
  `/home/agent/.local/bin/gh` is a ROUTING WRAPPER sitting ahead of `/usr/bin/gh` on an interactive PATH:
  with `GH_CONFIG_DIR` unset it selects the workers config when `HERDR_WORKSPACE_ID` is listed in
  `/home/agent/workers/workspaces.txt`, and the person's config otherwise — which is why a systemd unit,
  having no workspace id, must DECLARE `GH_CONFIG_DIR` rather than inherit one (`host-units.mjs`, and the
  units that carry the line). Measured 2026-09-23T17:47Z, one shell, one second: `/usr/bin/gh api user`
  read `DanBeckDev` while `/home/agent/.local/bin/gh api user` read `a11ign-ai-workers`.
  **Run `gh api user --jq .login` first, then the headers** — the pool you are about to spend is decided
  by your PATH and your workspace id, not by what you typed.

## `lane:ceo` protects review, not authorship (ceo's ruling, 2026-09-18)

- **A `lane:<owner>` label refuses any OTHER session unconditionally** (`laneReason`,
  `packages/agent-org/src/row-claim/runner-rule.mjs`) — a `Lane-exception:` line in a PR body, or even a
  comment saying "assigned to X", changes nothing at claim time. Only the label does. If the owner is the
  only session that can ever claim the row, the owner's own turn budget is the queue's throughput.
- **Measured 2026-09-18:** 3 engineers idle all morning behind 4 `lane:ceo` rows clearing at ~1/tick,
  because `ceo` was trying to personally author all four and repeatedly lost the claim to B4 file-overlap
  refusals against `ceo`'s own other open `.github/workflows/` PRs — a self-inflicted bottleneck, not a
  property of the rows.
- **The test before leaving a row in a lane other than `any`: does the label protect a DECISION only the
  owner can make (the publish order, a freeze, a ruling — a genuine choice between behaviours), or a PATH
  that needs the owner's REVIEW but not the owner's hands?** `docs/lane-ownership.json`'s own rationale for
  `lane:ceo` is a trunk-health/merge-queue REVIEW concern, and its own `_exception` already contemplates an
  engineer building under a `Lane-exception:` line — the lane was never meant to require `ceo`'s authorship.
  Where it is a path, re-lane to `lane:any` (engineer builds, owner still reviews via the
  `Lane-exception:` line and normal review). Where it is genuinely a decision, it stays, and the wait
  behind it is then a real cost of the decision rather than an accident of the path rule. Full ruling and
  the per-row reasoning: `docs/lane-ownership.json`'s `_claimVsAuthorRuling`, and #1320/#1257/#1397/#1452.

## `main` REQUIRES an approving review (ceo's ruling, 2026-09-22, #2022)

**This replaces the 2026-09-19 deferral rather than sitting beside it; #1761 is closed out here.** That
ruling withheld the requirement on a premise measured false at `75348436e`: it feared that "a bot account
that also opens PRs (`a11ign-ai-workers`) may find GitHub refuses its own review as self-approval". But
reviews are posted by `a11ign-bot`, and PRs are opened by `a11ign-ai-workers` and `DanBeckDev`.
**`a11ign-bot` is neither**, so the collision cannot arise on the observed population, and its own
clearing condition — the next real review — was met by #1968.

**The supporting splits are ROLLING counts: each is a reading at a named moment, never a present-tense
fact.** The opening split was 68/32 of the last 100 at `75348436e`, and 76/24 some 26 hours later.
Verdict-as-review took as hoped: 28 of the 40 most recent PRs carried a review at `75348436e`, **every
one** by `a11ign-bot`, and 33 of 40 at 2026-09-22T23:45Z — against #1761's "0 of the last 25". Re-derive
them before quoting them; what does not drift is the membership above.

- **The failure it permitted happened.** #1971 on 2026-09-22: `added_to_merge_queue` 19:22:54Z, a
  `not convinced` verdict 19:23:43Z, `hold:product-manager` 19:26:46Z, **merged 19:27:28Z**. A verdict
  3m45s before the merge and a hold 42s before it, and **neither was visible to GitHub's machinery**, so
  neither could stop a PR already in the queue. Of the 23 PRs merged from 17:52Z that day, 4 merged with
  no approving review. A `--request-changes` review under a required-review rule blocks queue entry
  outright; nothing else here did.
- **The rule: one approving review, and `bypass_pull_request_allowances` EMPTY.** The allowance goes with
  it or the requirement is decorative — `DanBeckDev` was its sole entry and queues a large share of
  merges, so a count of `1` beside it would enforce the rule on the `a11ign-ai-workers` path and exempt
  the other, reading as universal while absent on roughly half of the merges.
- **An `a11ign-bot`-authored PR waits.** It has authored one PR ever (#1694, a trunk revert) and **it
  never merged and never needed to** — closed unmerged after 39 minutes, superseded by a forward fix in
  #1697. The hatch is a human admin editing the protection: one call, always available, and
  `enforce_admins: true` makes it a deliberate logged edit rather than a standing hole. The self-approval
  question never needed testing to decide this — either GitHub refuses the self-approval and such a PR
  waits, or it accepts it and the requirement is met by an author approving itself, which is not a review
  at all. Both arms argue for requiring it; **the deferral bought nothing it could have spent.**
- **Read it back BEHAVIOURALLY, never off the field** (`packages/lab/src/packaging/branch-protection.test.ts`).
  `required_approving_review_count == 1` proves the setting is set, not that it bites. The observable is
  **`reviewDecision`**, which GitHub leaves EMPTY when the base requires no approval: measured on #1968,
  three reviews including an `APPROVED` and an empty decision — the reviews existed and decided nothing.
  It also needs no admin, which matters because `a11ign-ai-workers` has `permissions.admin: false`.
- **A 404 from `branches/main/protection` means absent OR forbidden, and must never be read as
  "unprotected".** `branches/main.protected` is the discriminator and needs no admin: measured
  2026-09-22T23:05Z as `a11ign-ai-workers`, protection 404s while `protected` reads `true`, so that 404
  is FORBIDDEN. A verdict that
  cannot read `bypass_pull_request_allowances` is `CANNOT_TELL`, loudly — never a pass.

## A waiting condition is DATA, not a sentence (chairman's direction, 2026-09-19)

- **If a conclusion changes what should happen next, it goes in a field, not a comment.** The comment
  stays as the reasoning; the field is what moves the org. Every session in this org reads structured
  state and writes prose, and that open loop is the reason the chairman keeps having to intervene:
  **the org can act on what GitHub records, and cannot act on anything it learns.**
- **Measured 2026-09-19: 0 open rows carried a machine-readable blocker; 5 stated one in prose.** Three
  hours of that day, each the same shape — `orchestrator` wrote *"blocked by #1772"* in a comment, #1772
  closed 64 minutes later, and it sat idle with a healthy fleet and five runnable rows; `ceo` wrote
  *"no need to re-check before tomorrow's fire"* on #1234 and was re-woken 2h later for ~18 more
  identical answers; `orchestrator` worked out the control-plane SSH route, wrote it down, and stopped.
- **Waiting on ANOTHER SESSION TO ANSWER → label the row `answer:<session>`.** Measured overnight
  2026-09-20: `orchestrator` needed a ruling from `product-manager`, wrote the question as a comment on
  #914, and **nothing in this org reads comments** — it asked five times over 6.5 hours.
  `product-manager`'s own reply: *"I should have confirmed sooner rather than let five asks go unanswered
  since 01:55Z."* Both behaved correctly; the escalation path simply had no mechanism behind it.
  **Removing the label IS the act of answering**, so there is nothing to remember. A label and not a
  GitHub assignee because only four accounts are assignable here and the eight sessions share them —
  an assignee cannot say WHICH session owes the answer. `answer:<session>` joins `session:*`/`hold:*`:
  one label per session, never one per instance.
- **Waiting on another row → `gh issue edit <n> --add-blocked-by <m>`** (or `--blocked-by` at filing).
  This is **GitHub's own dependency edge**, not a convention this repo invented: the UI renders it and
  `gh issue list --json blockedBy` returns it in the call the gate already makes.
- **Waiting on a date → a `Not-before: YYYY-MM-DD` line in the row body**, because GitHub has no native
  equivalent. A body field and not a label, because a `not-before:<date>` label mints one label per date
  into a vocabulary that already shows that rot (`branch:agent/…`, `worktree:/private/tmp/…`). It follows
  `Acceptance:`/`Closes:` — this repo's own proven pattern of a declared, parsed, tested body field.
- **Waiting on an HOUR → the same field, written `Not-before: YYYY-MM-DDTHH:MM:SSZ`** (#2113). Seconds
  and the `Z` are required; anything else fails open and the row stays visible. **Reach for it whenever
  the condition turns true at a named time rather than on a named day** — a nightly `workflow_dispatch`,
  a capture round, a scheduled publish. A date-only value stops meaning "midnight" the moment you can
  say when: #2002 declared `Not-before: 2026-09-23` for a run the host timer fires at 06:10:00Z, and from
  00:20:00Z the org read that row as waiting on **nothing** for the ~5h50m in between. **It is the same
  field and not a fifth one**, so there is no new spelling to learn; `waitingOn` compares parsed time, and
  a date-only value still means midnight UTC exactly as it always did.
- **`Fleet-hold-until: YYYY-MM-DDTHH:MM:SSZ` says TWO things, and only one of them is enforced.** It
  refuses `fleet:deploy`/`fleet:provision` until T — that part is code. It is also *used*, on five live
  rows as of 2026-09-23, to mean **"my capture sequence owns the workers until T"**, and **nothing reads
  it for that**: `evidence:check` skips a busy worker rather than queueing behind it, so a dispatch into
  an occupied fleet compares nothing. Declare it for both, and treat the second as a note to humans.
  There is deliberately **no `Worker-hold-until:`** beside it: this field already carries a full
  timestamp, and a second one would state the same fact twice in the vocabulary #2113 exists to stop
  growing.
- **Both CLEAR THEMSELVES, and that is the whole point.** `blocked` is a claim with **no referent**: it
  says something blocks this row and never says what, so nothing can check it and only a human re-reading
  the row can lift it — which is why 11 rows carried it that day, several waiting on conditions that had
  long since become true. **A waiting condition must name what it waits on, in a form a machine can
  evaluate.** Prefer these two over `blocked`; use `blocked` only for a wait neither can express, and say
  in the same breath what would clear it.
- **No new cause was needed, and that is the evidence the seam is right.** A waiting row leaves its
  owner's population; when the condition clears it re-enters, the owner's count changes, the causeKey
  changes, the wake ledger's dedupe stops matching, and the existing cause fires. A shelved `ready` row
  is reported on the tick log with its reason, never dropped silently.

## Routing — who reads what (chairman's direction, 2026-09-14)

- **`product-manager` is the first reader for rows, the queue and process, and rules on them:** filing and
  amendments, Region and done-when wording, holds, lane labels, promotions, claim reports, merge close-outs,
  host-run announcements. An engineer's completion or claim report goes to `product-manager`, never to
  `ceo`. Three things come up from `product-manager` to `ceo`: a ruling they cannot make (a rule or ADR
  conflict, a crossing into a `ceo` lane, the publish path); ONE state reading per `ceo` tick — utilisation,
  queue, drafts awaiting a verdict, anything red; and anything for the chairman.
- **That state reading is POSTED and DELIVERED, and those are two different jobs (`ceo`'s ruling,
  2026-09-23, #2083).** Post it on **#928**: that thread is the RECORD, it is where `org-watch.mjs`,
  `fleet-watch.mjs` and `lab-watch.mjs` already post, and a reading that lives only in a session's inbox is
  gone at that session's next clear. Then deliver it with **`npm run prompt:session -- ceo "…"`**, because
  posting on its own reaches nobody — *nothing in this org reads comments*, which is the same finding the
  `answer:<session>` rule above is built on. **Both halves, or the reading is either unrecorded or
  undelivered.**
  The clause this replaces named three fixed minutes past the hour to post at, so that a tick four minutes
  later would read it — and **there has been no such tick since the cron removal under *Timers and state*
  above**; `ceo` is woken by `wake.mjs` when `work-gate.mjs` finds a cause. Following it literally sent the
  org's only state reading to a thread nobody was scheduled to read: measured 2026-09-23, one decision in
  that reading had waited **6h52m** with a `convinced` verdict and a met `hold:ceo` condition (#2045).
  **"One reading per `ceo` tick" survives as a RATE, and that is the part worth keeping** — the wall-clock
  minutes were addressing a clock that was deleted.
  The send may come back **`QUEUED` (exit `2`)** because `ceo` is mid-turn. **That is delivery, not
  failure: do not retry and do not poll** — see *ONE CALL IS ENOUGH* below for why a retry can wipe the
  work it interrupts. A state reading is precisely the kind of message somebody would wrongly re-send.
- **`orchestrator` is the first reader for fleet and lab questions** — a capture's history, a worker fact,
  a lab reading. Engineers ask directly; the answer is posted on the row.
- **The author of a draft prompts its parity reviewer** the moment the PR opens and again after every push
  that changes the head: `npm run prompt:session -- reviewer "Draft #<n> (odd) …"` for odd numbers,
  `reviewer-2` for even. **`prompt:session` CLEARS THE SESSION FIRST, and the raw
  `herdr ... agent prompt` this line used to name does not** — that is the whole reason it exists.
  `wake.mjs` has cleared before every order it delivers since #912 (690k → 37k input tokens on a real
  session, an 18× cut), but an author calling `herdr` directly bypassed it. Measured 2026-09-19 on a real
  `reviewer` transcript: six reviews in one unbroken session — #1765, #1767, #1769, #1771, #1775, #1777 —
  only #1765 delivered by the gate, 2.29M cached input tokens carried, and at least one auto-compact. Use
  the raw call only for a RE-prompt about the same draft, where the reviewer's existing context is the
  point. `ceo`'s tick no longer does it; a draft with no verdict 30 minutes after the
  author's prompt is reported to `product-manager`, who re-prompts once and then tells `ceo`.
- **ONE CALL IS ENOUGH, AND RETRYING IS NOW THE WRONG THING (#1966, 2026-09-22).** `prompt:session` used
  to print `NOT PROMPTED: "reviewer" is working` and exit, and **that was the end of the order** — nothing
  re-offered it, and nothing outside the author's own terminal knew one had existed. Measured while filing
  draft #1963: three refusals in 4m37s, delivery only on the fourth, and only because the author held a
  retry loop open inside its own turn. It now **queues** the order (exit `2` is `QUEUED`, not a failure)
  and the next `npm run work:tick` delivers it, cleared, once the gate judges that session between tasks.
  **Do not retry, and do not poll:** this command clears its target first, so a retry that lands the
  instant a busy session goes idle wipes the review it interrupted — `reviewer` was mid-review of #1963
  during that exact window. A refusal naming a session the org does not know is the one that is still
  yours: that is a typo, it is NOT queued, and it says so.
- **`ceo` keeps:** the publish order and every freeze decision, reviewer spot-checks, the board edition read,
  rulings that reach it through `product-manager`, and the chairman.
- **Why (measured 2026-09-14, ceo's own inbound):** about half of one night's messages to `ceo` were
  read-backs and reports that needed a nod, not a decision; each cost a Fable turn and a tick's latency, and
  reviewer nudges waited up to twenty minutes for a heartbeat that an author could have replaced with one
  command. The rule that stays: the row is the state — a report to `product-manager` changes nothing until
  the row, the PR and the API say so.

## An approval prompt a human learns to click through is worse than no prompt (2026-09-23, #2076)

- **Write `rm -f "${D:?}"/*.md`, never `rm -f $D/*.md`.** `:?` makes the shell abort on an unset or empty
  variable, so the expansion that would become `rm -f /*.md` becomes impossible; the quotes stop a path
  containing a space re-splitting into two arguments. **The prompt stops firing because the danger is gone,
  not because the guard was overridden** — which is the only version of "stop asking me" worth having.
- **Measured 2026-09-23:** `product-manager` posted issue comments through
  `D=/tmp/.../scratchpad/comments && rm -f $D/*.md`, and the chairman approved that same shape **several
  times in one morning**, each time having to read a command in order to conclude it was fine. The line is
  **safe as written** — `D` is assigned a literal path on the same line and `&&` gates the `rm` on that
  assignment, so it cannot be empty — but the classifier cannot see that, and **this is one of the few
  guards `--dangerously-skip-permissions` deliberately does not disable**, so it reached a human every time
  despite bypass being on.
- **The cost is not the seconds.** Every avoidable prompt spends a human's attention and makes the
  unavoidable ones cheaper to ignore. The next one will be genuinely dangerous and will get the same reflex.
- **The general form, and the part worth keeping: when a command is refused for its SHAPE rather than its
  EFFECT, change the shape.** Reaching for an override, or asking a human to approve it again, both leave
  the next session to rediscover the same refusal — and one of them trains the reviewer out of reviewing.
- **Quoting alone defuses the BARE-VARIABLE case, and buys nothing once a glob is attached.** An empty
  `"$STAGE"` makes `rm -rf ""`, which removes nothing; an empty `"$D"` in `rm -f "$D"/*.md` still expands to
  `rm -f /*.md`, because the glob sits OUTSIDE the quotes and the shell expands it against `/` (verified in
  `bash -c 'D=""; echo rm -f "$D"/*.md'`). So quote always, and **reach for `:?` the moment a glob joins the
  variable** — that pair is the whole rule, and it is why the guard below treats `rm -f "$D"/*.md` as
  dangerous rather than as already defended.
- **Prevention rather than cleanup, and the population is counted by a classifier rather than a grep.**
  Measured at `67f30071f`: **no tracked file a shell executes runs `rm` on a glob beneath an unguarded
  variable** — the only appearances of that shape anywhere in the tree are this rule and the guard that
  pins it, quoting it. **Nine tracked files do pass a variable to `rm`, on 13 lines** —
  `fetch-windows-iso.sh` (3), `pre-push` (2), `ansible/lab-reset.yml` (2), `build-vm.sh`,
  `create-utm-vm.sh`, `serve-bootstrap.sh`, `pre-commit`, `codex-backend.test.ts`,
  `lab-job-lock-two-rows.test.ts` — and **every one is quoted with no glob attached**, so none of them
  prompts and none is cleanup this rule owes. A line-anchored grep
  (`git grep -nE 'rm +(-[rfv]+ +)*"?\$\{?[A-Za-z_][A-Za-z0-9_]*\}?"?[^ ]*\*'` for the shape,
  `rm +(-[a-zA-Z]+ +)*"?\$` for the population) reads **8 files and 11 lines**, and it is low for a reason
  worth knowing: `rm -f -- "$path"` puts a `--` where the regex expects the target, so `lab-reset.yml` is
  invisible to it. **Count these with `roles-readme.test.ts`'s classifier, which splits the arguments and
  drops the flags, not with a regex over the whole line.**

## Assertions

- **An emptiness assertion names where its positive control lives.** `assert.deepEqual(offenders, [])`
  passes when the population is empty, so somewhere there must be an assertion that it is not — and the
  writer has to be able to point at it. A control you believe in is not one you can point at.
- **Where the population comes from decides whether a machine can help you.** Measured over 236 such
  assertions, 2026-09-12: 64 derive from a local collection (`const xs = ys.filter(…)`), and
  `local/uncontrolled-emptiness` refuses those unpinned — **64 derive from a CALL** (`f().filter(…)`),
  where no rule can trace the source without guessing at what `f()` returns, so those have **only this
  line**. 73 are accumulators and 17 unclassified, both with their own rows.
- **This is a habit and this repository loses habits**; the reason it stays one is that the alternative
  is a rule that infers intent, which is the defect this family is about one level up. A habit that
  decays beats a guard that guesses, and #1157 records the trade rather than pretending it is not one.
