The `owner-unresolved` entry of the failure-class index now names its guard: agent-org's `ownerOfPr`, with the `dependency-bot` rung added by a11ign/agent-org#542. THIS PULL REQUEST WAITS ON THAT ONE: a guard that is open is a `guardNote`, never a `guard` (the index's own rule), so it must not merge before agent-org#542 does.

**(a) Why #4470, #4471 and #4472 escaped #4386:** #4386 (closed 07:39Z) made the ladder read a pull request's own `session:` label, a stated row, or its `agent/<slug>-<n>` branch. Those are facts a SESSION leaves. The three are Dependabot pull requests opened 08:44Z (author `app/dependabot`, branch `dependabot/npm_and_yarn/axe-core-4.14.0`, labels `dependencies` and `javascript`, no row), so every rung was blind to them and the last one answered.

**(b) The run** (agent-org#542, `src/packaging/pr-owner-dependency-bot.test.ts`, the #4470 shape): `ownerOfPr` returns `{ session: "ceo", source: "dependency-bot" }` and `unresolvedOwnerEvents` returns `[]`. Mutation, `pr-orders.ts` restored byte-identical each time: the rung made never to fire fails 2 of 5 tests (the ladder says `ceo` / `ceo` rung and the event is recorded again); made always fire fails the positive control (a person's pull request is no longer recorded).

Acceptance: `node -e "const c=JSON.parse(require('node:fs').readFileSync('.agent-org/failure-classes.json','utf8')).classes.find((c)=>c.id==='owner-unresolved'); const h=require('node:crypto').createHash('sha1').update(String(c.guard)).digest('hex'); process.exit(c.guard!==null&&h!=='2be88ca4242c76e8253ac62474851065032d6833'?0:1)"`

Mutation: the guard text restored to `null` makes the Acceptance exit 1 (the row's Open-check), and the new text exits 0; this PR changes data only.

Measured: Acceptance exit 0 at this head (`node -e`, run from this worktree).

Closes #4624

platform: n/a (an index entry)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
