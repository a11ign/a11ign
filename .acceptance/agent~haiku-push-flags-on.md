`.agent-org/decisions.json` carries `"routing.haikuDefault": true` (#5110). `.agent-org/project.json` carries `"rows": { "testsFirst": true, "specWriter": true, "specLint": true }` (#5116, #5117) and `"workers": { "haikuBrief": true }` (#5111). Each key is read by agent-org at main, where all four rows have merged. The edited `project.json` was checked with agent-org's own `parseProjectDeclaration` before this was opened (ACCEPTED). Revert: set the keys to `false`.

Acceptance: node -e "const fs=require('fs');const p=JSON.parse(fs.readFileSync('.agent-org/project.json','utf8')),d=JSON.parse(fs.readFileSync('.agent-org/decisions.json','utf8'));process.exit(p.rows?.specWriter===true&&p.rows?.specLint===true&&p.workers?.haikuBrief===true&&d['routing.haikuDefault']===true?0:1)"

Closes #5138
