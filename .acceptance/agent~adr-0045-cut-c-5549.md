ADR 0045 D4 now says `ownedPaths` moves to the org side as an agent-PR check with no CODEOWNERS replacement (ceo, option 2, a11ign#5549); the job in `ci.yml` is untouched, because its receiver (a11ign/agent-org#1598) runs in shadow first.

- **Positive control:** at `origin/main` the row reads "**Replace** with CODEOWNERS review" and the command below exits 1; at this head it exits 0.
- **Not claimed:** the job is not deleted here, so row #5549's own Acceptance (`needs: [.*ownedPaths` gone from `ci.yml`) still fails at this head by design; this PR closes nothing.

Acceptance: git grep -q -F "Amendment 2026-10-16 (ceo ruling on a11ign#5549, option 2)" -- docs/adr/0045-a-repository-uses-another-only-through-its-published-package.md
