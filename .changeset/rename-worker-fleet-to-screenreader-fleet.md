---
"@a11ign/screenreader-fleet": minor
---

**`@a11ign/worker-fleet` is now `@a11ign/screenreader-fleet` (#2887, #69, the split's R2).** ADR 0036 named the new name and it was never carried out on the registry. npm cannot rename a package, so this release publishes the new name as a FIRST publish and the old name is deprecated afterwards with a pointer here (an owner action: the trusted publisher cannot deprecate). Every importer in the workspace (`cli`, `lab`, the root manifest) and every non-document file naming the old package now names the new one; the package's directory is still `packages/worker-fleet/`, which is M2's (#2702). Pinned by `package-rename-worker-fleet.test.ts`.
