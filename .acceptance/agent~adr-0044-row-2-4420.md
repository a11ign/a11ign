ADR 0044 row 2. `reusable-acceptance.yml` now reads the commands from the checkout, through agent-org's declared `acceptance-commands` and `acceptance-file` exports (released in v0.100.0; the job clones the newest stable tag, v0.102.2 today, so the floor is the export itself and a tool without it fails the live-body step loudly). The live-body step keeps its token and, for a pull request that ADDS an acceptance file, hands on only the `Closes` declaration (narrowed with the tool's own parse, line by line, and the job fails if the narrowed text does not parse to the same declaration as the whole body). The full-history step reads its declaration from the same file the commands come from.

**One deliberate departure from the row's wording.** A pull request that adds NO acceptance file still has its whole body handed on. ADR 0044 keeps the body fallback until row 3 ends it on a count, and Dependabot pull requests have their `Acceptance:` written into the body by `dependency-pr-body.yml`; narrowing those would make every one `ACCEPTANCE: MISSING`. The tool prints `ACCEPTANCE-SOURCE: body (deprecated)` for them.

**Left open, for agent-org / row 3:** the tool's `measured` report reads the body, not the file, so for a pull request with a file `## Measured` now reads `NOT DECLARED` in CI and a malformed section no longer fails. Measured by running v0.102.2, below.

platform: this is a workflow and its guard, so no platform feature applies; the pin is the tool's own `exports` map, which already refuses a name it does not declare.

Acceptance:
```bash
node -e 'const s=require("fs").readFileSync(".github/workflows/reusable-acceptance.yml","utf8"); if(/acceptance-commands\.(mjs|ts)/.test(s)) process.exit(1); console.log("no src/ path")'
```

Mutation: in `acceptance-supplies-row-labels.test.ts`'s workflow, each restored by `cp` from a copy and `diff`ed identical: (1) the narrowing never fires (`if (true) return`): 3 tests fail (the narrowed-output test, its no-`Closes` twin, the wiring test), the no-file control passes; (2) it always fires (the early return removed): only the no-file control fails; (3) the last step's `PR_BODY` points back at the event body: only the wiring test fails. Clean: 19 of 19 pass.

## Evidence

Real tool at v0.102.2, the live-body step's own `run:` and the last step's `run:` executed in a scratch repo whose HEAD is a merge commit, with a fake `gh`; the body is prose, a `node -e "console.log(7)"` Acceptance and the Closes line:

```
with .acceptance/agent~x-1.md added (the file runs `console.log(41+1)`):
42
ACCEPTANCE-SOURCE: file .acceptance/agent~x-1.md
ACCEPTANCE: RAN node -e "console.log(41+1)" -> pass (exit 0)
CLOSES: #4420
with no file (the deprecated fallback):
7
ACCEPTANCE-SOURCE: body (deprecated)
ACCEPTANCE: RAN node -e "console.log(7)" -> pass (exit 0)
CLOSES: #4420
```

In the first case the step output was the one Closes line and nothing else. Not run here: the hand-run of editing a green PR's body (it needs this PR green first; pasted on the row after).

Closes #4420
