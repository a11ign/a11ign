---
"a11ign": patch
---

Every input of the Action is now passed to its scripts through the environment (`env:`) and none is interpolated into a `run:` script with `${{ inputs.* }}`. `task`, `forms`, `judge-backend`, `anthropic-api-key`, `judge-base-url`, `probe-forms`, `probe-focus`, `probe-navigation`, `axe` and `fail-on` were still expanded into shell text, GitHub's documented script-injection pattern: a `task` filled from an issue title or a pull-request body could close its quote and run commands on the runner. A test now fails on any `${{ inputs.* }}` inside a `run:` script (#4238).
