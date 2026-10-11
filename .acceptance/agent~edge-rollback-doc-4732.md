## What

Adds `docs/edge-rollback-on-workers-7-8-9.md`: the cause of the pinned Edge MSI not landing on workers 7, 8 and 9, with the event-log output that shows it, and the fix that carries it (a11ign#4939). Indexed in `docs/README.md`.

## Why

Edge self-updated past the pin on 7-9 (the updater is disabled by the step after the Edge step, which the role never reached). The pin's check reads the `msedge.exe` binary, which still said `.62`, so the plain install path ran and Chromium's MSI declined, logging success with no transaction. `--rename-chrome-exe` then found no `152.0.4191.66\Installer\setup.exe`. Worker 11 had that directory from an earlier pin, so the same MSI finished there.

Acceptance:

```bash
grep -c -E "152\.0\.4191\.(62|66)" docs/edge-rollback-on-workers-7-8-9.md
```

Closes #4732

🤖 Generated with [Claude Code](https://claude.com/claude-code)
