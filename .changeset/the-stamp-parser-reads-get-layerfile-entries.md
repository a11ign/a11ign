---
---

`stampEnvironmentFiles` in `scripts/test-support/stamp-files.ts` reads the `(Get-LayerFile -Layer '<layer>' -Relative '<path>')` entry the provision stamp now lists first, so the first of its five hashed files no longer drops out of the list (#4579). Test support only; nothing published changes.
