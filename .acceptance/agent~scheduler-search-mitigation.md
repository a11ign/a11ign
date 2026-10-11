Sets `github.identity.scheduler` to `user-accounts` in `.agent-org/host.json` while #5039 is open, because the scheduler App's search allowance is exhausted and every label-filtered `gh issue list` is refused. Workers and managers keep their Apps; #5039 reverts this.

**Measured at this head:** the command below exits 0 on this tree and exits 1 on `main` (`mode` is `github-apps` there).

Acceptance: bash -c 'node -e "const j=JSON.parse(require(\"fs\").readFileSync(\".agent-org/host.json\",\"utf8\"));process.exit(j.github.identity.scheduler.mode===\"user-accounts\"?0:1)"'

Closes #5040
