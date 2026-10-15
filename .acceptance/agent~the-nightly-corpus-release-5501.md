The unit comment's "Until the lab's script stands alone this unit fails at the line above" is replaced by what the lab's PR a11ign/lab#127 makes true: both scripts import only `node:` modules and each other.

Closes a11ign/a11ign#5501

Acceptance: `node -e "const s=require('fs').readFileSync('.agent-org/units/a11ign-corpus-release-nightly.service','utf8');if(s.includes('fails at the line above')||!/^Environment=A11Y_CONTROL_DIR=%h\/repos\/control$/m.test(s))process.exit(1);console.log('UNIT-DECLARES-CONTROL-DIR')"`

Outside-Region: none.

Waits-on: a11ign/lab#127. Host readings (the lab load, a firing) are a11ign/a11ign#5509.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
