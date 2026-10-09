# Why the gate's `pr list` and `issue list` still spend after the per-tick snapshot

A reading for a11ign#4616 (the diagnosis half of #4148). No code changed.

**One cause covers all three callers, and it is in the wrapper, not in the gate or the tick: `host/gh` throws away the
whole read store on every call it classes as a write, and the account makes such a call about every 5 seconds.** The
snapshot (`src/tick-snapshot.ts`) is working as written; the entries it vouches for are deleted before the next reader
arrives.

Fix file: host/gh

Sources are the `a11ign/agent-org` checkout at `777c569` (`origin/main`, fetched 2026-10-09 ~18:45Z; the row's
open-check was taken at `bd1121a`) and this repository at `42be7fda1`. Every number below says how it was obtained.

## The reading, in one table

Ledger: `node src/gh-ledger.ts /home/agent/workers/gh/gh-calls.tsv --account a11ign-ai-workers --resource graphql`,
window **2026-10-09T18:07:17Z .. 18:49:09Z** (5,395 calls; a frozen copy was analysed, so the figures agree with each
other). *Measured.* Floor points: every `read` column is 0, so these are lower bounds, as #4148 says.

| caller | floor points | calls | served from the store | call site (agent-org `777c569`) | why it is not served |
|---|---|---|---|---|---|
| `work-gate.ts [pr list]` | 557 | 557 | **0** | `src/work-gate.ts:403` (`openPrsArgs`), asked by `readPrs` `:454-455`, run through `runBatch` `:337` / `BATCH_WORKER` `:313-317` | the store is empty when it asks (below) |
| `work-gate.ts [issue list]` | 189 | 199 | **10** | `:983` (chairman), `:1119` (backlog), `:1160` (ready), `:1567` (all open rows, `--limit 500`), `:3377` (claims) | same |
| `work-tick.ts [issue list]` | 221 | 221 | **0** | `src/row-claim/own-pr-health-rule.ts:640` (`lookupOtherHeldIssues`), reached from `wake.ts:6438` (`tearDownSpares`), which `work-tick.ts` calls as a phase (`:444`); ~one per live spare per tick (*inferred*: 221 calls over ~33 tick minutes) | same |

**On "why it does not read `src/tick-snapshot.ts`":** none of the three is meant to. `tick-snapshot.ts` writes only a
*generation* per repository (`$GH_CONFIG_DIR/read-cache/gen/<repo>`); the reads are answered by `host/gh`, which every
caller already goes through (`work-gate.ts` has no reference to the module and needs none; `work-tick.ts` references it
once, `:33`, to run the refresh at `:498`). The BATCH_WORKER child inherits `process.env`, so `A11Y_TICK_SNAPSHOT` reaches
it (`:317`). *Read from the source; the env reaching the child was not run.* So the question is why `host/gh` does not
answer them.

## The cause

`host/gh` `:260`:

```sh
[ "$class" = write ] && [ "${A11Y_GH_READ_CACHE:-}" != off ] && rm -f "${RC:?}"/e/* 2>/dev/null
```

Every entry for every repository goes, whoever made the write and whichever repository it touched. What counts as a
write is `call_class` (`:163-190`), and it is wider than a write:

| classed `write` (`host/gh`) | line | what actually calls it, and how often in the window (*measured*, ledger first two argv words) |
|---|---|---|
| `api` with `--method`, `-X*`, `-f`, `-F`, `--field`, `--input` **whatever the method** | `:180` | `api --method` **215** (gate 144, other node children 71); sources include `GET`s: `class-repeat.ts:106`, `org-health.ts:1210`, `release-behind-main.ts:159,175` all pass `--method GET -f …`. `api -X` **54** from `work-tick.ts` (*inferred from the source, which has no other `-X` in the tick*: the heartbeat PATCHes, written at the **end of every tick** (`work-tick.ts:333` -> `:395-412`, one per tracker repository plus one comment)) |
| `label create` | `:166` (any `label` verb but `list`/`view`) | **119**: `class-repeat.ts:337` from the gate, `row-file.ts:1887`, `pr-open.ts:640`, `row-claim.ts:321` |
| `issue create/comment/edit`, `pr create/edit/merge` | `:166` | **149** (*the remainder of the 561 after the three rows around it*, so it also holds any other write verb) |
| `auth git-credential` | `:168` (any `auth` verb but `status`/`token`) | **24**: the credential helper behind every `git fetch`/`git push` by any session. It writes nothing to GitHub |

*Measured over the same window:* **561 store-dropping calls in 41.9 minutes; the median gap between two is 1 s, the 90th
percentile 11 s, the longest 62 s; every one of the 43 clock minutes the window touches had at least one.** For each of the three callers, **every one of their calls (557, 199, 221) had a store-dropping call in
the 60 s before it**, and 117, 19 and 72 of them had one in the previous 10 s. `read-cache/e/` held **0 entries** when
read at ~18:47Z, and the ledger holds 92 `cache` lines in 5,395 calls (1.7%).

Two things follow. A tick lasts about two minutes and ends with the heartbeat write (a drop), so **no entry stored by
one tick has ever survived to the next**; and the gate's own reads inside one tick are all different argument lists, so
the 20-second identical-read window cannot help them either. The 10 gate hits are the rare repeat inside one run.

*Caveat on the method:* the ledger records only `argv[1] argv[2]`, so a drop is counted from those two words. A
`gh api -H … -X POST` shows as `api -H` and is not counted: the 561 is a lower bound. And a `--method GET` is counted as
a drop because that is what the wrapper does, not because I saw it delete (I did not call the wrapper).

## The residual, which the fix will not remove

The snapshot's journal lines (`journalctl --user -u a11ign-work-tick.service`, 18:31Z..18:46Z, 8 ticks) show
**`a11ign/a11ign` and `a11ign/agent-org` "CHANGED" on all 8**, the other seven repositories on 1 to 7 of them. Those two
repositories hold the reads that matter most (the home tracker's `issue list`s and the code repository's `pr list`),
so after the fix their entries will still be invalidated by the probe each tick, and only the other seven repositories'
reads will be saved. **I did not establish why the two move every tick:** sessions' comments and pushes are enough on
their own, and the tick's own heartbeat comment edit (`work-tick.ts:410`, on the first tracker) may add to it. Neither
was tested. The fix row should therefore **name a number it can fail**: floor points per hour for these three callers
before and after, from `gh-ledger.ts --per-hour`, not "the cache is used".

## What the fix looks like, and why it is one file

All of it is in `host/gh`, `call_class` and the line at `:260`:

1. `auth` (`git-credential` and the rest of the read-only verbs) and `api` with an explicit `GET` are not writes.
2. A write drops the entries of the repository it names, not the store (`read_repo_slug` already finds it; entries would
   need filing under it, and `-R`-less calls fall under `default`).
3. Test: `src/packaging/` has the wrapper tests (`tick-snapshot.test.ts` runs the shell with a stub); the fix row's
   Acceptance should fail today with one of them, a `--method GET` or a `git-credential` call followed by a repeated
   read. That test is the fix's, not this file's.

`work-gate.ts` and `work-tick.ts` need no change for it. If the fix row wants the home-repository residual as well, that
is a different question (`tick-snapshot.ts` probes) and a second row, after the first has been measured.

## Out of scope, found on the way

`row-file.ts [pr list]` is the second-largest spender in the same window (360 floor points). It is `row-file` run by
`class-repeat` from the gate, one `pr list` per candidate; the same wipe explains why none repeats. Not diagnosed
further.
