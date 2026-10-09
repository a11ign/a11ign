## What

`docs/outcomes/outcome-11-playwright-suite.md`: the decision document for #4084 outcome 11. It states, with file and line, what a Playwright `test` can hand a11ign today (the page's URL, a storage-state file through `--auth-state`, its own axe result through `--axe-results`), what it cannot (a DOM or accessibility tree: the request carries only a URL), and whether the screen-reader capture can use it (only where the suite and the worker are one Windows machine: the wire carries a path, and a remote worker refuses any authenticated run).

Decision: build one thin TypeScript fixture as an example file (one pull request), the Python twin after it, no DOM/AX-tree hand-off and no published package yet. Main finding, stated first in the document: a session kept in page memory (the evaluator's own SDK, per the attach spike) is not carried by a storage state and ends `auth-state-expired`, so this outcome does not serve that app; the test-account login row does.

Measured: a one-step `expect:` login flow parses with the repository's own `parseFlowsFile` and `resolveLoginFlow` at `b260eb84b`; PR sizes and intervals for #2631 and #4645 from `gh api`. Inferred and labelled so: the one-pull-request-each estimates. Read: the 8 to 10 minute Windows figure from `docs/capture-cost.md`.

platform: checked Playwright's own `storageState` / `storage_state` (the file the CLI already reads); nothing built.

Acceptance: bash -c 'test -s docs/outcomes/outcome-11-playwright-suite.md && grep -q "^## What it covers" docs/outcomes/outcome-11-playwright-suite.md && grep -q "^## What it would cost" docs/outcomes/outcome-11-playwright-suite.md && grep -q "^## First row" docs/outcomes/outcome-11-playwright-suite.md'

Closes #4532

🤖 Generated with [Claude Code](https://claude.com/claude-code)
