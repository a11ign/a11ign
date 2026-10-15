The lockfile, `package.json` and the guard that pins the consumed registry version move `@a11ign/screenreader-worker` from `0.13.2` to `0.13.3`, the release that presses the app's `Sign in` once per login (a11ign#5534, screenreader-worker#65). The Auth0 end-to-end run installs the worker from this lockfile, so the lock is what decides whether the login presses `Sign in` a second time.

- **Positive control at `origin/main`:** the override there still reads `0.13.2`, so the grep exits 1 and the guard test pins `0.13.2`. The pair fails there and passes only with the four files moved together.
- **Real tree:** the override reads `0.13.3`, the dependency range reads `^0.13.3`, the lockfile entry reads `0.13.3` with an integrity under every importer that declares it, and no pending changeset names the package in its frontmatter.
- **Registry:** `npm view @a11ign/screenreader-worker@0.13.3 dist.integrity` returns the same `sha512` the lockfile carries.

Acceptance: grep -q '"@a11ign/screenreader-worker": "0.13.3"' package.json && node --test packages/guards/src/screenreader-worker-extraction.test.ts && node -e "const p=require('./package.json'); process.exit(p.dependencies['@a11ign/screenreader-worker']==='^0.13.3' && p.pnpm.overrides['@a11ign/screenreader-worker']==='0.13.3' ? 0 : 1)"
