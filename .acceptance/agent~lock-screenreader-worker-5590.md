The lockfile, `package.json` and the guard that pins the consumed registry version move `@a11ign/screenreader-worker` from `0.13.3` to `0.13.4`, the release whose server starts when the launcher reaches it through a symlink or a directory junction (screenreader-worker#66, a11ign#5588). A deploy lays the worker from this lockfile, so the lock is what decides whether worker-5 listens after `fleet:deploy` or exits 0 after about 3 s (a11ign#5155).

- **Positive control at `origin/main`:** the override there still reads `0.13.3`, so the grep exits 1 and the guard test pins `0.13.3`. The pair fails there and passes only with the four files moved together.
- **Real tree:** the override reads `0.13.4`, the dependency range reads `^0.13.4`, the lockfile entry reads `0.13.4` with an integrity under every importer that declares it, and no pending changeset names the package in its frontmatter.
- **Registry:** `npm view @a11ign/screenreader-worker@0.13.4 dist.integrity` returns the same `sha512` the lockfile carries.

Acceptance: grep -q '"@a11ign/screenreader-worker": "0.13.4"' package.json && node --test packages/guards/src/screenreader-worker-extraction.test.ts && node -e "const p=require('./package.json'); process.exit(p.dependencies['@a11ign/screenreader-worker']==='^0.13.4' && p.pnpm.overrides['@a11ign/screenreader-worker']==='0.13.4' ? 0 : 1)"
