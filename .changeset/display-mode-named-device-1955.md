---
"@a11ign/worker-fleet": patch
---

**`set-display-mode.ps1` now names the display device on every GDI call instead of asking Windows to
pick the default one, and reports enough on failure to tell three causes apart.**

**Why.** Provisioning failed the display-mode step on 10 of 10 workers (#1955). The call that failed was
`EnumDisplaySettings($null, ...)` -- and PowerShell binds `$null` to a `string` parameter as
`[string]::Empty`, so what Windows was actually asked for was a display device NAMED `""`. No machine has
one. That is the whole of the ten-host failure: a PowerShell binding trap, not a property of these
workers. The script also wrote one sentence when it failed, so the outcome could not be told apart from
landing in session 0 or on a non-interactive desktop.

**What changes.**
- The primary display is resolved through `MonitorFromPoint` + `GetMonitorInfoW`, and that device name
  is passed to `EnumDisplaySettingsW`. Measured on a real worker: the mode then reads.
- `ChangeDisplaySettings` becomes `ChangeDisplaySettingsEx`, the form that can take a device name.
- Where the script means a NULL device it now passes `[NullString]::Value`, the only value that reaches
  a `string` parameter as a genuine NULL.
- On failure the script reports the session id, the window station and desktop names, the
  `EnumDisplayDevices` enumeration and `GetSystemMetrics`. The Win32 error is printed and explicitly
  marked unreliable, because none of these functions is documented to set one.
- An empty `EnumDisplayDevices` enumeration is reported beside a same-API positive control -- the same
  function asked again with the resolved device name -- so "no display devices" and "this API refuses
  nameless calls here" are distinguishable in the transcript rather than conflated.

**What does not.** `worker_display_mode` (width/height) is unchanged, and so is the interactive
scheduled-task route #1833 introduced -- this changes which arguments the script passes, not how it runs.
