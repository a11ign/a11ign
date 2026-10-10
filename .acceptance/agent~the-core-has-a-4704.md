The core pins `control` at `v0.3.0` and has `fleet:patch` and `fleet:patch-schedule`, so #4449's live proof of #4405 can run the command (follows #4446, #4699).

What changed: `layers.json` `pinned.control.tag` `v0.2.1` to `v0.3.0`; `package.json` gains `fleet:patch` (spelled like its neighbours, without `--import tsx`, which #4699 removed) and `fleet:patch-schedule` (beside `fleet:auto-off-schedule`). Nothing is installed or run: the timer install is `orchestrator`'s, in #4449.

Measured: `git ls-remote --tags https://github.com/a11ign/control.git` lists `v0.3.0` (`9c9a416b9`, the row's tag) and also `v0.3.1`; the row and its Acceptance name `v0.3.0`, so that is what is pinned. A move to `v0.3.1` is a follow-up for `product-manager` to rule on.

platform: nothing built; two scripts and one pin.

Acceptance:
```bash
bash -c 'git grep -nE "\"fleet[:]patch\": \"node( --import tsx)? packages/control/src/fleet-playbook[.]ts --playbook=patch[.]yml\"" -- package.json'
bash -c 'git grep -nE "\"fleet[:]patch-schedule\": .*patch-schedule[.]yml" -- package.json'
bash -c 'git grep -n "\"tag\": \"v0.3.0\"" -- layers.json'
```

Closes: #4704

🤖 Generated with [Claude Code](https://claude.com/claude-code)
