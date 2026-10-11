## What

`.agent-org/roles/ceo.md`: the retrospective's bounds table gets a row for `idleClaimedHours`, the daily worker-hours idle on a claimed row with no declaration (a11ign#4957). Without it `org-retro.test.ts` in agent-org fails on the new number, and the row cannot land green.

Bound: above 5 worker-hours a day. The starting figure, about 60, is the chairman's count from #4957 and is labelled as not a retro reading.

Acceptance: node -e 'const t=require("fs").readFileSync(".agent-org/roles/ceo.md","utf8");const s=t.slice(t.indexOf("The daily retrospective"));const i=s.indexOf("`idleClaimedHours`");if(i<0||!/above 5 worker-hours/.test(s.slice(i,i+300)))process.exit(1)'

Closes #4960

🤖 Generated with [Claude Code](https://claude.com/claude-code)
