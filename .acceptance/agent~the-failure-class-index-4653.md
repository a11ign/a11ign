## What

The `owner-unresolved` entry in `.agent-org/failure-classes.json` read `"guard": null`, so the index said the class was never in force. It now names the two rungs that stop it (`isDependencyBotPr`, a11ign/agent-org#542, and `owner-gone`, a11ign/agent-org#548) and the test pinning the second (`src/packaging/pr-owner-gone.test.ts` in agent-org). The `guardNote` now says what is still uncovered: a pull request with no label whose branch names no row still falls to the `ceo` rung and is recorded. `seed` and every other class are untouched.

platform: none needed; a one-entry data edit.

Acceptance:

```bash
node -e 'const c=JSON.parse(require("fs").readFileSync(".agent-org/failure-classes.json","utf8")).classes.find((x)=>x.id==="owner-unresolved");if(typeof c.guard!=="string"||!c.guard.includes("owner-gone")||!c.guard.includes("pr-owner-gone.test.ts"))process.exit(1)'
```

Mutation: on `main` the entry's `guard` is `null` and the command exits 1; after the edit it exits 0 (measured). Reverting `guard` to `null` is the only way it fails, and no other class is read.

Closes #4653

🤖 Generated with [Claude Code](https://claude.com/claude-code)
