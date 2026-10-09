---
"@a11ign/scorer": patch
---

The `a11ign-scorer-fetch-encoder` bin is built output, as ADR 0043 Decision 8 has every `bin`: `bin/fetch-encoder.mjs` (hand-written, importing `../dist/index.mjs`) is now `src/fetch-encoder.ts`, an Rslib entry that builds `dist/fetch-encoder.mjs`, and `package.json` names that file. The command does the same thing, and the tarball no longer carries a `bin/` directory. (#4275, sweep 3 of 3.) Nothing else published changes: the other converted files are `packages/cli/src/auth` fixtures and a hand-run spike, and `mjs-ratchet.baseline.json` fell from 56 files to 47 with six reasoned exceptions beside it.
