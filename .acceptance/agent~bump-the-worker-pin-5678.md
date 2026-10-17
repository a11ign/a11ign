The lockfile, `package.json` and the guard that pins the consumed registry version move `@a11ign/screenreader-worker` from `0.13.5` to `0.13.7`, the first release whose `Branch` carries `alerts` and `controls` (screenreader-worker PR 70, #5673). The CLI half (#5674) is on main and reads `branch.alerts` and `branch.controls`, which a 0.13.5 worker never sends, so the wrong-code run of #5564 cannot record them until main installs 0.13.7.

- **Positive control at `origin/main`:** the override there still reads `0.13.5`, so the grep exits 1 and the guard test pins `0.13.5`. The pair fails there and passes only with the three files moved together.
- **Real tree:** the override reads `0.13.7`, the dependency range reads `^0.13.7`, the lockfile entry reads `0.13.7` with an integrity under every importer that declares it, and no pending changeset names the package in its frontmatter.
- **Registry:** `npm view @a11ign/screenreader-worker@0.13.7 dist.integrity` returns `sha512-tr4oOQc30FW8/FjNsGtlreoK0cxYmb+FRgKu1X0ElylzSk0xgnVGtm2h3UWaJR4Z9h6tU1/FXJr+SKBnZny3ew==`, the same `sha512` the lockfile carries. The tarball's `dist/src_auth-flow_ts.mjs` reads `alerts: alertControls(o).map(readable)`.

Mutation: reverting the `pnpm.overrides` entry in `package.json` to `0.13.5` turns the guard test red, naming `pnpm.overrides hold @a11ign/screenreader-worker at 0.13.5, not 0.13.7` (9 pass, 1 fail); the file was restored from a copy and `diff`ed byte-identical, and the test passes again (10 pass). Measured at this head.

Acceptance: grep -q '"@a11ign/screenreader-worker": "0.13.7"' package.json && grep -q "'@a11ign/screenreader-worker@0.13.7':" pnpm-lock.yaml && node --test packages/guards/src/screenreader-worker-extraction.test.ts
