Adds `docs/release-policy.md`: the two channels and what promotes `latest` (from `release.yml`'s header), the pre-1.0 sizing rule, and where the changelog is (the GitHub Release per `a11ign@<version>` tag; the packages' `CHANGELOG.md` lags by design, `packages/cli/CHANGELOG.md` ends at 0.2.7). The rule is checked against the ten `a11ign` releases 0.3.0 to 0.5.4, read from `gh release view`, one verdict per release in a table: none was mis-sized, so no row is filed. The one borderline is 0.5.3 (a new summary-prose line, patch), noted in the table. The `**Migration**` label is new with this page and not retrofitted: 0.3.0 and 0.4.0 carry the same content unlabelled.

Linked from `packages/cli/README.md` by absolute GitHub URL and from the root README's release-tag paragraph, which also keeps SHA-pinning as the recommendation for the Action (`v0` moves on every promotion, and a 0.x minor may change an input or default). Patch changeset for `a11ign`. I did not add a line to `docs/README.md`'s index, which is outside the row's Region.

Verification: both Acceptance commands pass as written. `pnpm run verify -- --draft-body=<this body>` at this head: changed, ts, changeset, ownedPaths PASS; python and rulesFitness NOT-NEEDED. It says the affected set passed against origin/main; the tree-wide guards run in CI only. No fleet or lab command was run.

platform: none needed, prose only.

Acceptance:
```bash
bash -c 'test -s docs/release-policy.md && grep -q "^## Channels" docs/release-policy.md && grep -q "^## Version numbers" docs/release-policy.md && grep -q "^## Changelog" docs/release-policy.md'
grep -q 'release-policy.md' packages/cli/README.md
```

Closes #4527

🤖 Generated with [Claude Code](https://claude.com/claude-code)
