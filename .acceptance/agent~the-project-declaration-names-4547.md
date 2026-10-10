## What

`.agent-org/project.json`: the `a11ign/a11ign` entry of `dora` gains `"adopterDocs": ["README.md", "RELEASE.md", "docs/try-it.md", "docs/known-gaps.md"]`, the paths an outside adopter reads that ship no code. The pinned agent-org tool reads the key (`readAdopterDocs` in `src/project-config.ts`, shipped by a11ign/agent-org#616, which closes agent-org#506; the tool checkout is at `v0.132.0`). `releasablePaths` is left as it was: the ruling (a11ign/a11ign#4084) is that widening it would make every README edit owe a changeset. No other key and no other entry changes.

Measured: the pinned reader, run on the edited file, returns the `a11ign/a11ign` entry with `adopterDocs` and no refusal. `pnpm exec tsx --test packages/guards/src/dora-declaration.test.ts` passes 18 of 18. The key is absent at `origin/main` (open-check on the row).

platform: checked agent-org's own declaration reader (`src/project-config.ts`); nothing built here.

Acceptance: bash -c 'jq -e ".dora[] | select(.repo == \"a11ign/a11ign\") | .adopterDocs == [\"README.md\",\"RELEASE.md\",\"docs/try-it.md\",\"docs/known-gaps.md\"]" .agent-org/project.json && jq -e ".dora[] | select(.repo == \"a11ign/a11ign\") | .releasablePaths == [\"packages/cli/\",\"packages/evidence/\",\"packages/judge/\",\"packages/scorer/\",\"docs/unfamiliar-ui-findings.md\"]" .agent-org/project.json'

Closes #4547

🤖 Generated with [Claude Code](https://claude.com/claude-code)
