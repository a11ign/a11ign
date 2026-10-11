Sets `routing.question` to `choice` in a11ign's `.agent-org/project.json`, so engineers are routed by the one Jev choice (#4904's direction). Until now the key was absent, which reads as `traits`, so every route since agent-org#782 merged ran in `traits` mode. Thresholds stay at #4904's defaults (not set here). Revert is the same line set to `traits`.

platform: this is a declaration key the tool already reads (`readRouting` in agent-org's `src/project-config.ts`); nothing to build.

Acceptance:
```bash
bash -c 'node -e "const p=require(\"./.agent-org/project.json\"); if(p.routing?.question!==\"choice\") process.exit(1)"'
```

Mutation: the command exits 1 before the change (the key is absent) and 0 after. Setting the key to `traits`, or deleting it, also exits 1, so the check moves with the value. The real file passes agent-org's own `parseProjectDeclaration` and reads back `question: "choice"` with the default thresholds 0.5 and 0.7.

## Evidence

Done-when items 1 and 2 of the row (a decision line after merge, and the 24h verify row) happen after merge and are not claimed here.

Closes #4953
