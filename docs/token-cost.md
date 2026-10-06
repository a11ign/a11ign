# Calls and dollars per merged pull request

The chairman's other two targets, **at most 70 calls and under $2.50 per merged pull request** (`docs/ci-targets.json`),
read from the host's Claude Code session transcripts by `scripts/token-cost.mjs` and appended to the week's
`## CI health, week of <date>` comment on #928 (row #3217). A figure without its definition is the defect this reading
exists to avoid, so each definition is one line below, and the first six are printed at the top of every reading.

## Definitions

- **Call** — one model request, counted once by its `message.id`. Claude Code writes one transcript line per content block of a request with the usage repeated, so counting lines reads about 2.5 times too high (214 lines were 89 requests in one transcript). A `<synthetic>` message is not a request and is not counted.
- **Sessions** — every Claude Code session whose transcript is under `~/.claude/projects` on the host: standing seats, spawned workers, reviewers, subagents. Claude only; nothing else is spent through this door.
- **Price** — the LIST price per million tokens (what the tokens would cost on the API, the chairman's proxy), read **2026-10-05** from the claude-api skill's model table (cached by it 2026-09-25) and its `model-migration.md`. `PRICE_LIST` in the script holds it; that doc states cache reads for Sonnet 5.5, Opus 5.5 and Fable 5.1 and derives the rest by its 0.1x / 1.25x / 2x multipliers. A model not on the list is UNPRICED and counted, never priced at $0.
- **Merged** — a pull request merged inside the window, in either repository `docs/ci-targets.json` names, read from `repos/<r>/pulls?state=closed` by `merged_at`. Pull requests no session worked on (release and Dependabot PRs) are merged and have no calls.
- **Window** — half-open and UTC: `since` is in, `until` is out, so an instant stamped exactly at the end belongs to the next window and never to both. The weekly reading uses #3212's window (the seven whole UTC days before the run). `--hours=14-20` adds the chairman's hour band, `[14:00, 20:00)` of each day.
- **Attribution** — a call belongs to a merged pull request when (1) the branch its line was written on is that pull request's head branch, else (2) its session is `reviewer-<n>` and exactly one repository merged a pull request numbered n, else (3) its session is `worker-<n>` and exactly one merged head branch ends in `-<n>`. A branch or number two repositories share is ambiguous and reaches none.
- **UNATTRIBUTED** — every call no rule reaches belongs to NO pull request and is printed as its own line with its dollars and the sessions it came from (the standing seats, ticks, and workers whose pull request had not merged). It is never dropped. Measured 2026-10-05: 54% of the calls on 2026-10-03 14–20Z and 66% on 09-25 and 10-04. Dropping it would roughly halve the calls figure, so **the verdict of record is on ALL calls** (the chairman's own division) and the attributed figures are the breakdown beneath it.
- **UNREAD** — a merged pull request with no attributed call reads UNREAD and is out of the per-pull-request averages (never a $0.00 that pulls them down); a repository with fewer than 10 merged pull requests in the window reads UNREAD with its count, as #3212's table does; a missing `docs/ci-targets.json` reads UNREAD and says so.

## The four contributors

Over a repository's attributed calls, each call counted **once**, in this order (a call that fits two is counted under the first):

1. **waits** — a call in a turn that carried no change: the order was an idle nudge (`IDLE FOR n MINUTES`), or the turn ended "nothing to do" in 8 calls or fewer (the 8 is a judgement, `QUIET_TURN_MAX_CALLS`, and a longer turn did work first).
2. **re-reads** — the first call of a session resumed or cleared (a session name seen in an earlier transcript), or the first call after a compaction: its context is read again.
3. **CI red** — an author call after a failed `pull_request` run of `ci.yml` on the pull request's branch, until the next run that passed or the merge. (A reviewer's calls are never CI red or a review round.)
4. **review rounds** — an author call after a non-approving verdict (changes requested, or a comment) by anyone but the author, until the next verdict or the merge.

A call that fits none of the four is **none of the four** and stays out of all of them. The reading prints all four counts and the none count, which sum to the attributed calls, so the line `Biggest contributor: <name> (<n> calls, <share>% of the attributed calls)` can be checked against them. The identity with the remainder is two-level, because the calls of no pull request belong to no repository: for each repository, the four + none = its attributed calls; over both, attributed + UNATTRIBUTED = every call.

## What was reproduced (2026-10-05)

The chairman's figures are on #928 (`ceo`'s relay of 2026-10-04, comment 5980190668), taken from his session's own scripts. Reproduced from the transcripts with `node scripts/token-cost.mjs --since=<date> --until=<ISO> [--hours=14-20]`:

