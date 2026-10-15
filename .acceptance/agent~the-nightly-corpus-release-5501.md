The unit comment's "Until the lab's script stands alone this unit fails at the line above" is replaced by what the lab's PR a11ign/lab#127 makes true: both scripts import only `node:` modules and each other.

Closes a11ign/a11ign#5501

Acceptance: `node -e "const s=require('fs').readFileSync('.agent-org/units/a11ign-corpus-release-nightly.service','utf8');if(s.includes('fails at the line above')||!s.includes('refuse-unknown-flags.ts'))process.exit(1);console.log('COMMENT-UPDATED')"` -- the unit comment no longer says the unit fails at its load check and names the dependency-free guard. The load itself (importing `/home/agent/repos/lab/scripts/corpus-release-nightly.ts` and printing `LOADS`) needs the host, not CI: it printed `LOADS` from `/home/agent/repos/wt-5501-lab`, and is the verify row's reading once a11ign/lab#127 merges.

Outside-Region: none.

Waits-on: a11ign/lab#127 — merge it and `agent-org primary:update` before the Acceptance prints LOADS; Done-when 2 (a firing writing a release) also needs the follow-up row for the `packages/control/ansible/lab-fetch.yml` path, which the core no longer holds.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
