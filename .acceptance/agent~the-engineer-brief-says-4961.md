`.agent-org/roles/engineer.md` now names `agent-org worker:state` and `agent-org pr:open` as NOT in the resource ban, in one sentence directly under the ban. The ban's `no worker:*` is rewritten as `no pnpm run worker:*`, naming the three scripts it means (`worker:code`, `worker:compare`, `worker:ctl`), so the bare prefix no longer forbids the command every turn ends on.

- **Measured** (this head, 2026-10-11): the open-check line `no \`worker:*\`` matched `no .worker[:]\*.` at the base; after the edit it does not, and the exempt sentence is present. Both Acceptance lines exit 0 on the edited file. Control: the base file (`git show HEAD~1:`) fails the first line (phrase absent), and the second line's pattern matches it, so the `!` check fires where it should.
- **Measured:** `node --test packages/guards/src/engineer-declared-state.test.ts` passes 4 of 4. That test reads three rule sentences; none of them changed.
- **Measured:** `checkRoster` from `scripts/doc-checks/roles-readme.ts` reports `incomplete: []` (engineer.md complete). Its `missing: [worker-contracts]` is pre-existing and not touched by this diff.
- **Inferred, not run:** that `agent-org worker:state` and `agent-org pr:open` are exempt in agent-org's own guard. That lives in the agent-org repo, not here, and the row only asks for this brief's sentence.

Acceptance: bash -c 'grep -q "are not in the resource ban" .agent-org/roles/engineer.md && ! grep -q "no .worker[:]\*." .agent-org/roles/engineer.md'

Closes #4961
