---
"@a11ign/screenreader-worker": minor
---

**`@a11ign/nvda-worker` is now `@a11ign/screenreader-worker` (#2885, #69, the split's R1).** ADR 0036 named the new name and it was never carried out on the registry. npm cannot rename a package, so this release publishes the new name as a FIRST publish and the old name is deprecated afterwards with a pointer here (an owner action: the trusted publisher cannot deprecate). Every importer in the workspace (`cli`, `lab`, `worker-fleet`, the root manifest) and every non-document file naming the old package now names the new one; the package's directory is still `packages/nvda-worker/` and the `a11ign-nvda-worker` bin is unchanged, both being M1's (#2701). Pinned by `package-rename-nvda-worker.test.ts`.
