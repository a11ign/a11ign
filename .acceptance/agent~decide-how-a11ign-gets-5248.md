ADR 0045 gains a section, "How the core gets agent-org", that proposes how a11ign gets agent-org at a declared version: a published `@a11ign/agent-org` declared in `package.json` and bumped by Dependabot, the five ordered cuts, and the counts of project names in the tool's source. Docs only: the section is prose for `ceo`'s ruling in review, and the cuts are not in this pull request.

**Measured at this head** (2026-10-13; a11ign `5883e11ed`, agent-org `v0.195.2` = `b7f44578`, the newest stable tag on `git ls-remote --tags --refs`):
- `git grep -c 'run: node scripts/agent-org-newest-tag.ts' -- .github` sums to 38 steps in 17 workflow files.
- `git grep -l 'agent-org-newest-tag' -- .github scripts` lists 29 files: the 17 workflows, the scripts that name it, and the script itself.
- `git grep -l -E '\b(toolModule|toolPath|toolUrl)\('` lists 3 files: two workflow comments and one test. No non-test code reads the tool by path.
- `npm view agent-org` returns an unrelated Nx placeholder at `0.0.0`; `npm view @a11ign/agent-org` returns 404.
- agent-org's `package.json` declares 10 `exports` subpaths; its `.github` has no npm publish step.
- Project names in agent-org at `v0.195.2`, `git -C <agent-org> grep -c -i 'a11y-witness' v0.195.2 -- <paths not matching \.test\.|fixtures|^docs/|\.md$>`: 17 files and 23 lines. The wider pattern `a11y-witness|a11ign/a11ign|a11ign-bot|\.a11ign`, same filter: 223 files.

**Mutation:** not applicable. The change is prose and adds no code path; the Acceptance is a grep for a named heading.

**Checks run:** the Acceptance grep exits 0. `pnpm exec rstest run --config scripts/rstest/rstest.config.ts` over `tracked-prose-leak-guard.test.ts`, `docs-release-pin-currency.test.ts`, `docs-release-pin-currency.real-tree.test.ts` and `dora-declaration.test.ts`: `VERDICT pass: 49 tests in 4 files`.

**Not run:** the cuts' own checks; they belong to their own rows, and this change adds no code for them to test.

no-release: a document, shipped nowhere.

Acceptance: bash -c 'git grep -q "^## How the core gets agent-org" -- docs/adr/0045-a-repository-uses-another-only-through-its-published-package.md'

Closes #5248
