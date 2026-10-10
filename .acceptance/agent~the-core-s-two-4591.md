## What

`packages/guards/src/bootstrap-copies-gate-match-toolchain.test.ts`: after install, compares the core's two bootstrap copies `isolation-gate` (`packages/guards/src/isolation-gate.ts`) and `ci-changed` (`scripts/ci-changed.ts`) with `@a11ign/toolchain/lib/<stem>` at the pinned 0.7.0. Exported names are the same set (and each has a probe), and each function returns the same value over a table of inputs, run against a throwaway git repository that both sides resolve to. Positive control: a copy with the caret's `0.x` narrowing dropped (and one with the `dist/` prefix match dropped) is reported; a copy altered only in a comment is not.

Measured: the Acceptance command prints `VERDICT pass: 6 tests in 1 file` at this head; `pnpm run lint` 0 errors. With the `dist/` prefix match removed from the real `scripts/ci-changed.ts`, the `ci-changed` parity test fails (run under `node --test`; file restored byte-identical, `diff` empty). Not run: `pnpm run verify` and `typecheck`.

Mutation: removed `if (!c.endsWith(".")) return false;` from `reachesPacked` in `scripts/ci-changed.ts` -> `scripts/ci-changed.ts behaves like ...` went red; restored, green. Control direction two: a copy altered only in a comment is reported as no drift (the positive-control tests).

platform: checked pnpm/node: nothing compares two modules' behaviour; siblings #4707 and #4719 are the pattern.

Acceptance: npx rstest run --config scripts/rstest/rstest.config.* packages/guards/src/bootstrap-copies-gate-match-toolchain.test.ts

Closes #4591
