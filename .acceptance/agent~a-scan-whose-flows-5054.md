A flows file may now carry a `login:` block, and a scan whose `--flows` names no `--login-flow` signs in by it: `parseFlowsFile` keeps the block (a file with a block and no `flows:` is valid), `resolveAuthentication` builds an `AuthRequest` whose `loginBlock` holds the NAMES of the three variables, `url`, `check` and `organization`, and the rule layer signs in by the same `planFromBlock` plan `login --check` builds (moved into `login-block.ts`). A flow named by `--login-flow` still beats a block, and says so.

**The request of a block run, the three variables set to markers** (measured, `login-block-wire.test.ts`, names present, values absent):

```json
{"loginBlock":{"url":"https://app.example.test/login","usernameEnv":"APP_USER","passwordEnv":"APP_PASSWORD","totpEnv":"APP_TOTP","check":{"role":"heading","name":"Dashboard"},"organization":"Acme Corp"}}
```

The markers were `canaryuser6d3f2a`, `canarysecretb81c94`, `canarytotp4e7a10c2`; the test searches the serialised request and the HTTP body a real listener received for each and finds none.

**One-line revert:** stop reading `file.login` in `resolveAuthentication` (`packages/cli/src/auth/resolve.ts`); a block is then ignored and `--flows` alone is `login-flow-missing`, as before.

**Where the row's wording was refuted by the published worker** (`@a11ign/screenreader-worker` v0.11.0/0.12.0, read from the package):
- The row says `login` is empty. In-process it is `[]`, but the worker refuses ANY defined `login` beside `loginBlock` (`auth carries both login and loginBlock`), `[]` included, so `onTheWire` removes the key at the one place the request is serialised.
- `fields` is not sent: the worker refuses it, and `login --check` ignores it too.
- The worker treats an unset `totpEnv` variable as "no MFA"; this row's Acceptance requires all three to be set, so a missing totp refuses before the lease. Stricter than the worker, on purpose, and said here.
- `login --check`'s message for a `url:` check is now the shared `login-check-url` rule's text, not its old wording.
- Not changed: a bare base32 seed passes the env-name regex (an existing gap, outside this row).

Outside-Region: packages/cli/src/cli.ts — `planFromBlock` there now calls the shared `loginBlockPlan`, and `captureViaWorker` serialises through `onTheWire`; both are one-line call-site changes the shared plan and the dropped `login` key require.
Outside-Region: packages/cli/src/auth/rule-layer.ts — the rule layer reads the same `args.auth` the wire does, so it must turn a `loginBlock` request into the plan (`ruleLayerPlanOf`) or it would replay an empty `login`.

platform: none needed; a CLI-side wire shape, no Windows worker in this change.

Acceptance:

```bash
git grep -q "POSITIVE CONTROL" -- packages/cli/src/auth/login-block-wire.test.ts
git grep -q "NEGATIVE CONTROL" -- packages/cli/src/auth/login-block-wire.test.ts
npx rstest run --config scripts/rstest/rstest.config.ts --include packages/cli/src/auth/login-block-wire.test.ts
```

Mutation: five, each caught by its own test and restored byte-identical (`diff` empty) from a `cp` backup, 18 pass again: (A) `onTheWire` returning `auth` unchanged fails the wire-shape and HTTP-body tests; (B) `names` in `planBlock` dropping `totp` fails the missing-variable test for it alone; (C) letting a block beat a named flow fails the flow-wins test; (D) the rule layer ignoring `loginBlock` fails the plan-parity test; (E) accepting a `url:` check fails the `login-check-url` test.

Closes #5054

🤖 Generated with [Claude Code](https://claude.com/claude-code)
