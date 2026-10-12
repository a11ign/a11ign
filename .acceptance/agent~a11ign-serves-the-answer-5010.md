Adds `.agent-org/seats.json` holding exactly `{ "answer-owed": "run" }`: the go-live that serves the `answer-owed` wake class by a one-shot decision run instead of its standing seat. Authority: the chairman's direction on #4505 and `ceo`'s order on the same thread (#5010 body). The reader is agent-org's `src/seat-mode.ts`, and the wake path calls it through `serveByRun` (`src/wake.ts` imports `serveOrdersByRun`), both at agent-org v0.179.1.

**The one-line revert:** delete the `"answer-owed"` line, or set it to `"seat"`, or delete the file. Every one of those reads as `seat`, which is today's behaviour.

**Measured at this head:** the file is absent on `origin/main` (`git grep -c "answer-owed" origin/main -- .agent-org` exits 1), so the Acceptance fails before this change and passes after it.

**Mutations** (the file was restored from the index with `diff` byte-identical after each):
- a second key added (`"org-health": "run"`): the `git grep` half still passes, and the `node` half exits 1, so the second assertion is the one that catches it.
- the value set back to `"seat"`: the `git grep` half exits 1.

**Not done here (named):** nothing in this PR proves a live wake is served by a run. That is observable only after the tick runs on the host, and the resource ban keeps this session away from `lab:*` and `fleet:*`.

Acceptance: bash -c 'git grep -q "\"answer-owed\": \"run\"" -- .agent-org/seats.json && node -e "const s=JSON.parse(require(\"fs\").readFileSync(\".agent-org/seats.json\",\"utf8\")); if(Object.keys(s).join()!==\"answer-owed\") process.exit(1)"'

Closes #5010
