---
---

This merge is the first release under release channels (#3778, outcome 3 of #3911): `release.yml` publishes the pending changesets to the `next` dist-tag at once, with no typed confirmation, and `latest` moves to that version only after the fleet's `qualification` status is green (#3946, #3947). The note bumps nothing itself; the versions that publish are the pending `minor` changeset for `a11ign`, `@a11ign/evidence`, `@a11ign/judge` and `@a11ign/scorer` (each to `0.3.0`) and the `patch` ones for `a11ign`.
