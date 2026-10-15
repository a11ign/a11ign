The nightly corpus-release unit's `lab:fetch` finds the lab: the unit points Ansible at a copy of the control plane's installed inventory kept outside every checkout (`~/.config/a11ign/inventory.yml`, beside `fleet.env`), refreshes that copy read-only from the control plane at the start of each firing, and its comment names the inventory and where it comes from.

Option 2 of the row (a copy of the inventory on the agents host, kept out of git). Option 1 (run the fetch on the control plane) would leave the archive there, while `corpus:release` runs here under the leads account.

Closes a11ign/a11ign#5518

Acceptance: `node -e "const s=require('fs').readFileSync('.agent-org/units/a11ign-corpus-release-nightly.service','utf8');if(!/^Environment=ANSIBLE_INVENTORY=%h\/\.config\/a11ign\/inventory\.yml$/m.test(s)||!/^ExecStartPre=-.*cat \/etc\/a11ign\/inventory\.yml/m.test(s))process.exit(1);console.log('UNIT-DECLARES-INVENTORY')"`

Outside-Region: none.

Platform: Ansible's own `ANSIBLE_INVENTORY` (replaces `ansible.cfg`'s source list) and `ssh`; `/etc/a11ign` is root-owned and this account has no sudo, so the control layer's installed-path option is not available on this host. `fleet:inventory-install` was tried and refuses (control plane on a different commit than control's checkout), and it is a deploy-class wrapper a unit must not run.

Host readings (the firing, `Result=success`) are `orchestrator`'s, per the row's Acceptance. Host state changed for this PR: `~/.config/a11ign/inventory.yml` (0600) placed on the agents host from the control plane's `/etc/a11ign/inventory.yml`; the installed unit under `~/.config/systemd/user/` needs the repository copy installed and `systemctl --user daemon-reload`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
