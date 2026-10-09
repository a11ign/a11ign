## What

`docs/try-it.md` item 3 under `## What sign-in covers` no longer says "no document exists yet". It links `docs/outcomes/outcome-11-playwright-suite.md`, keeps "This route is not built", and states the document's finding: a session held only in page memory is not carried by a storage state and ends `auth-state-expired`.

Acceptance: bash -c '! grep -q "no document exists yet" docs/try-it.md && grep -q "outcome-11-playwright-suite" docs/try-it.md && grep -q "not built" docs/try-it.md && grep "^3\. \*\*Assess the page your own Playwright" docs/try-it.md | grep -q "This route is not built" && grep "^3\. \*\*Assess the page your own Playwright" docs/try-it.md | grep -q "outcome-11-playwright-suite" && grep "^3\. \*\*Assess the page your own Playwright" docs/try-it.md | grep -q "held only in page memory is not carried by a storage state"'

Closes #4677

🤖 Generated with [Claude Code](https://claude.com/claude-code)
