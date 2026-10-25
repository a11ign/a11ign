A11-265 (https://linear.app/a11ign/issue/A11-265/update-anthropic-aisdk-to-110-in-a11igna11ign). The root's `@anthropic-ai/sdk` moves from `^0.133.0` to `^1.1.0` (Dependabot's commit from #5709, unchanged), and `@a11ign/judge` is checked against SDK 1.1.0. The judge's optional peer stays `>=0.106.0`, which already accepts 1.1.x; a patch changeset for `@a11ign/judge` records the check.

Acceptance:

```bash
pnpm install --frozen-lockfile --ignore-scripts
test "$(node -p "require('./node_modules/@anthropic-ai/sdk/package.json').version")" = 1.1.0
grep -n '"@anthropic-ai/sdk": ">=0.106.0",' packages/judge/package.json
node --input-type=module -e "import { satisfies } from './packages/guards/src/isolation-gate.ts'; import { readFileSync } from 'node:fs'; const peer = JSON.parse(readFileSync('packages/judge/package.json', 'utf8')).peerDependencies['@anthropic-ai/sdk']; const accepted = ['0.106.0', '0.133.0', '1.1.0', '1.1.9'].every((v) => satisfies(v, peer) === true); const refusesBelowFloor = satisfies('0.105.0', peer) === false; console.log({ peer, accepted, refusesBelowFloor }); process.exit(accepted && refusesBelowFloor ? 0 : 1)"
pnpm --filter @a11ign/evidence --filter @a11ign/scorer run build
pnpm exec tsc -p packages/judge/tsconfig.json --noEmit
pnpm exec tsc -p packages/judge/tsconfig.json --noEmit --listFiles | grep -q '/@anthropic-ai+sdk@1\.1\.0/'
node packages/guards/src/assert-glob-not-empty.ts packages/judge/src/anthropic-backend.test.ts --run --runner=rstest
grep -q '"@a11ign/judge": patch' .changeset/a-judge-peer-checked-against-sdk-1-1.md
```

**What the block shows:** the frozen install accepts the bumped lockfile, and the SDK it installs is 1.1.0. The grep finds the judge's peer still the floor `>=0.106.0`, with no ceiling, and the `node` line reads it with the repository's own `satisfies`: it accepts 0.106.0, 0.133.0 and 1.1.x and refuses 0.105.0. The judge compiles with `tsc --noEmit`, and the `--listFiles` grep shows that the compile read SDK 1.1.0's declarations, not another copy. `anthropic-backend.test.ts` passes against 1.1.0 (`VERDICT pass: 4 tests in 1 file`). The patch changeset for `@a11ign/judge` is there.
