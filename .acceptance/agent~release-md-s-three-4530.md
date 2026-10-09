Acceptance:
```bash
bash -c 'for k in "free vetoes" "stale captures" "real Windows runner"; do grep -nE "$k.*(read|measured) 20[0-9]{2}-[0-9]{2}-[0-9]{2}" RELEASE.md || exit 1; done'
```

Mutation (both directions, restored byte-identical by `diff` of a copy): with the date removed from the Windows item (`VERIFIED, read 2026-10-09` to `VERIFIED`) the command exits 1; with it removed from the stale-captures item (`CLOSED, read 2026-09-24` to `CLOSED`) it exits 1; unmutated it exits 0. The `free vetoes` key also matched at `origin/main`, so it cannot tell fixed from unfixed on its own (see the PR body).
