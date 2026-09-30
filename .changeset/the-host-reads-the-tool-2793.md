---
"@a11ign/agent-org": patch
"@a11ign/lab": patch
---

**The host reads `tool`, `stateDir` and a project's `beforeTick`, the `work-tick` unit renders ADR 0040 decision 3's form, and the tool has an `update` command — and the running unit is untouched (#2793, child 5b of #2623).** Decision 3 described an installed form and the reader #2620 shipped read none of its fields, so nobody owned the seam. `host.json` may now carry `tool` (an absolute path, refused when it is a project's checkout or inside one) and `stateDir`; a project's `.agent-org/project.json` may carry `beforeTick`, one command with no shell syntax and no systemd specifier. A malformed value is refused naming the field, and an absent one leaves the KEY absent, so a host that has not moved reads exactly as before.

**With `tool` set, three lines of the `work-tick` unit change and nothing else does:** `WorkingDirectory` becomes the tool's path, `ExecStart` loses its `packages/agent-org/` prefix, and the one `ExecStartPre` becomes `node src/update-tool.mjs` followed by each project's `beforeTick`, run in that project's checkout. **Without `tool` the unit renders today's bytes**, asserted against the digest `host-project-paths.test.ts` pins. a11ign's `host.json` is NOT edited here, so nothing installed changes; the cut-over is #2623's.

**`update-tool.mjs` moves the checkout it lives in to `origin/main`,** refuses a tree with a modified tracked file (naming it) and a linked worktree, and never touches another checkout. `stateFilePath` answers where a state entry lives under `stateDir` and refuses, never defaults, when a host declares none. **Not done, and named:** `DRAIN_MARKER`, `REVIEWER_STATE_DIR`, `LIVE_STATE_DIR` and `ledgerPathFrom`'s default still spell `~/.cache/a11ign`; those files are other rows' Regions.
