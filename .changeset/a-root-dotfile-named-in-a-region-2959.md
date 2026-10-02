---
"@a11ign/agent-org": patch
---

**A root dotfile named in a Region is now a declaration (#2959).** `ROOT_FILE_CANDIDATE` began `[A-Za-z0-9_]`, so `.gitignore`, `.npmrc` and `.pnpmfile.cjs` could never match, `pr:open` refused a diff for the file the row's own Region named (#2897), and the claim-time overlap check was blind to a row that reserved one. A leading dot is now accepted with no extension required, still anchored to `origin/main`'s root listing, so a dotfile the root lacks, `scripts/.gitignore` and `./.gitignore` declare nothing. `region-paths.test.ts` pins both directions.
