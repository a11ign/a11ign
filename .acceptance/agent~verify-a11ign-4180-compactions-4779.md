The deliverable is a reading, posted on a11ign#4055 (https://github.com/a11ign/a11ign/issues/4055#issuecomment-6112827725): compactions per worker session and cache-read per merged row, three days either side of v0.83.1 (2026-10-08T18:12:46Z). This pull request adds no code; it records the reading and closes the row.

**Measured 2026-10-11 from `~/.cache/a11ign/trace/events.ndjson` (newest event 2026-10-11T19:22:55Z, past the end of the "after" window):**
- Compactions per worker session, before (n=323 sessions): 89 compactions, mean 0.28, p50 0, p90 1, max 4. After (n=549): 186, mean 0.34, p50 0, p90 1, max 5. No session over 10 compactions in either window.
- Cache-read tokens per merged row, before (110 rows): mean 6,380,060, p50 3,206,814, p90 12,505,580. After (219 rows): mean 3,254,869, p50 2,104,960, p90 6,549,699. Rows are those GitHub's closing references name (the store has no PR-to-row link), so n is a floor.

**Not claimed:** no saving. a11ign#4738 (the engineer's context window, open) may confound the "after" window, and the two windows have different row mixes.

**The scripts' output, as run (`reading.mjs` and `rows.mjs`, posted in full on a11ign#4055; the fields the prose above restates).** The prose is checked against this block, so a changed figure on either side turns the Acceptance red:

```json
{"before":{"sessions":323,"compactions":89,"mergedRows":110,"cacheReadMean":6380060,"cacheReadP50":3206814,"cacheReadP90":12505580},
 "after":{"sessions":549,"compactions":186,"mergedRows":219,"cacheReadMean":3254869,"cacheReadP50":2104960,"cacheReadP90":6549699}}
```

The row's own Acceptance (`grep -n 'MIN_WORKING_ROOM_TOKENS =' ~/repos/agent-org/src/worker-profile.ts`) reads a file on the host, so CI cannot run it, and CI's acceptance job holds no token to fetch the posted comment; the grep was run by hand and printed `81:export const MIN_WORKING_ROOM_TOKENS = 100_000;`. CI runs the check below: it parses the block above and requires every figure in the prose to equal it.

**Mutation** (the record, restored byte-identical with `diff`): `(n=323 sessions)` to `(n=324 sessions)` in the prose, `"sessions":323` to `324` in the block, and `no saving` to `a saving` each turn the Acceptance red (exit 1); the unmutated record exits 0. The reviewer's earlier mutation passed because the first command grepped fixed literals that were in the command itself.

Acceptance: node -e 'const t=require("fs").readFileSync(".acceptance/agent~verify-a11ign-4180-compactions-4779.md","utf8");const j=JSON.parse(t.match(/```json\n([\s\S]*?)```/)[1]);const f=(n)=>n.toLocaleString("en-US");const c=(d)=>d.mergedRows+" rows): mean "+f(d.cacheReadMean)+", p50 "+f(d.cacheReadP50)+", p90 "+f(d.cacheReadP90);const need=["before (n="+j.before.sessions+" sessions): "+j.before.compactions+" compactions","After (n="+j.after.sessions+"): "+j.after.compactions+",","before ("+c(j.before),"After ("+c(j.after),"no sav"+"ing"];process.exit(need.every((s)=>t.includes(s))?0:1)'

Closes #4779
