`.agent-org/project.json` `rows` carries `"autoUnpark": true`, which turns on agent-org#1118's un-park pass for every declared tracker (a11ign#5177). Revert: set it to `false`.

Acceptance: node -e "process.exit(JSON.parse(require('fs').readFileSync('.agent-org/project.json','utf8')).rows?.autoUnpark===true?0:1)"

Closes #5194
