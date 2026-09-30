---
"@a11ign/lab": patch
---

**`declared-walk-scope.test.ts` no longer pins `findPackageJSON`'s read set to one Node minor's output (#2813).** On 22.23.3 `module.findPackageJSON("./rules.ts", …)` also reads the file the specifier resolves to, and the test expected exactly `['packages/judge']`, so every full-suite merge group failed on the runner's new Node. The expectation is now "the walked directory, and at most the resolved file"; a read of a sibling package, the repo root or another file in the package still fails, pinned by a direct test of the predicate. `walk-scope.mjs` and the declaration format are unchanged. Only the test's expectation moved.
