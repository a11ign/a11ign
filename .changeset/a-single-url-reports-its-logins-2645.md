---
"a11ign": patch
---

**A single-URL authenticated run reports the logins it performed, in the shape a page list does (#2645, #2561 finding a).** The run stated a login floor before it started, counted a tally the whole way and dropped it: only `runPages` built the report, so the floor could not be compared with what the run did, which is the very lockout risk the docs ask a reader to weigh. `--json` now carries `logins` (`performed`, `workerAttempts`, `ruleLayerScans`, `minimum`) on the result (on the LAST result when a forms config runs several states, the tally being cumulative), and a run with no JSON result, or one that threw after logging in, says the list's `Logins: N performed …` line on stderr, beside the notice that stated the minimum. An unauthenticated run reports nothing, and a list's report is unchanged. Not decided here: whether a single URL should state a minutes estimate.
