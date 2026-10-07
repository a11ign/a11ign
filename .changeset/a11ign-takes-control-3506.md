---
---

`packages/control` left the workspace for `a11ign/control`, which this repository now takes as a pinned tag (#3506), so no published package here gains or loses anything. The one manifest that changed is `packages/guards/package.json`, which drops its `@a11ign/control` devDependency (a test now imports the laid copy by path): `guards` ships nothing a consumer installs.
