The nightly corpus-release unit's `lab:fetch` finds the lab: the unit points Ansible at a copy of the control plane's installed inventory kept outside every checkout (`~/.config/a11ign/inventory.yml`, beside `fleet.env`), refreshes that copy read-only from the control plane at the start of each firing, and its comment names the inventory and where it comes from.

Option 2 of the row (a copy of the inventory on the agents host, kept out of git). Option 1 (run the fetch on the control plane) would leave the archive there, while `corpus:release` runs here under the leads account.

Closes a11ign/a11ign#5518

Acceptance: `node --test --experimental-strip-types packages/guards/src/corpus-release-inventory-refresh.test.ts`

The test RUNS the unit's own refresh line (the `$$` unescaped) in a temp HOME against a stub `ssh`: a good read lands at the `ANSIBLE_INVENTORY` path at mode 0600 with no `.new`; a failed read and an EMPTY read both leave yesterday's copy standing; the host comes from `A11Y_CONTROL_HOST_FILE` and the one file asked for is `/etc/a11ign/inventory.yml`; and where `ansible-inventory` is installed, Ansible resolves `a11y_lab` from the written copy. Mutation checked: removing the `test -s` empty-read guard from the unit fails the empty-read test.

Outside-Region: none.

Platform: Ansible's own `ANSIBLE_INVENTORY` (replaces `ansible.cfg`'s source list) and `ssh`; `/etc/a11ign` is root-owned and this account has no sudo, so the control layer's installed-path option is not available on this host. `fleet:inventory-install` was tried and refuses (control plane on a different commit than control's checkout), and it is a deploy-class wrapper a unit must not run.

Host readings (the firing, `Result=success`) are `orchestrator`'s, per the row's Acceptance. Host state changed for this PR: `~/.config/a11ign/inventory.yml` (0600) placed on the agents host from the control plane's `/etc/a11ign/inventory.yml`; the installed unit under `~/.config/systemd/user/` needs the repository copy installed and `systemctl --user daemon-reload`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
