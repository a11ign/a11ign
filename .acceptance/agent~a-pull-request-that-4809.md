`.github/workflows/reusable-acceptance.yml`'s `live-body` step keeps a line that begins `Class:` (the prefix the tool's own `CLASS_LINE` reads: an indent, a list marker or bold, then `Class:`) as well as the `Closes` lines when the pull request adds an acceptance file. The check under it (the narrowed text must parse to the same `Closes` declaration as the whole body) is unchanged, and a pull request that adds no file still keeps its whole body.

- **Measured before** (`origin/main`): the new test cannot run there (the file does not exist), and with the filter put back to `Closes` lines only on this branch, `node --test packages/guards/src/acceptance-keeps-class-line.test.ts` prints `fail 2`: `a body with a Closes line and a Class: line … hands on BOTH lines` and `the line is recognised the way the tool's own Class: reader begins one`.
- **Measured after** (this branch): the same command prints `pass 7`, `fail 0`.
- **Mutation, other direction:** with the filter made to keep every line, it prints `fail 5` (the control, both narrowing twins, the prefix case and the split-declaration case); with the narrowing check replaced by `if (false)`, only `the narrowing check still exits 1 for a Closes declaration split across lines` fails. Each restore was diffed byte-identical.
- **Not claimed:** the agent-org half (reading the `class` report from the acceptance file as `mutation` does) is not this row. The prefix is a copy of the tool's `CLASS_LINE` because `defect-class-line` is not a declared export of `agent-org`; if it were, the workflow would import it and this copy would go.

Acceptance: node packages/guards/src/assert-glob-not-empty.ts "packages/guards/src/acceptance-keeps-class-line.test.ts" --min=1 --run

Closes #4809
