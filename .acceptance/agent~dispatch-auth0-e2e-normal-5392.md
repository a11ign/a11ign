Adds only this file. The row (a11ign#5392) dispatched `auth0-e2e.yml` in a11ign/auth-capture-check twice on `1a8f095f63acf4e7950782cf986d9f62e31ef578`, once normal ([38744450093](https://github.com/a11ign/auth-capture-check/actions/runs/38744450093), failure: the heard-heading check missed NVDA's `a 11y-witness`, filed as a11ign#5530) and once with `falsifier: true` ([38744504455](https://github.com/a11ign/auth-capture-check/actions/runs/38744504455), success: `FALSIFIER HELD`), and reported both on a11ign#5293 ([comment](https://github.com/a11ign/a11ign/issues/5293#issuecomment-6193642759)). No product file changes; the deliverable is that comment.

- **Positive control:** the same read with the cutoff moved to `2026-10-15T14:00:00Z` finds no comment and exits 1; the comment was posted at 13:5xZ, after the row's cutoff of 12:00Z.
- **Public read:** a11ign/a11ign is public, so the check needs no credential.

Acceptance:
node -e "fetch('https://api.github.com/repos/a11ign/a11ign/issues/5293/comments?per_page=100&since=2026-10-15T12:00:00Z').then(r=>r.json()).then(c=>process.exit(c.some(x=>x.created_at>'2026-10-15T12:00:00Z'&&/actions\/runs\/[0-9]+/.test(x.body)&&/falsifier/i.test(x.body))?0:1))"
