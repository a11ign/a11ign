The consumer gate's step *npx a11ign <url>, from the clean install* (`.github/workflows/registry-consumer-gate.yml`) looks for the worker's script as `dist/server.mjs` first and `src/server.mjs` second, in each of the two package directories (`screenreader-worker`, then the old-name `nvda-worker`). `@a11ign/screenreader-worker` 0.13.0 publishes `dist` and `launcher` and no `src/`; the published `a11ign@latest` (0.10.2 -> fleet 0.9.0 -> worker 0.9.0, from #5315's `npm view` reading of 2026-10-12, not re-measured here) still has `src/server.mjs`, so the gate stays green against `latest` and against a tree carrying 0.13.0.

The Acceptance runs the row's own literal check, THEN extracts the step's lookup block from the workflow (from `server=""` to the `if [ -z` that follows it) and `eval`s it in four scratch layouts, so it reads the lookup's behaviour, not a string that also sits in a comment and in the error message:

- **new** (`screenreader-worker/dist/server.mjs` only, the 0.13.0 shape) -> that path: the positive control for `dist`.
- **old** (`nvda-worker/src/server.mjs` only, the `latest` shape) -> that path: the fallback control.
- **both** (`dist` and `src` in one directory) -> the `dist` one: the order.
- **none** (empty `@a11ign`) -> `NONE`, which is what sends the step to its `::error::`.

Mutation (measured at this head, the workflow file copied aside and restored byte-identical with `diff`): the Acceptance exits 0 on the edited file; exits 1 with the loop reduced to `for f in src/server.mjs` (the reviewer's mutation, which the literal grep alone missed); exits 1 with the two names swapped (`src` first); exits 1 with the `src` fallback dropped; exits 1 against `HEAD~1`'s version of the file (before this change).

Measured: `git grep -c 'dist/server.mjs'` on the file is 0 at `HEAD~1` and 3 at this head (the explanatory comment, the loop, the error message), which is why the literal check alone is not the proof.

Not measured: a run of the workflow (it installs from the registry on a runner); CI's first run of the gate after this merges is the live reading.

Acceptance: bash -c 'git grep -q "dist/server.mjs" -- .github/workflows/registry-consumer-gate.yml && blk=$(awk "/^ +server=.{2}\$/{on=1} /if \[ -z/{on=0} on" .github/workflows/registry-consumer-gate.yml) && [ -n "$blk" ] && t=$(mktemp -d) && W=node_modules/@a11ign && mkdir -p $t/new/$W/screenreader-worker/dist $t/old/$W/nvda-worker/src $t/both/$W/screenreader-worker/dist $t/both/$W/screenreader-worker/src $t/none/$W && touch $t/new/$W/screenreader-worker/dist/server.mjs $t/old/$W/nvda-worker/src/server.mjs $t/both/$W/screenreader-worker/dist/server.mjs $t/both/$W/screenreader-worker/src/server.mjs && run() { (cd $t/$1 && eval "$blk" && echo "${server:-NONE}"); } && [ "$(run new)" = $W/screenreader-worker/dist/server.mjs ] && [ "$(run old)" = $W/nvda-worker/src/server.mjs ] && [ "$(run both)" = $W/screenreader-worker/dist/server.mjs ] && [ "$(run none)" = NONE ]'

Closes #5317
