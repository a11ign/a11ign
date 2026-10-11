## What

The tester guide and the two docs that pin the Action (`docs/try-it.md`, `docs/github-action.md`, `README.md`) pin `a11ign/a11ign` at release `0.5.3` (`15881c7c59be…`). The registry's `latest` is `0.6.6`, so the guide hands the tester a release three minors behind the one it tells them to look for. This is the recurrence of #4507 (`release-docs-drift`). The newest-tag guard from #4508 tolerates one minor of drift, so it stayed green.

Change: every pin in the three files is now the full 40-character commit of `a11ign@0.6.6` (`fd5cf437f37416098b2a4819282f575016ddf2be`), the tag named beside it. The dated registry readings are re-dated to 2026-10-11. The sentences describing what the pinned release does were re-read against the 0.6.6 tree: `packages/cli/src/auth/flows.ts`, `action.yml` and `docs/known-gaps.md` §51 are byte-identical between `15881c7c5` (0.5.3) and `fd5cf437f` (0.6.6), so those claims carry over. The `summary-md` output is in 0.6.6's `action.yml`. The CHANGELOG citation for the multi-page summary line stays at 0.5.3, where that behaviour was introduced.

platform: checked the registry's dist-tags (`npm view`) and the release tags (`git ls-remote`) before choosing the pin; nothing built.

Acceptance: bash -c 'test "$(grep -L 15881c7c59be docs/try-it.md docs/github-action.md README.md | wc -l)" = 3 && grep -Eq "a11ign/a11ign@[0-9a-f]{40}" docs/try-it.md && grep -q idp-origins docs/try-it.md'

Closes #4918

🤖 Generated with [Claude Code](https://claude.com/claude-code)
