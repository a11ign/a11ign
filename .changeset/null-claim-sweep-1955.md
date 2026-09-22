---
---

Comment-only. `set-display-mode.ps1`, `display.yml` and `display-mode.test.ts` stated the #1955 cause as
"every NULL-device GDI call on this fleet refuses". #1968 measured that false -- PowerShell binds `$null`
to a `string` parameter as `[string]::Empty`, so those calls asked for a device NAMED `""` and the
refusals are what any Windows box does. #1968 corrected the script's header and left the same claim
standing in four other places; this removes them. No executable line changes, in any of the three files.
