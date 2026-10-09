Writes up `ceo`'s ruling of the ticket port's interface ([#4505 comment](https://github.com/a11ign/a11ign/issues/4505#issuecomment-6082710487)) as ADR 0046, section for section, and adds its line to the ADR index. No decision of the author's own; no code changes.

platform: this is a decision record, so no platform feature applies.

Acceptance:
```bash
node -e 'const fs=require("fs");const f=fs.readdirSync("docs/adr").find(n=>/^0046-/.test(n));if(!f){console.log("no 0046");process.exit(1)}const t=fs.readFileSync("docs/adr/"+f,"utf8");const need=["## Status","read an item","post a decision","change state","subscribe","code host","Linear"];const miss=need.filter(w=>!t.includes(w));if(miss.length){console.log("missing",miss.join(","));process.exit(1)}if(!/\*\*Accepted/.test(t)){console.log("not Accepted");process.exit(1)}console.log("ok")'
```
## Evidence

The command above printed `ok` at 1c1206f37.

Not run locally: `pnpm run verify` (the fresh worktree has no `node_modules`; the change is two markdown files under `docs/adr/`). CI's `gate` is the check.

Closes #4510

🤖 Generated with [Claude Code](https://claude.com/claude-code)
