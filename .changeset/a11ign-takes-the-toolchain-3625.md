---
---

The three packages that build with `@a11ign/toolchain` declare it at the registry version `0.1.2` instead of a workspace link, because the toolchain is released from its own repository (#3625). A devDependency only: what each package exports and ships is unchanged.
