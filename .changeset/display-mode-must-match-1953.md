---
"@a11ign/nvda-worker": patch
"@a11ign/worker-fleet": patch
"@a11ign/evidence": patch
---

**The worker reports the screen it captures on, and `MUST_MATCH` compares it (#1953).** `fleet:status`
printed "fleet CONSISTENT across 10 of 10 -- these workers are interchangeable for capture" at
2026-09-22T18:21Z over a fleet running 1024x768 on five guests and 640x480 on the other five. That was a
uniformity claim over a property nothing checked: `MUST_MATCH` had nine fields and none was the display,
and it could not have had one -- `/health`'s `environment` reported the browser, the screen reader, the
OS, the architecture, the protocol, the profile, the settings and the provision stamp, and nothing about
the screen. `provisionRevision` does not cover it: the provisioning script writes that stamp itself, so
it records which provisioning RAN rather than what it achieved, and a guest whose display-driver install
failed still gets the new stamp.

`displayMode` is read from the worker's own process (`SystemInformation.PrimaryMonitorSize`, which is
`GetSystemMetrics(SM_CXSCREEN/SM_CYSCREEN)`), because that is the only place it can be read honestly: a
display call over the fleet's SSH path lands in session 0, which has no interactive window station and
answers for no desktop (#1955), while the `a11ysrv` task runs with `logon_type: interactive_token`. It is
not memoised -- the display changes under a running worker, and noticing that is the point.

**NOT a capture-cache-key input, deliberately.** `environmentKey` is an allowlist and this field is not on
it, so **no cached capture is invalidated and no recapture is owed**. Whether the display belongs in the
key is a question this raises and does not answer; #1561 pins the capture WINDOW and carries its own
protocol bump for that reason.
