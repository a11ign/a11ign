The unit comment's "Until the lab's script stands alone this unit fails at the line above" is replaced by what the lab's PR a11ign/lab#127 makes true: both scripts import only `node:` modules and each other.

Closes a11ign/a11ign#5501

Acceptance: `node -e "import('/home/agent/repos/wt-5501-lab/scripts/corpus-release-nightly.ts').then(() => console.log('LOADS'))"` -- the row's own command, against the lab PR's worktree until a11ign/lab#127 merges; after it merges and `agent-org primary:update` runs, the path is `/home/agent/repos/lab/scripts/corpus-release-nightly.ts`.

Outside-Region: none.

Waits-on: a11ign/lab#127 — merge it and `agent-org primary:update` before the Acceptance prints LOADS; Done-when 2 (a firing writing a release) also needs the follow-up row for the `packages/control/ansible/lab-fetch.yml` path, which the core no longer holds.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