| Window (UTC) | Merged | Calls per PR: his / here | Dollars per PR: his / list price / 5-minute-write proxy | Mean context per call: his / here |
|---|---|---|---|---|
| 2026-09-25 14:00–20:00 | 20 | 65 / 64.6 (1,292 calls) | $3.62 / $3.97 / **$3.62** | 195k / 194,741 |
| 2026-10-03 14:00–20:00 | 54 | 81 / 80.7 (4,356 calls) | $2.39 / $2.74 / **$2.39** | 84k / 84,270 |
| 2026-10-04 00:00–11:00 | 20 | 114 / 114.2 (2,283 calls) | $3.35 / $3.90 / **$3.35** | 78k / 77,679 |

- **Calls per merged pull request is ALL calls in the window divided by merged pull requests** (both repositories), unattributed calls included. That is what reproduces his 65, 81 and 114.
- **The dollars match only when every cache write is priced at the 5-minute rate (1.25x input).** The transcripts report these writes as 1-hour writes (2x input), and priced as reported the same calls cost 10–16% more. On 10-03: $147.94 at the reported rate, 34% of it cache writes; repricing them gives $129.08, his 54 x $2.39 = $129.06. The reading prints both rows. **`ceo` ruled 2026-10-05 (#3217): the $2.50 target is read at list price as the usage reports it, so the list-price row is the verdict of record and the 5-minute-write row is printed as a comparison, labelled so.** Three reasons: the transcripts report the writes as 1-hour writes, so pricing them at the 5-minute rate prices a call the model did not make (on 2026-10-03 14-20Z, $147.94 against $129.08, 10-16% lower); the chairman's own row calls his reading a list-price proxy, so 1.25x is his approximation of list and not a second price list; and a dollars target read on the cheaper basis is met by the pricing rather than by the work. The proxy row stays so his figures remain reproducible and the gap is always visible.
- The row's "$3.62 to about $3.00" and "65 to 87–99" are not one stated window. The three windows above reproduce his relayed figures exactly. The three days 2026-10-01 to 10-03 at 14:00–20:00 each (102 merged) read **92.1 calls and $2.89 on the 5-minute-write proxy ($3.29 at list price)**: inside 87–99 and near $3.00, so consistent with the row, **but the window behind it was never stated, so it is not confirmed**.

## Limits, named

- **Branch names decide attribution.** A call written while a session sat on `HEAD` or `main` (the standing seats always do) belongs to no pull request, and so does a worker's work before its branch exists. The `reviewer-<n>` and `worker-<n>` fallbacks recovered 55 of 4,356 calls on 10-03 and none from `reviewer-<n>`, which that day's sessions did not use.
- **The window applies to calls.** A pull request opened before the window and merged inside it is read from the calls made inside it only.
- **Waits is a measured judgement, not a field.** Its second clause reads the turn's closing sentence; `IDLE_NUDGE` and `NOTHING_TO_DO` in the script are the phrases, and `QUIET_TURN_MAX_CALLS` the cap.
- **A failed required check is a failed `ci.yml` pull_request run**, stamped at the run's `updated_at`.
- **Transcripts older than the host's retention are gone**, and the oldest on the host on 2026-10-05 is from 2026-09-13, so a window before that cannot be reproduced.

## Running it

```bash
node scripts/token-cost.mjs                       # last week's window, to stdout
node scripts/token-cost.mjs --since=2026-09-25 --until=2026-09-26T00:00:00Z --hours=14-20   # a reproduction
node scripts/token-cost.mjs --post                # append to this week's CI-health comment on #928
```

It spends one REST call per merged pull request (its reviews), a few pages of pull requests and of `ci.yml` runs, and prints the rate-limit header it saw. It reads transcripts and merged-pull-request metadata only.

**It runs on the HOST, never in a model turn**, because the transcripts are there. `--post` edits the comment `.github/workflows/ci-health.yml` posts on Mondays at 06:43Z (one comment, one table, #3212's window), so it must run after that comment exists. It exits non-zero and changes nothing when the comment is not there yet (a scheduled Actions run can start hours late, #965), and does nothing when the comment already carries the reading. A week with no reading is a finding for `product-manager`. The unit that runs it weekly is this repository's own pair, `.agent-org/units/a11ign-token-cost-weekly.{service,timer}` (#3690, listed under `units.own`), installed by `host:install`: Mondays 12:13Z, then `Restart=on-failure` every 90 minutes, at most eight starts, the last about 22:43Z. **The window ends inside Monday UTC on purpose:** the script reads the week of today's UTC day, so a start after 00:00Z asks for a different week's comment. The eighth failure leaves the unit FAILED, and a comment that arrives after that is a week with no reading. The unit runs as the workers account, which holds `write` and edited a scratch comment of its own on 2026-10-06; editing the `github-actions[bot]` comment itself is untested until the first run.
