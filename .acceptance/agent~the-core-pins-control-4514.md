The core pins `control` at `v0.2.1` in `layers.json` (main reads `v0.1.17`), the tag control released carrying #4516's rewrite of its 82 `.mjs` specifiers to the fleet's `.ts`, so the laid control imports the laid fleet and `fleet:*` can start again (closes #4447's Done-when 2 on the core's side; follows #4636, #4516, #4687).

What changed: one value in `layers.json`, `"tag": "v0.1.17"` to `"tag": "v0.2.1"`. Nothing else: the fleet pins and the `.mjs` to `.ts` sweep landed in #4636, and #4687 moved the fleet to 0.7.2.

Measured at this head (`git ls-remote --tags https://github.com/a11ign/control.git`): `v0.2.1` is the highest control tag (`v0.2.0` is the other `v0.2.*`), so it is `latest`. `pnpm install --frozen-lockfile` exited 0 and `packages/control/.layer-ref` reads `v0.2.1`.

Not changed, and why: no changeset. A `layers.json` pin is not a package, and #4563 and #4652 (lab pin bumps) carried none. Row 4514's own Acceptance command 1 greps the lockfile for `screenreader-fleet@0.6`, which no longer matches because #4687 locked 0.7.2; its `>= 0.6` floor half still passes, so that grep is the row's stale reading, not a regression here.

platform: nothing built; one-line pin bump.

Acceptance:
```bash
bash -c 'tag=$(sed -nE "s/.*\"control\": \{[^}]*\"tag\": \"v([0-9.]+)\".*/\1/p" layers.json); test -n "$tag" && test "$(printf "%s\n%s\n" "$tag" 0.1.21 | sort -V | head -1)" = 0.1.21'
pnpm install --frozen-lockfile
```

Closes: #4514

🤖 Generated with [Claude Code](https://claude.com/claude-code)
