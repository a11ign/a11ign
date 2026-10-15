The lockfile, `package.json` and the guard that pins the consumed registry version move `@a11ign/screenreader-worker` from `0.13.1` to `0.13.2`, the release that never presses a provider-named control as a login form's submit (a11ign#5494, screenreader-worker#61). The Auth0 end-to-end run installs the worker from this lockfile, so the lock is what decides which submit the login runs.

- **Positive control at `origin/main`:** the override there still reads `0.13.1`, so the grep exits 1 and the guard test pins `0.13.1`. The pair fails there and passes only with the four files moved together.
- **Real tree:** the override reads `0.13.2`, the lockfile entry reads `0.13.2` with an integrity under every importer that declares it, and no pending changeset names the package in its frontmatter.
- **Registry:** `npm view @a11ign/screenreader-worker@0.13.2 dist.integrity` returns the same `sha512` the lockfile carries.

Acceptance: grep -q '"@a11ign/screenreader-worker": "0.13.2"' package.json && node --test packages/guards/src/screenreader-worker-extraction.test.ts && node -e "const p=require('./package.json'); process.exit(p.dependencies['@a11ign/screenreader-worker']==='^0.13.2' && p.pnpm.overrides['@a11ign/screenreader-worker']==='0.13.2' ? 0 : 1)"
