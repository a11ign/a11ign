`packages/guards/src/judge-exports-on-disk.test.ts` gives core the live read control's `doctor.test.ts` held for the judge package (a11ign#5345, a11ign/control#84): every `exports` target of `packages/judge/package.json` is on disk after the build. The ~25 lines of `missingExportTargets` are re-written in core, so core does not import the fleet. Four tests: the clean fixture, the positive control (a missing target reads as missing, naming it), the null for an unreadable manifest, and the LIVE read.

Acceptance: bash -c 'git grep -qiE "every .?exports.? target" HEAD -- packages/guards/src'

The row's own Acceptance greps `origin/main`, which cannot contain this change before it merges, so this file greps the commit under review instead (the same pattern, the same path). After merge the row's `origin/main` form is its done-when check.

Closes #5364
