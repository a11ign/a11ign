---
"@a11ign/evidence": minor
"@a11ign/judge": minor
"@a11ign/scorer": minor
"a11ign": minor
---

`exports` and `bin` now point at `.mjs` (and `.d.ts` for types) where they pointed at `.js`, because the packages are built by Rslib instead of `tsc --build`: a deep import of `<package>/dist/<file>.js` stops resolving, and the CLI's `bin` is `./dist/cli.mjs`, so this is `minor` (a breaking change on a 0.x package) for each of the four. The CLI is also now one bundle that inlines `@a11ign/documents` (and the `pdf-lib` behind it) and `yaml`, so a consumer no longer installs them (#3580, ADR 0043).
