ADR 0044 row 3, the wording half (#4422). The pull request template, the engineer brief and the reviewer brief now say the Acceptance lives in a file the PR adds under `.acceptance/` (the branch with `/` as `~`), that the body keeps `Closes` and one pointer line, and that a body `Acceptance:` block is the deprecated fallback; the reviewer brief says to read the file in the diff, not the body. `docs/adr/README.md` gains the `[0044]` row before `[0045]`.

Not done here, by the row's own Done-when: `CLAUDE.md` (`ceo`'s one-line edit; the line wanted is "a PR's Acceptance lives in a file it adds under `.acceptance/` (ADR 0044), not in its body"), and the sweep, the tree-wide guard coverage and the fallback removal (#4570).

Acceptance:
```bash
bash -c 'test -z "$(grep -L "\.acceptance/" .github/PULL_REQUEST_TEMPLATE.md .agent-org/roles/engineer.md .agent-org/roles/reviewer.md)"'
bash -c 'grep -q "^| \[0044\]" docs/adr/README.md'
bash -c 'test "$(grep -n "^| \[00\(44\|45\)\]" docs/adr/README.md | cut -d: -f2 | cut -c1-8 | head -1)" = "| [0044]"'
```

Mutation: none -- wording and an index row; the first Acceptance line is its own control (it printed the three file names against the tree before this change).

Closes #4422
