## What

The isolation gate's consumer directory is now an ES module: `packages/guards/src/isolation-gate.ts` runs `npm pkg set type=module` right after `npm init -y`. A test on the PR path, `#4654` in `packages/guards/src/pnpm-publish-path.test.ts`, runs a `.ts` smoke with `import` statements through `checkIsolation` and asserts the consumer's `type`.

**The file the consumer's Node parsed as CommonJS was `isolation-smoke.ts`, the gate's own smoke, copied into the consumer directory.** It did not come from a package, a dependency or a pin: the four tarballs were fine. #4393 renamed the smokes `.mjs` -> `.ts`; a `.ts` takes its module type from the nearest `package.json`, and the consumer's was written by `npm init -y`, which under npm 11.19.0 (the npm the gate reports using) writes `"type": "commonjs"`. #4393's commit `16c73e61a` says "the isolation gate's consumer is type=module" and its diff contains only a changeset and a fixture: the code change never landed.

## Evidence

- Reproduced at `b260eb84b` on this host: `node packages/guards/src/isolation-gate.ts packages/evidence` -> `FAIL @a11ign/evidence SyntaxError: Cannot use import statement outside a module`. The kept consumer's `package.json` held `"type": "commonjs"`; `node isolation-smoke.ts` there printed `isolation-smoke.ts:9 import assert from "node:assert/strict"; ^^^^^^ SyntaxError` through `Module._compile` (the CJS loader).
- Why it passed before #4393 and on a typeless consumer: `.mjs` ignores the field; Node 24's syntax detection reparses a TYPELESS `.ts` (measured with this host's npm 9.2.0, which writes no `type`), and an explicit `commonjs` switches detection off.
- After the fix, `pnpm run gate:isolation`: `4/4 package(s) usable when installed` (a11ign, @a11ign/evidence, @a11ign/judge, @a11ign/scorer all `ok`). This host's `grep` is ugrep, which rejects the `\2` in the row's Acceptance, so the printed line was matched with `/usr/bin/grep -Eq` (exit 0).
- New test: 20 tests, 0 failed in `pnpm-publish-path.test.ts`. Mutation (fix line removed, restored byte-identical, `diff` clean): exactly 1 of 20 fails, with `the smoke failed in the consumer at stage smoke: SyntaxError: Cannot use import statement outside a module`.
- `eslint` on both files: 0 errors (5 warnings, all `no-magic-numbers` on lines this change did not write); `pnpm run typecheck`: clean.

**Not fixed here, named:** `packages/guards/nightly/isolation-gate-real-consumer.test.ts` keeps only `stage === "bin"` verdicts, so a smoke-stage failure never fails it. The new PR-path test covers the smoke stage with one tiny fixture; widening the nightly is a separate change.

platform: npm's own `npm pkg set` writes the field; no JSON is hand-written.

Acceptance:

```bash
pnpm run gate:isolation 2>&1 | tee /dev/stderr | grep -Eq '(^|[^0-9])([0-9]+)/\2 package\(s\) usable when installed'
npx rstest run --config=scripts/rstest/rstest.config.ts packages/guards/src/pnpm-publish-path.test.ts
```

Closes #4654

🤖 Generated with [Claude Code](https://claude.com/claude-code)
