## What

A new guard, `packages/guards/src/docs-release-pin-currency.test.ts`: a tracked `README.md`, `docs/*.md` or `docs/adr/*.md` that pins an a11ign release more than one minor behind the newest `a11ign@x.y.z` tag fails, naming file:line, the pinned release and the newest. Tags are read locally (`git for-each-ref`, annotated tags peeled), no network.

- **Pin vs history, by form:** a pin is a `uses: a11ign/a11ign@<40-hex>` line (the SHA decides; the `# ... a11ign@0.5.3` comment is a label, not a second pin) or an install command (`npx`/`pnpm dlx`/`npm i`...) naming `a11ign@x.y.z`. Prose such as "`a11ign@0.1.0` depends on ..." matches neither. Pinned by a named case.
- **No tags → `CANNOT TELL`**, naming `History: full` / `git fetch --tags`; it fails, it does not pass. A `uses:` SHA no release tag points at also fails (its age cannot be told).
- **Reader injected:** real files/tags by default, fixtures in the cases.

## Evidence

- Acceptance (measured, this head): 11 tests, 0 failed, `VERDICT pass: 11 tests in 1 file`.
- Guard against today's docs on `main` (newest tag `a11ign@0.5.4`; README.md, docs/github-action.md, docs/try-it.md pin 0.5.3): the real-tree test passes, and asserts it found pins.
- Mutation, both directions (restored byte-identical, `diff` clean): fault never fires -> 3 tests fail; always fires -> 6 fail; install pattern widened to read history as a pin -> 2 fail.
- `pnpm run lint` on the file, `pnpm run typecheck`: clean.

platform: git tags and `for-each-ref` already answer "newest release"; nothing built.

Acceptance:

```bash
node packages/guards/src/assert-glob-not-empty.mjs "packages/guards/src/docs-release-pin-currency.test.ts" --min=1 --run --runner=rstest
```

Closes #4508

🤖 Generated with [Claude Code](https://claude.com/claude-code)
