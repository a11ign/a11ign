`.agent-org/decisions.json` carries `"routing.haikuDefault": true`, and `.agent-org/project.json` carries `"rows": { "specWriter": true, "specLint": true }` and `"workers": { "haikuBrief": true }` (a11ign#5138, the Haiku push). Each key's own prose names what it reads. Only `routing.haikuDefault` is live on origin/main: `rows.specWriter` and `rows.specLint` have no non-test caller yet (#4505 is unwired), and `workers.haikuBrief` is read from the HOST declaration (`.agent-org/host.json`), so its key here is inert until the host declaration carries it too, which is a Region question for `product-manager`. Revert is each key set to `false`.

Acceptance: bash -c 'node -e "const p=require(\"./.agent-org/project.json\"),d=require(\"./.agent-org/decisions.json\"); if(!(p.rows.specWriter&&p.rows.specLint&&p.workers.haikuBrief&&d[\"routing.haikuDefault\"])) process.exit(1)"'

Closes #5138
