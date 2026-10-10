`.agent-org/project.json` `messaging` gains `announcementsFile`, a REFERENCE to `~/.config/agent-org/telegram-announcements` like `chairmanFile`; the id is never written in the repository.

**Premise, re-derived at this head (measured, not inherited from the row):**
- a11ign/agent-org#592 (a11ign/a11ign#4742) is MERGED at `2931843c0` (2026-10-10T08:01:53Z); the first release tag containing it is **`v0.118.0`** (`git tag --contains`).
- The host tool, `/home/agent/repos/agent-org`, is detached at **`v0.119.0`** (`git describe --exact-match HEAD`) and `ALLOWED_KEYS` in its `src/messaging/config.ts` holds `announcementsFile`, so the key is accepted and declaring it does not take chairman messaging down.
- `readMessagingConfig('<this worktree>')` through that tool printed `announcementsFile: /home/agent/.config/agent-org/telegram-announcements` beside `tokenFile` and `chairmanFile`, `enabled: true`.
- The host file exists, mode 600 (`stat`); its contents were not read.

Acceptance:

```bash
grep -n '"announcementsFile": "~/.config/agent-org/telegram-announcements"' .agent-org/project.json
```

Mutation: on `origin/main` the open-check `grep -c announcementsFile .agent-org/project.json` reads 0 and the acceptance exits 1. In this tree, with the line removed the acceptance exits 1, and with the path changed to `telegram-chairman` it exits 1 too (so it pins the path, not just the key); restored with `cp` and `diff`-identical, it exits 0.

Closes #4747
