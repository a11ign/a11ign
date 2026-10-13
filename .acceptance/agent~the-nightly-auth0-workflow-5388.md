Adds `packages/guards/src/no-installed-package-src-path.test.ts`: no runnable surface (`action.yml`, `.github/workflows/**`, the templates `scripts/outsider/generate.ts` writes) names a path inside an installed package's `src/` tree. A consumer installs the published package, which does not ship its source tree, so such a line fails only after the worker is spent (#5293). The test has a positive control (the fleet path and an unscoped one are flagged; the shipped launcher and `dist/` entry are not) and a walk-is-real floor.

Acceptance:
node --test packages/guards/src/no-installed-package-src-path.test.ts
