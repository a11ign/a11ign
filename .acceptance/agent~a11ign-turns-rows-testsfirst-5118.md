`.agent-org/project.json` carries `"rows": { "testsFirst": true }` with a `_rows` prose key naming #5109, what the flag does, and the revert (set it to `false`). The key is read by agent-org (a11ign/agent-org#1007); until that release is the host's tool, the key is ignored, so landing it early is safe.

Acceptance: node -e "process.exit(JSON.parse(require('fs').readFileSync('.agent-org/project.json','utf8')).rows?.testsFirst===true?0:1)"

Closes #5118
