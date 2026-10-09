`scripts/release-tags-complete.ts` says why it spawns `npm`, so the lab's `no-npm-spawn.test.ts` can allowlist it (#4594).

- **The change:** a two-line `// STAYS npm` comment directly above the `npmCliInvocation` import, naming `no-npm-spawn.test.ts` as the pin and saying `npm view` reads the registry the consumer's `npm install` reads. No code changes.
- **The changeset:** `.changeset/release-tags-complete-says-why-it-keeps-npm.md`, empty front matter (a no-release note, as #4578 and #4579 wrote for non-published scripts).
- **Before the change** (`git show origin/main:scripts/release-tags-complete.ts | grep -c 'STAYS npm'`): `0`. The Acceptance grep fails there.
- **After the change:** the Acceptance grep exits 0; `node --import tsx -e "import('./scripts/release-tags-complete.ts')"` imports cleanly; `eslint` on the file reports 0 errors (one `no-magic-numbers` warning on the pre-existing `200` in the error message, unchanged by this diff).

Acceptance: bash -c 'grep -q "^// STAYS npm" scripts/release-tags-complete.ts'

Closes #4594
