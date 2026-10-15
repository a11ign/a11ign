The conditional trace-map reads, one week after #4097 (a11ign/agent-org#382), are read from the trace store and posted beside the week before.

- **The reading is on #4055**, beside the BEFORE figures: https://github.com/a11ign/a11ign/issues/4055#issuecomment-6191027877 (per UTC day, by `api -i`, `api -H`, per-URL `api` and `api -X`; the merge day is split at 14:21:11Z).
- **The one line of `docs/backlog.md`** names the reading and the measured `api -H` share (58.5% of 111,551 calls from the merge to the store's last record, 2026-10-15T11:14Z).
- **Not claimed:** the 10-15 day is partial, and the window's end (14:21Z on 10-15) is later than the store's last record; the 2026-10-07 BEFORE figure does not reproduce from the store (18,267 against the recorded 20,035).

Acceptance: grep -c '4097' docs/backlog.md
