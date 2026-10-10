`.github/workflows/reusable-acceptance.yml`: the two steps that run the reader now set `PR_AUTHOR: ${{ github.event.pull_request.user.login }}` in their `env:`, beside `PR_BODY` — "Deepen the checkout if the PR asks for full history (#497)" (calls `acceptanceSourceOfThisPullRequest`) and "Run the PR's own stated Acceptance command(s)" (runs `agent-org acceptance-commands`). The live-body step keeps its own copy. It is `env:` data from the event, never interpolated into a `run:` script and never read from the body; it is a login, not a credential, so the "no secret reaches the command step" rule stands. Nothing else in the file changed.

- **Mutation:** the Acceptance run against `HEAD` before this change finds the string 1 time and exits 1; against the changed file it finds it 3 times and exits 0. The file still parses as YAML (`python3 -c "import yaml; yaml.safe_load(open(...))"`).
- **Not measured here:** the PR's own `acceptance` job result is quoted on the pull request after CI runs; an extra variable changes no verdict.

platform: nothing built; two `env:` lines.

Acceptance: bash -c '[ "$(grep -cF "PR_AUTHOR: \${{ github.event.pull_request.user.login }}" .github/workflows/reusable-acceptance.yml)" -ge 3 ]'

Closes #4834

🤖 Generated with [Claude Code](https://claude.com/claude-code)
