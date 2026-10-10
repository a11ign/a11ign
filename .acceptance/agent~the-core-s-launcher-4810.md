The core's verbatim stand-in for the layer's launcher now names `capture-check.ts`, the name `a11ign/screenreader-worker`'s `src/launcher-reach.cmd` already declares on its `main`, so `packages/guards/nightly/launcher-reach-drift.test.ts` agrees with it again. One line changes, on the `CAPTURE_CHECK` `set`; no other line moves.

What it finds: the layer moved first. agent-org#625 (the layer's one-line edit) is closed, and `main` of the layer declares `capture-check.ts`, so the stand-in was the only side still naming the `.mjs` that lab deletes at a11ign#4798.

Measured at this head: the LIVE drift test fails with the HEAD `.mjs` line restored and passes with this change (`pnpm exec tsx --test packages/guards/nightly/launcher-reach-drift.test.ts`, 5 pass, 0 fail after). The file was restored byte-identical from a saved copy.

platform: nothing built; one `set` line.

Acceptance: `grep -qF 'set "CAPTURE_CHECK=packages\lab\src\harnesses\capture-check.ts"' scripts/test-support/launcher-reach.stand-in.cmd` printed nothing and exited 0 at this head.

Closes #4810
