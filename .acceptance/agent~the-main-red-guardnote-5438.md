The `main-red` class's `guardNote` in `.agent-org/failure-classes.json` no longer says a standing red is counted once per run. It names what agent-org#674 made the recorder do (`mainRedEvents` in `src/failure-ledger.ts` of agent-org): one event per episode, the ref being the run that OPENED the red, a standing red continued until a green reading ends it, a DIFFERENT failed job while one stands a new event, and a reading that was not read changing nothing. The leg and repository rules in the note are kept, and the episode rule is re-read at agent-org `origin/main` 791aa07a (2026-10-13).

Acceptance: node -e "process.exit(require('fs').readFileSync('.agent-org/failure-classes.json','utf8').includes('counted once per run')?1:0)"

Mutation: the same predicate exits 1 against `HEAD:.agent-org/failure-classes.json`, where the phrase is still there (the positive control: it finds the phrase before the change), and exits 0 against the edited file. The row's own `grep -c "counted once per run"` count is 1 at HEAD and 0 after. The edited file also parses with agent-org's `parseFailureClasses` (`src/class-repeat.ts`) with all 28 classes carrying a name and a guard or a guardNote, which is the shape `src/class-repeat.test.ts` pins on the real file.

Closes #5438
