## What

`docs/adr/0047-an-nvda-faithful-announcement-emulator-is-a-separate-repository-and-its-predictions-are-advisory.md`: the ADR for the announcement-emulator layer, listed in `docs/adr/README.md`. It states the chairman's decision from #928 (seven layers, predictions advisory, own GPL-3.0 repository used only through its published package, outcomes 10 and 11 superseded for this layer only, ARIA-AT for measurement only, rate published, the spike's 98% gate), tests it against ADRs 0021, 0032, 0045 and outcomes 10 and 11 read at the text, marks every number measured, quoted or not checked, and answers the trademark question: logos are registered marks, no policy on the word "NVDA" was found.

Not done here: no repository is created and no code written; sending NV Access a question is left to `ceo`.

platform: checked nvaccess.org and the nvaccess/nvda repository for a naming policy; none found.

Acceptance: git grep -q "^## Alternatives rejected" -- 'docs/adr/0047-*.md'

Closes #5659

🤖 Generated with [Claude Code](https://claude.com/claude-code)
