---
"@a11ign/agent-org": patch
---

**`agent-org` reads ONE per-project declaration, `.agent-org/project.json`, and `REPO` and the board come from it (#2616, child 3a of #69).** `project-config.mjs` is the only reader: it returns the project's `tracker` and `code` lists (each `{key, repo}`, a tracker also `{board}`), and `scripts/repo-identity.mjs` and `board-snapshot-scope.mjs` compute `REPO`, `PROJECT_OWNER` and `PROJECT_NUMBER` from it, so the 31 importers are unchanged and a11ign's values are exactly today's. **The reader refuses and never defaults**: a missing declaration, a missing or mistyped field, an unknown `schema`, two entries with one key, a key ending in `-<digits>` and the empty key declared twice are each refused naming the field. A copy of the tool that does not carry the declaration therefore stops at import (four tests that copy an import closure now copy it too). `project-config.test.ts` shows a second project resolving through the same reader and each refusal.
