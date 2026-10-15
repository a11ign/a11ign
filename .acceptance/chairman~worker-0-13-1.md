The lockfile and `package.json` move `@a11ign/screenreader-worker` from `0.13.0` to `0.13.1`, and the guard that pins the consumed registry version moves with them. `screenreader-worker-extraction.test.ts` reads `pnpm-lock.yaml` and requires the entry to be a registry version carrying a sha512 integrity under every importer that declares it; it failed at `82343e42` only because its `CONSUMED_VERSION` still read `0.13.0`.

- **Real tree, green at this head:** the lockfile entry reads `0.13.1` with an integrity under the one importer `.`, and no pending changeset names the package in its frontmatter.
- **Positive controls, unchanged:** a `link:../nvda-worker` entry, a registry entry with no integrity or a placeholder one, and an absent entry are each refused naming what is wrong.

Acceptance: node --test packages/guards/src/screenreader-worker-extraction.test.ts
