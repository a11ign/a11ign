`.agent-org/failure-classes.json`'s `claimed-worker-stalled` `guardNote` gains one sentence naming the body-only `Waiting-for:` gap: a `ready` row whose only wait is a body `Waiting-for:` line (no `blockedBy` edge, no `answer:` label, not `parked`) is not excused by a11ign/agent-org#597, so it is still OFFERED, claimed and nudged again with nothing to build (a11ign#5156, three claims), and the fix is `partitionUnclaimed` reading body waits (a11ign/agent-org#1075), with a native edge or `parked` as the remedy until that merges. `guard` and `seed` are unchanged; the other 22 classes are unchanged.

- **Measured before** (`HEAD`): the Acceptance predicate, run against `git show HEAD:.agent-org/failure-classes.json`, exits 1.
- **Measured after** (this branch): the same predicate against the edited file exits 0, and the file parses as JSON with 23 classes.
- **Not claimed:** the offer-pool repair itself is agent-org's (a11ign/agent-org#1075) and is not made here. No code in this repo reads the registry; the Acceptance is the check.

Acceptance: python3 -I -c 'import json,sys; c=[c for c in json.load(open(".agent-org/failure-classes.json"))["classes"] if c["id"]=="claimed-worker-stalled"][0]; n=c["guardNote"]; sys.exit(0 if ("body" in n and "Waiting-for" in n and "OFFERED" in n and "#5156" in n) else 1)'

Mutation: the same predicate run against `HEAD:.agent-org/failure-classes.json` exits 1; against the edited file it exits 0. Run against `HEAD` it fails, so it bites on the text that was there before.

Closes #5161
