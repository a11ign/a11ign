---
"@a11ign/control": patch
---

**The fleet watch records when a worker's captures last rose (#2979, found by #2937).** `/health` `captures` is a count since the worker booted, with no time on it, so the gate could not ask whether the fleet was idle. `fleet-watch.mjs` now persists `runs/fleet-captures-state.json` from the poll it already makes (no ssh, no model): per worker the last count, when it was seen, when it last rose, and each rise in the last 24 h. `readCaptureTimes` answers `{ captures24h, lastCaptureAt, observedSince }` for the fleet. A falling count is a restart (a new baseline, no capture), an unreachable worker is not a reading, and a missing or corrupt file answers `null`, never zero. `observedSince` is the extra field: a zero from a ledger started a minute ago is not a day of idleness. Wiring the read into `work-gate.mjs` is its own row.
