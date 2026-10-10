`layers.json` `pinned.control.tag` moves `v0.3.3` to `v0.3.5`, the control tag whose commit contains control#40 (`6a3d38c`), which makes `post-qualification-status.ts` import `gates/qualification-status.ts` (#4787, step 4 of #4519). One line; lab stays at `v0.1.27`, the tag step 2 pinned.

Measured: `git -C /home/agent/repos/control show v0.3.5:src/post-qualification-status.ts | grep -c 'gates/qualification-status[.]ts'` prints `3`, and the same against `v0.3.3` prints `0` (red before, green after). `git -C /home/agent/repos/control merge-base --is-ancestor 6a3d38c v0.3.5` exits 0; `v0.3.3` and `v0.3.4` do not carry it. `git ls-remote --tags https://github.com/a11ign/control.git` lists `247c09f2e6baa5baba8738b4cdf3991848f48286 refs/tags/v0.3.5` (and `e4389dd94e9c2d0734c255c8f20a0812afbbfa98 refs/tags/v0.3.3`).

Acceptance: bash -c 'git -C /home/agent/repos/control fetch -q origin --tags && git -C /home/agent/repos/control show "$(jq -r .pinned.control.tag layers.json):src/post-qualification-status.ts" | grep -q "gates/qualification-status[.]ts"'

Closes #4787
