`layers.json` `pinned.control.tag` moves `v0.3.3` to `v0.3.5`, the control tag whose commit contains control#40 (`6a3d38c`), which makes `post-qualification-status.ts` import `gates/qualification-status.ts` (#4787, step 4 of #4519). One line; lab stays at `v0.1.27`, the tag step 2 pinned.

Measured: `git -C /home/agent/repos/control show v0.3.5:src/post-qualification-status.ts | grep -c 'gates/qualification-status[.]ts'` prints `3`, and the same against `v0.3.3` prints `0` (red before, green after). `git -C /home/agent/repos/control merge-base --is-ancestor 6a3d38c v0.3.5` exits 0; `v0.3.3` and `v0.3.4` do not carry it. `git ls-remote --tags https://github.com/a11ign/control.git` lists `247c09f2e6baa5baba8738b4cdf3991848f48286 refs/tags/v0.3.5` (and `e4389dd94e9c2d0734c255c8f20a0812afbbfa98 refs/tags/v0.3.3`).

Why the command below is not the row's: the row's Acceptance reads `/home/agent/repos/control`, a checkout that exists on the agents host and not on a CI runner (`fatal: cannot change to '/home/agent/repos/control'`, exit 128, run 38047806493). `a11ign/control` is public, so this form reads the same file at the pinned tag from `raw.githubusercontent.com` and asserts the same line. Measured both ways from this worktree: exit 0 at `v0.3.5`; exit 1 with the tag replaced by `v0.3.3`, by `v0.3.4`, and by a tag that does not exist (404).

Acceptance: bash -c 'curl -fsSL "https://raw.githubusercontent.com/a11ign/control/$(jq -r .pinned.control.tag layers.json)/src/post-qualification-status.ts" | grep "gates/qualification-status[.]ts" > /dev/null'

Closes #4787
