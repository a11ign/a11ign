---
"a11ign": patch
"@a11ign/judge": patch
"@a11ign/scorer": patch
---

The three packages that build with `@a11ign/toolchain` move from 0.10.0 to 0.10.2, the first release that exports `./refusal-owners-are-open`, and the core reads the refusal-owner reader from there instead of its own copy (agent-org#1497). A devDependency only: what each package exports and ships is unchanged.
