Closes #4598

## Acceptance

```bash
bash -c '! git grep -hE "^ExecStart[^#]*/usr/bin/node" -- .agent-org/units | grep -q . && ! git grep -qE "pnpm exec agent-org" -- scripts'
```

Items 1 and 2 of the row were already true on `origin/main` (no `pnpm exec agent-org` under `scripts/`); the second half of the Acceptance holds before and after this PR. Item 3 is the change: every `ExecStart` that named `/usr/bin/node` now names `%h/.local/bin/node`, the convention ADR 0043 pins for every unit.

## What changes, and why

- `a11ign-corpus-release-nightly.service`: `ExecStart` runs `corpus-release-nightly.mjs` under the host's Node 24, not the distro 22.
- `a11ign-regression-board.service`: the `sh -c` line runs `%h/repos/agent-org/src/bin.mjs` through `%h/.local/bin/node`.
- `a11ign-token-cost-weekly.service`: `ExecStart` runs `scripts/token-cost.ts` (with `--import tsx`); the distro 22 cannot strip types, so the unit would fail on its first start.
- `a11ign-weekly-review.service`: the `sh -c` line `exec`s `scripts/weekly-review.ts` through `%h/.local/bin/node`.

`%h` is systemd's specifier for the unit user's home and is expanded inside a quoted `sh -c` argument too; the `$$` escapes are unchanged. The `/usr/bin/sh` launches are not touched, since the Acceptance names only `/usr/bin/node`.

## Host-install

Host-install: the four `.agent-org/units/*.service` files above -- each `ExecStart` changes its node path, so the installed units differ from the host's copies. A host-run `host:install` puts them on the host and is separate from this PR; the units will fail on a host without `~/.local/bin/node` (v24.21.0 here), which ADR 0043 already requires.

## How you verified it

- [x] Acceptance, before the change: the `ExecStart` grep matches **4** lines on `origin/main` (`git grep -hE "^ExecStart[^#]*/usr/bin/node" origin/main -- .agent-org/units`), so the command fails there.
- [x] Acceptance, after the change: `rc=0`; the `ExecStart` grep prints nothing.
- [x] `git diff --stat`: four files, four lines changed, nothing else in the units touched.
- [x] Not run: anything on a worker, the fleet or the lab (the resource ban); `host:install` (orchestrator's).

## If you changed a guard or a gate

Not applicable: no guard or gate changed. The Acceptance is a grep, so its mutation is the revert. Measured: `token-cost`'s `%h/.local/bin/node` put back to `/usr/bin/node` makes the command exit 1; restored from a backup, `diff` byte-identical, and the command exits 0 again.

## Outside-Region

None: the diff is the four units named in the row's Region plus this file.
