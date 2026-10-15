The unit comment's "Until the lab's script stands alone this unit fails at the line above" is replaced by what the lab's PR a11ign/lab#127 makes true: both scripts import only `node:` modules and each other.

Closes a11ign/a11ign#5501

Acceptance: `node -e "const s=require('fs').readFileSync('.agent-org/units/a11ign-corpus-release-nightly.service','utf8');if(s.includes('fails at the line above')||!s.includes('A11Y_CONTROL_DIR'))process.exit(1);console.log('UNIT-NAMES-CONTROL-DIR')"` -- the host load is the row's own Done-when 1, read after a11ign/lab#127 merges.

Outside-Region: none.

Waits-on: a11ign/lab#127 — merge it and `agent-org primary:update` before the Acceptance prints LOADS; Done-when 2 (a firing writing a release) also needs the follow-up row for the `packages/control/ansible/lab-fetch.yml` path, which the core no longer holds.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
