`@a11ign/evidence` exports `restatesWireType(text)` from `packages/evidence/src/index.ts`: the `stateChanges`/`formChanges` scan that lived in `interaction-declarations.test.ts` and the inline-`structure` scan that lived in `structure-declarations.test.ts`, one function returning `<field>: <shape>` strings. Both core tests now import it and hold no copy of the detector; the structure test gained the positive control it lacked.

**Not in this diff, and why:** the lab's own scan (`lab:src/product-checks/wire-type-declarations.test.ts`) is a pull request in `a11ign/lab`, and the lab pins `@a11ign/evidence 0.2.0`, which has no such export. It can only import it after this lands and a release is cut and the lab bumps (ADR 0045 rule 2, "then a release, and the consumer bumps"). Filed as a follow-up row, not held on this claim.

- **Measured** (this worktree, `pnpm --filter @a11ign/evidence run build`, `packages/lab` laid at v0.1.28 by `scripts/lay-layer.ts lab`): `pnpm exec tsx --test packages/judge/src/interaction-declarations.test.ts packages/judge/src/structure-declarations.test.ts` printed 8 tests, 8 pass, 0 fail (5 in the interaction file unchanged, 3 in the structure file: the two existing and the new control).

Acceptance: bash -c 'pnpm --filter @a11ign/evidence run build >/dev/null && node -e "import(\"./packages/evidence/dist/index.mjs\").then((m) => process.exit(typeof m.restatesWireType === \"function\" && m.restatesWireType(\"stateChanges?: { control: string }[];\").length === 1 ? 0 : 1))"'

Mutation: (A) removing the `export` keyword turns the Acceptance red (rc 1) and both core test files red (they no longer import). (B) making the change-list half return nothing fails the "re-adding the inline stateChanges shape is named by that file" test and the "each restatement shape is caught" test, and no other; the Acceptance stays green. (C) making the structure half return nothing, or fire on any `structure: {}` (floor 0), fails only the new structure control. Each restored from a copy and `diff`ed byte-identical. Measured, this head, by `sed` on `index.ts` and re-running the two test files.

Closes #5092
