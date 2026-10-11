`.agent-org/host.json` names each role's GitHub App slug under `github.identity`, so `host/gh` can answer `gh api user` for an App role without calling GitHub. The three slugs equal what `GET /apps/<slug>` answers for the `appId` beside each (scheduler 5267089, workers 5267128, managers 5267143). The reader ignores a key it does not know, so this lands with or without agent-org#791.

Acceptance: node -e 'const i=JSON.parse(require("fs").readFileSync(".agent-org/host.json","utf8")).github.identity; for (const r of ["scheduler","workers","managers"]) if (i[r].slug !== "a11ign-"+r) { console.error(r, "slug:", i[r].slug); process.exit(1) }' exits 0.

Closes #4926

Companion to a11ign/agent-org#791.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
