---
"@a11ign/screenreader-fleet": patch
---

**A freshly provisioned lab or worker installs with pnpm, and `doctor` tells an operator `pnpm run` (#2890, row 3 of 10 of #57).** `bootstrap-control-plane.sh` and `provision-nvda-worker.ps1` ran `npm install`, so a box provisioned after #57 got an npm-shaped `node_modules` and, with `package-lock.json` gone, versions the lockfile never named. Both now run `corepack pnpm install --frozen-lockfile` (the spelling `roles/worker/tasks/nvda.yml` uses), removing an npm-made `node_modules` once first. `A11Y_SKIP_NPM_INSTALL` is now `A11Y_SKIP_INSTALL`. `doctor.mjs` spawns pnpm through `pnpmCliInvocation` (now copied into the package's `npm-cli-executable.mjs`, pinned equal to the root's) and prints `pnpm run ...` remedies; `diagnose-nvda-worker.ps1` names the frozen pnpm install.
