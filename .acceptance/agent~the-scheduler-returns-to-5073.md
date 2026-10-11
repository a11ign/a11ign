`.agent-org/host.json` `github.identity.scheduler` goes back to the App identity that `d34de052c` replaced, the step a11ign#5050 done-when 2 names (#5073). It is conditional on the hour of ticks on agent-org v0.158.1, which read zero search refusals.

- **Measured** (workers ledger `~/workers/gh/gh-calls.tsv`, 2026-10-11T15:15:00Z..16:15:00Z; the first tick on agent-org v0.158.1 was 15:15Z, after agent-org#984 merged at 15:14:08Z): 6,333 calls; 1,040 `pr|issue|label list` calls, every one exit 0 (821 from `work-gate.ts`, 152 `row-file.ts`, 12 `watch.ts`, 6 `pr-open.ts`, 3 `merge-guard.ts`, 2 `worker-stop-hook.ts`, the rest from shell and node one-liners); 0 calls whose argv names `search`; 0 tick-journal lines matching `rate limit`, `403` or `secondary`.
- **Before** (the row's figure, not re-read: the ledger now starts at 15:00:35Z, its 2 MiB bound having trimmed 14:00): 1,620 such calls at 14:00Z, 889 from `work-gate.ts`.
- **Inferred, and said so:** the 273 failed `api -i` calls from `work-tick.ts` in the same hour do not name their endpoint in the ledger, which keeps only two argv words. They are read as the conditional REST probes in `src/tick-snapshot.ts` (`repos/<repo>/issues`, `actions/runs`), whose 304 and 404 answers exit non-zero. Neither path is a search endpoint.

Acceptance: bash -c 'grep -qF "\"scheduler\": { \"mode\": \"github-apps\"" .agent-org/host.json'

Closes #5073
