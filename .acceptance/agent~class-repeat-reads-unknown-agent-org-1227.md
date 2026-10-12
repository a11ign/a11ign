The class index gets one entry for each of the five event kinds the failure ledger already writes and the class-repeat reading could not place: `app-role-silent`, `tool-drift-interactive-prompt`, `lock-gridlock`, `claim-refused` and `safety-check-denied`. Each entry has `id`, `name`, `guard` (or `null` with a `guardNote`), `guardNote` and an empty `seed`, in the shape `main-red` and `sweep-overrun` use. No kind is removed from the ledger, no line is rewritten, and `repeating-lines.allowlist.json` is unchanged. A `class-repeat` reading of any of the five now resolves to a defined class instead of `unknown`.

Re-read: the guard names were checked against agent-org `main` (`tickAppRoleSilent` in `src/host-units.ts`, `blockingImpactOrders` in `src/work-gate/causes/org-health-resolver-defects.ts`, `claimRefusalStormReading` in `src/org-health.ts`, `safetyCheckDenialEvents` in `src/safety-check-denial-incident.ts`, `agent-org agent-tool:update` in `src/agent-tool-update.ts`), not against the row's text alone. `safety-check-denied` has `guard: null`, because the only control is a prose rule in the engineer brief that nothing enforces.

Acceptance: node -e 'const ids=new Set(JSON.parse(require("fs").readFileSync(".agent-org/failure-classes.json","utf8")).classes.map(c=>c.id));const miss=["app-role-silent","tool-drift-interactive-prompt","lock-gridlock","claim-refused","safety-check-denied"].filter(i=>!ids.has(i));if(miss.length){console.error("missing: "+miss);process.exit(1)}'

Evidence: the same command run against `origin/main:.agent-org/failure-classes.json` prints `missing: app-role-silent,tool-drift-interactive-prompt,lock-gridlock,claim-refused,safety-check-denied` and exits 1. Against the edited file it exits 0. Both exits were read from `$?`.

Evidence, production reading: a script importing agent-org's `parseFailureClasses` (`src/class-repeat.ts`) and `classRepeatReadings` (`src/org-health.ts`) builds one ledger line per kind and reads it. Against `origin/main`'s index, all five read `unknown` ("not in .agent-org/failure-classes.json"). Against the edited index, the reading is `clear`.

Post-merge done-when journal check: not run here, because it needs the merged code on the host.

Closes a11ign/agent-org#1227

🤖 Generated with [Claude Code](https://claude.com/claude-code)
