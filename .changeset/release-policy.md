---
"a11ign": patch
---

The README now says which channel is stable (`latest`), what a version number promises before 1.0 (a breaking change to a flag, an output field or an Action input is a minor with a Migration note; a fix is a patch), and that the changelog is the GitHub Release for each `a11ign@<version>` tag. `docs/release-policy.md` checks that rule against the last ten releases, and the README keeps SHA-pinning as the recommendation for the Action because the `v0` tag moves on every promotion (#4527).
