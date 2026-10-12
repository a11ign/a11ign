## What

`packages/guards/src/consumer-gate-pin-needed.test.ts`: the live-tree test read HEAD and the branch point and went red when both were stale, with no reference to the repair that was already open. A push to `main` has HEAD = base, so the merge that staled the pin reds `main` for the 24 minutes its repair takes (run 38240397683). The sibling test in `generate-consumer-gate.test.ts` already excuses exactly that case by `regenerationInFlight`; the live-tree test now uses the same excuse through `liveTreeReading`, which still reds a stale `main` with no repair open, or a stale repair.

Two fixtures in the same file pin both directions: a stale base with a current repair open is green, with no repair it is red, and a repair that is itself stale excuses nothing.

Measured: the row's Acceptance command, 26 tests pass (24 before, 2 added). Mutation, both directions: the repair reading forced to `inFlight: false` fails the positive control; forced to `inFlight: true` fails the negative control. Each breaks only its own fixture assertion; the file was restored from a backup and diffed byte-identical.

platform: checked `regenerationInFlight` and the sibling test's excuse, which already read the repair state through `actionPinVerdict`; reused, nothing new built.

Acceptance: `pnpm exec rstest run --config=scripts/rstest/rstest.config.ts --include packages/guards/src/consumer-gate-pin-needed.test.ts`

History: full

Mutation: in `consumer-gate-pin-needed.test.ts`, the repair reading in `liveTreeReading` (`regenerationInFlight`) is replaced by a constant. Forced to `inFlight: false`, the `#5225` positive control fails and nothing else; forced to `inFlight: true`, the `#5225` negative control fails and nothing else. The file was restored from a backup and diffed byte-identical.

Measured: 26 tests pass in the file (24 before, 2 added) at this head.

Closes #5225
