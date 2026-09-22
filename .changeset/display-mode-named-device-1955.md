---
"@a11ign/worker-fleet": patch
---

**`set-display-mode.ps1` now names the display device on every GDI call instead of asking Windows to
pick the default one, and reports enough on failure to tell three causes apart.**

**Why.** On the real fleet every call that passed `NULL` for the device refused -- `EnumDisplayDevicesA`,
`EnumDisplayDevicesW` and `EnumDisplaySettingsW` alike, with a correct `cb` and a correct `dmSize` --
while every call that named `\\.\DISPLAY1` answered (#1955). The script previously failed on the first
`EnumDisplaySettings($null, ...)` and wrote one sentence, so a failure could not be told apart from
landing in session 0 or on a non-interactive desktop. Provisioning failed the display-mode step on
10 of 10 workers because of it.

**What changes.**
- The primary display is resolved through `MonitorFromPoint` + `GetMonitorInfoW`, and that device name
  is passed to `EnumDisplaySettingsW`.
- `ChangeDisplaySettings` becomes `ChangeDisplaySettingsEx`, the form that can take a device name.
- On failure the script reports the session id, the window station and desktop names, the
  `EnumDisplayDevices` enumeration and `GetSystemMetrics`. The Win32 error is printed and explicitly
  marked unreliable, because none of these functions is documented to set one.
- An empty `EnumDisplayDevices` enumeration is now reported beside a same-API positive control -- the
  same function asked again with the resolved device name -- so "no display devices" and "this API
  refuses nameless calls here" are distinguishable in the transcript rather than conflated.

**What does not.** `worker_display_mode` (width/height) is unchanged, and so is the interactive
scheduled-task route #1833 introduced -- this changes which arguments the script passes, not how it runs.
