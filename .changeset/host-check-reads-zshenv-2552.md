---
"@a11ign/agent-org": patch
---

**`host:check` now notes when the agent account's `.zshenv` does not export `NODE_COMPILE_CACHE` under `$HOME/.cache` (#2552).** `compileCacheDrift` reads the shipped `.service` files; an interactive agent session reads no unit, so a fresh host or a re-created account regressed to a compile cache in the RAM-backed `/tmp` and `host:check` still said every unit was current. `compileCacheNotes` reports a missing file, a missing line, and a line pointing elsewhere (the last export wins) as a NOTE beside the identity notes, never a failure: the remedy is an edit to a person's dotfile that `host:install` must not make, and `--json` carries it in `notes`, which the gate does not wake a session on. Silent on a host whose `.zshenv` carries the export.
