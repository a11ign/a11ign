---
"@a11ign/worker-fleet": patch
---

Fixes provisioning against the real fleet: the display-mode step (`packages/control/ansible/roles/worker/tasks/display.yml`)
used to call `EnumDisplaySettings`/`ChangeDisplaySettings` directly over the SSH connection Ansible uses,
which failed on every worker with "EnumDisplaySettings could not read the current display mode" (#1567) --
an SSH-spawned PowerShell process does not attach to the interactive window station those GDI calls need,
regardless of which account runs it. The P/Invoke logic now lives in a new shipped script,
`src/provisioning/set-display-mode.ps1`, invoked through the same interactive-scheduled-task mechanism
`provision.yml` already uses for `provision-nvda-worker.ps1`. `worker_display_mode` (width/height) is
unchanged; anyone driving fleet provisioning through this package gets the working display-mode step
instead of one that fails on first contact with a real worker.
