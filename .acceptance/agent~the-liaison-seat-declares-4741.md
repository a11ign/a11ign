The `liaison` entry in `.agent-org/roles/sessions.json` now declares `"model": "claude-haiku-5-5"`, `"effort": "high"` and `"autocompact": 130000` (the Haiku window, trigger at 95,000), so the live switch to Haiku 5.5 survives a restart. No other seat is touched, and `_rolesNotProcesses` says the three are ROLE facts like `spare`, naming no pane, pid or workspace, with the revert (remove the seat's `model`).

Measured: the Acceptance command below exits 0 on this branch, and `grep -c '"model"' .agent-org/roles/sessions.json` reads 1 (the open-check read 0 on 2026-10-10). Done-when 2, the `SEAT STARTED liaison` quote, needs the tool row's release and is not claimed here.

`pnpm run verify` (with `--draft-body`) printed `GREEN for this head and body -- the affected set passed at this head, affected against origin/main; the tree-wide guards run in CI only`. `ts`, `python`, `rulesFitness` and `changeset` read NOT-NEEDED for this diff, so lint and typecheck were not exercised on anything; the diff is one JSON file plus this one. `git grep` finds no code that reads the roster beyond `scripts/rstest/rstest.config.ts`'s trigger glob and `.agent-org/project.json`.

platform: nothing to replace; a roster field read by the seat launcher once agent-org's row lands.

Acceptance:
```bash
node -e 'const s=JSON.parse(require("fs").readFileSync(".agent-org/roles/sessions.json","utf8")).live.find(e=>e.name==="liaison"); if(s.model!=="claude-haiku-5-5"||s.effort!=="high"||!(s.autocompact>0&&s.autocompact<=130000)) process.exit(1)'
```

Closes: none — done-when 2 (the restart quoted on a11ign#4627 as `SEAT STARTED liaison` reading Haiku 5.5 high) waits on the tool row's release.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
