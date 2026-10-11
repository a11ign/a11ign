Flows gain `when:`, `optional:`, `dismiss-if-shown:` and `auto:` (v3 login phase 2, part of #4084). `flows.ts` parses them in the closed vocabulary (a selector or a script on any of the four is refused by the existing `by-accessible-name` / `unknown-key` rules; a login still needs a final `expect`, and one carrying `when:` does not count); `interpreter.ts` runs them over an `AuthDriver`: a `when:` that is absent is skipped in under one poll, a `dismiss-if-shown` clicks a present dialog and passes when it is absent, `optional:` swallows ONLY an absent target, and `auto:` hands control to the screen loop and resumes at the next `expect`.

**Measured at this head:** 79 tests in the two files, all pass (`rstest`, the command below).

**Mutations** (12, each applied to `interpreter.ts` or `flows.ts`, run, restored byte-identical with `diff`; each turns red the test named, and the 79 are otherwise green):
- **`optional` lets an `expect` timeout pass** (`try { await expectMet(...) } catch { if (step.optional !== true) throw }`): red `NEGATIVE CONTROL: optional swallows ONLY an absent target: an optional expect that TIMES OUT still fails, and so does an ambiguous control`, and no other.
- `optional` also skips on ambiguity: red that test and `NEGATIVE CONTROL: dismiss-if-shown and when: never swallow ambiguity: two controls of the name is still unbindable-field`.
- `when:` never skips, waits like a bind, or always skips: red `POSITIVE CONTROL: a when: step whose target is present runs, and one whose target is absent is skipped in ONE read, without waiting` (the last also reds the ambiguity test above).
- `optional` never skips: red `POSITIVE CONTROL: an optional step whose control never appears is skipped, after the bind bound and not before; a present one runs`.
- `dismiss-if-shown` never skips: red `POSITIVE CONTROL: dismiss-if-shown clicks a present dialog's button, and passes with nothing to dismiss, without waiting`.
- `auto` skips the origin check before typing: red `NEGATIVE CONTROL: auto: types nothing into a page that is not the app's, and a declared provider's page is the one exception`.
- `optional` accepts any value, or `when:` accepts a selector: red `NEGATIVE CONTROL: a selector or a script in any of the four keys is refused by the rule that already names it`.
- a `when:`-carrying final `expect` satisfies the login: red `NEGATIVE CONTROL: a login flow with no final expect is still login-final-expect, whatever else it holds`.
- `auto` need not precede an `expect`: red `auto: must be followed by an expect:, which is where the loop stops`.

**Judgment calls (named):** `when:` takes its own condition (a heading or a control name), not "the step's target"; an `auto` must be followed by an `expect` (it is the loop's stop condition), else `step-shape`; `optional:` on an `expect` is accepted and changes nothing; `when:` is refused on `capture` and `dismiss-if-shown`.

**Not done here (named):** `plan.auto` is not wired from a CLI flag, so `auto:` is parsed and interpreted but not yet reachable from the command line; `autocomplete` is not exposed on `AxNode`, so the loop recognises by name and heading only; the driver has no Enter key, so a step cannot submit by keypress; the worker's `auth-flow.mjs` does not know the new keys (a row in the layer repository); `docs/outcomes/outcome-12-flows.md` still lists the old verb set.

Acceptance: bash -c 'git grep -q "POSITIVE CONTROL" -- packages/cli/src/auth/flows.test.ts packages/cli/src/auth/interpreter.test.ts && git grep -q "NEGATIVE CONTROL" -- packages/cli/src/auth/flows.test.ts packages/cli/src/auth/interpreter.test.ts && npx rstest run --config scripts/rstest/rstest.config.ts --include packages/cli/src/auth/flows.test.ts --include packages/cli/src/auth/interpreter.test.ts'

Closes #4994
