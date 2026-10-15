---
"a11ign": patch
---

A sign-in now writes its loop's trail to the file named by `A11Y_AUTH_TRAIL_FILE`, for `login --check` and for an authenticated scan: each screen the loop met and the control it pressed, with the outcome, and never a typed value (#5510, under #5495). Unset, no file is written.
