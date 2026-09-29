---
"@a11ign/agent-org": patch
---

**`agent-org` no longer names a11ign's host: the machine's paths are `.agent-org/host.json`, the tool's three units and its `gh` wrapper are templates rendered from it, and the four a11ign-only units live with the project (#2620, child 3f of #69).**

**Why.** ADR 0040 makes `agent-org` a project-agnostic tool. Twelve of its files carried `/home/agent`, every service set the same `WorkingDirectory`, and the board dispatcher named `a11ign/a11ign`. **What changed:** `host-config.mjs` is the one reader of `host.json` (home, `binDir`, each project's checkout, the workers and leads directories, the leads list) and of the project declaration's `units` block (`prefix`, `boardReportWorkflow`, `own`). `host/{work-tick,worktree-prune,board-report}.{service,timer}.in` and `host/gh` carry `@@name@@` placeholders that `host-units.mjs` fills; `gh-leads-workspaces.txt` is now `host.json`'s `gh.leadsWorkspaces` and is rendered to the same bytes. The corpus-snapshot, corpus-release-nightly, fleet-watch and lab-watch units moved to `.agent-org/units/` with `git mv`. `board-report-dispatch.sh` reads its repository and workflow from the project's declaration and FAILS when either is absent.

**What did not change, and is asserted.** Every installed name and every rendered byte is today's (`host:check` reads the live host clean before and after; the test pins a sha-256 per text). **No unit is renamed and none is reinstalled**, and the running `work-tick` unit is untouched: moving the install to the tool's own checkout is rows 4 and 5. `host-units.mjs` records the partition of the 17 entries (8 tool, 8 project, 1 host data) and an 18th entry classified nowhere is a `host:check` finding and refuses `host:install`.

**Still owed.** `wake.mjs`, `work-gate.mjs` and `lib/worktree-resolution.mjs` still spell `/home/agent` (two constants and prose). They are 3b's and 3c's files; `host-project-paths.test.ts` ties the constants to `host.json` until they read it.
