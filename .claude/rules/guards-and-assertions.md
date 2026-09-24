## An approval prompt a human learns to click through is worse than no prompt (2026-09-23, #2076)

- **Write `rm -f "${D:?}"/*.md`, never `rm -f $D/*.md`.** `:?` makes the shell abort on an unset or empty
  variable, so the expansion that would become `rm -f /*.md` is impossible; the quotes stop a path with a
  space re-splitting. **The prompt stops firing because the danger is gone, not because the guard was
  overridden** — the only version of "stop asking me" worth having, and one of the few guards
  `--dangerously-skip-permissions` does not disable, so it reaches a human every time.
- **The cost is not the seconds:** one such line reached the chairman **several times in one morning**.
  Every avoidable prompt **makes the unavoidable ones cheaper to ignore**, and the next is real.
- **The general form: when a command is refused for its SHAPE rather than its EFFECT, change the shape.**
  Reaching for an override, or asking a human to approve it again, both leave the next session to
  rediscover the same refusal — and one of them trains the reviewer out of reviewing.
- **Prevention rather than cleanup.** Quoting alone defuses the BARE-VARIABLE case, and buys nothing once
  a glob is attached: an empty `"$D"` in `rm -f "$D"/*.md` still expands to `rm -f /*.md`, because the glob
  sits OUTSIDE the quotes. So quote always, and reach for `:?` **the moment a glob joins the variable.**
- **Count this population with `roles-readme.test.ts`'s classifier, which splits the arguments and drops
  the flags, not with a regex over the whole line** — `rm -f -- "$path"` puts a `--` where the regex
  expects the target, so a line-anchored grep under-reads it.

## Assertions

- **An emptiness assertion names where its positive control lives.** `assert.deepEqual(offenders, [])`
  passes when the population is empty, so somewhere there must be an assertion that it is not — and the
  writer must be able to point at it. **A control you believe in is not one you can point at.**
- **Where the population comes from decides whether a machine can help you:** a local collection is
  refused unpinned by `local/uncontrolled-emptiness`; the **64 derive from a CALL** have only this
  line (#1157).
