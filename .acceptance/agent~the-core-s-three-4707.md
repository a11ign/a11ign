## What

`packages/guards/src/bootstrap-copies-match-toolchain.test.ts`: after install, compares each of the core's three bootstrap copies (`scripts/cli-flags.ts`, `packages/guards/src/git-env.ts`, `scripts/npm-cli-executable.ts`) with `@a11ign/toolchain/lib/<stem>` at the pinned 0.7.0. The exported names must be the same set and every exported function returns the same value (or throws the same message) over a table of inputs: flag parser on accepted and refused argv, `sandboxGitEnv` on a fixed environment, the npm/pnpm resolvers on fixed PATHs. It also asserts the installed toolchain is the pinned version. Positive control per stem: an altered copy (extra export, changed behaviour) must be reported and a copy altered to match must report nothing.

Mutation, measured (original restored byte-identical, `diff` clean): `git-env.ts` prefix `GIT_` to `GITX_` goes red on `sandboxGitEnv` probes; `npm-cli-executable.ts` `"npm"` to `"npmx"` in the fixed candidate goes red on `npmCliScriptCandidates`/`resolveNpmCliScript`; `cli-flags.ts` `NEAR` 4 to 1 and 4 to 9 each go red on the `didYouMean` boundary probes (the first run survived at NEAR=1, so two boundary probes were added).

platform: checked `@a11ign/toolchain`'s own `lib/*` exports (the thing compared against); nothing built.

Acceptance: npx rstest run --config scripts/rstest/rstest.config.ts packages/guards/src/bootstrap-copies-match-toolchain.test.ts

Closes #4707
