The row asks which checks `main` requires and whether the agent-org split needs an edit to branch protection. The answer is recorded as a table in `docs/operational-lessons.md`, under the heading that carries the row's own phrase, with each surface's instrument and identity named.

- **Read at `bbf6da6dd` as `a11ign-workers[bot]`, a non-admin identity:** `rules/branches/main` and `rulesets/23681721` require exactly one context, `gate` (integration 15368). The `protection` endpoint is 403 for this identity, so the classic body is not readable here, and the `branches/main` field it does return conflicts with ADR 0039 and is named as unresolved in the table.
- **No planned row removes or renames `gate`:** the function rows take org jobs out of its `needs`, which changes what it waits for, not its name. So no branch-protection edit is needed and no `needs:chairman` brief is due.

Acceptance: node -e 'const r=require("child_process").spawnSync("git",["grep","-l","-F","required checks after agent-org stands alone","--","docs/operational-lessons.md"],{encoding:"utf8"});process.exit(r.stdout.trim()?0:1)'
