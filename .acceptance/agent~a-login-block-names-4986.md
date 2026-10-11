Adds `packages/cli/src/auth/login-block.ts`: `parseLoginBlock(value)` over the parsed YAML of a `login:` mapping, returning the typed block or throwing `LoginBlockError` with one of `login-block-shape`, `login-literal`, `login-no-check`, `login-unknown-key`, `login-url-not-http`. Pure; `flows.ts` is not edited. A username, password or secret that is not a legal variable name (a password with punctuation, an `otpauth://` URI) is `login-literal`; no refusal echoes the value (asserted). Assumptions: the keys are `url`, `username`, `password`, `totp`, `check` (`role`+`name` or `url`), `organization`, `fields`, `idp-origins`; all three env names are required. A bare lowercase word that is a legal variable name is accepted, as the row's check defines it.

Acceptance: `git grep -q "POSITIVE CONTROL" -- packages/cli/src/auth/login-block.test.ts && git grep -q "NEGATIVE CONTROL" -- packages/cli/src/auth/login-block.test.ts && npx rstest run --config scripts/rstest/rstest.config.ts --include packages/cli/src/auth/login-block.test.ts` -- VERDICT pass: 13 tests in 1 file at this head. `eslint` on both files and `tsc --noEmit` exit 0.

Rework after reviewer-5005's NOT CONVINCED: a credential in `url`/`check.url`/an idp origin is `login-literal`; an `idp-origins` entry with a path, query, fragment, wildcard or the app's own origin is `login-block-shape`; entries are kept as `URL.origin` and de-duplicated, as `flows.ts` does.

Closes #4986

Mutation: disabling the env-name check (`if (false && !ENV_NAME.test(value))`) turned 3 of 10 tests red (the password, username and otpauth-URI `login-literal` cases); restored byte-identical (`cp` back, test green at 10 of 10).
Mutation (rework): disabling the credential check and the path/query/fragment check turned the two new NEGATIVE CONTROL tests red; restored byte-identical.
