`login --check` and the authenticated scan's rule layer now give the sign-in loop's marks a collector (`packages/cli/src/auth/auth-trail.ts`). When `A11Y_AUTH_TRAIL_FILE` names a file, each `authLoop` is written there as the screen and control pressed per step plus the outcome, and nothing else: a branch is mapped to `{ screen, kind }` again in the writer, so a value a later mark carried cannot reach the file.

- **Positive control:** the loop's marks land in the file with their screens, kinds and outcome (`auth-trail.test.ts`, first test).
- **Negative controls:** a typed value carried on a mark and on a branch never reaches the file; an unset or empty variable writes no file; the non-loop marks write nothing.

Acceptance: node --import tsx --test packages/cli/src/auth/auth-trail.test.ts

The row's wording was `node --test packages/cli/src/auth/auth-trail.test.ts`. That form cannot load any TS test under `packages/cli`: Node's native loader does not map the `./auth-trail.js` specifier to `auth-trail.ts`, so it fails with `ERR_MODULE_NOT_FOUND` before a single assertion runs (the same happens to `screen-loop.test.ts`). `--import tsx` is the loader the repo's own `tsx` dependency provides, and it runs the same file and the same tests.

Mutation: four, each restored byte-identical. (M1) the branch mapping removed: fails only the value test. (M2) the environment gate removed: fails only the no-variable test. (M3) the event filter removed: fails only the non-loop test. (M4) the accumulation removed: fails only the accumulation test.
