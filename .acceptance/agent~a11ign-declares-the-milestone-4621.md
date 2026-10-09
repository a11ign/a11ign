Adds `offerMilestones` to `.agent-org/project.json`: the chairman's order of the milestones the gate ranks ready rows by (#4524, done-when 2). The order is v3 (10), Agent spend (11), Self-healing org (13), Manager redesign (14), Clean boundaries (12), read by agent-org's `readOfferMilestones` and used by `milestoneRank`. Nothing else in the file changes; the underscore note `_offerMilestones` sits above it, as every key in the file has one.

Open-check, taken at this head: `git show origin/main:.agent-org/project.json | grep -c offerMilestones` is 0, and no unmerged `origin/agent/*` branch adds the key.

Parse check: agent-org's `parseProjectDeclaration`, run from inside this worktree, accepts the file and returns `offerMilestones` as `["10","11","13","14","12"]` with no refusal.

Mutation check (the Acceptance is a single guard, so both directions were run on copies): reordering the list (`"11","10"`) and dropping an entry each exit 1; the file as committed exits 0. The committed file was never mutated.

Guards that read this file: `dora-declaration.test.ts` and `layer-repository-protection.test.ts` pass under `scripts/rstest/rstest.config.ts`, 70 tests, 0 failed. `pnpm run lint`: 0 errors (575 existing warnings). `pnpm run typecheck`: clean.

Not run here: the tick's first journal line (Done-when 2), which needs the host's tick to have run against this file after merge.

platform: a declared key read by agent-org's existing reader; nothing built.

Acceptance: `node -e 'const p=JSON.parse(require("fs").readFileSync(".agent-org/project.json","utf8")); process.exit(JSON.stringify(p.offerMilestones)===JSON.stringify(["10","11","13","14","12"])?0:1)'` exits 0.

Closes #4621

🤖 Generated with [Claude Code](https://claude.com/claude-code)
