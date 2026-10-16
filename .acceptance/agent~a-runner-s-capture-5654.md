Adds `## Target: a runner's capture time` to `docs/capture-cost.md`, above `## What this does not show`. It sets two targets against the runner reading already in the document (action-smoke run `38797684887`, protocol 24, n=1 per command): `survey.html` with the defaults ≤150 s from 205.4 s, and `probe-forms: "true"` ≤220 s from 327.9 s. It names the costliest phases with their seconds, and shows the arithmetic: the Tab walk alone gives 158.0 s (misses), the three focus probes together give 123.3 s (meets, and turn off the 2.1.2, 3.2.1 and 1.4.13 reads). The probe-forms target is labelled a projection (219.3 s, from run 3's formField). It states that a saving counted from one phase's seconds is an upper bound until a probe-off run is read, and that the target is not a second-run reading.

Each lever is a filed row: A is agent-org#1643 (the probe-forms sweep), B is agent-org#1644 (`MAX_SWEEP_STEPS`, which binds on neither target command), C is agent-org#1645 (the fixed probes and the Tab-walk budget). Each row carries its own Region and recapture plan. No `### Lever` heading is added here; the recapture adds it with the reading.

**Measured at this head:** the Acceptance command exits 0 (`git grep -q "^## Target: a runner's capture time" -- docs/capture-cost.md`).

Acceptance: git grep -q "^## Target: a runner's capture time" -- docs/capture-cost.md

Closes #5654
