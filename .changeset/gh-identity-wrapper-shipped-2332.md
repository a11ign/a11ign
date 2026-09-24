---
"@a11ign/agent-org": patch
---

**The `gh` identity wrapper, the leads list and the git credential-helper wiring are now in the repository, `host:check` fails when the host drifts from them, and no unit may act as the person.**

**Why.** The chairman ruled (#1950): no agent acts as them unless something explicitly asks. `~/.local/bin/gh` was an allow-list for the workers account, so every workspace it did not list fell through to the chairman's admin login, and `git push` was a second, unwrapped door because the global gitconfig named the real `/usr/bin/gh` as its credential helper. The policy existed only on the host, so no review had ever read it. The chairman has since created `a11ign-ai-leads` (write, not admin; its own GraphQL pool) and the host routes `w6 w2 w5` there, so the repository ships THAT wrapper, with no human-account exception.

**What changes.**
- `packages/agent-org/host/gh` is the wrapper as the host now runs it: an agent workspace gets `a11ign-ai-leads` when it is in the leads list and `a11ign-ai-workers` otherwise; a missing config refuses and never falls through to the person. `A11Y_GH_REAL`, `A11Y_WORKERS_DIR` and `A11Y_LEADS_DIR` override its host paths so a test runs it against a stub.
- `packages/agent-org/host/gh-leads-workspaces.txt` (installed as `~/leads/workspaces.txt`) holds `w6 w2 w5` with each id's role. `gh-human-account-workspaces.txt` is gone.
- `host:install` copies the wrapper, the list and `~/workers/README.md` (atomically); `host:check` reports NOT INSTALLED / DIVERGED for each, and DIVERGED for the global gitconfig when the github.com credential helper is not the wrapper (a finding `host:install` does not fix). A global `user.name`/`user.email` that is a person's is a NOTE in the report and in `--json` `notes`, never a finding.
- `a11ign-corpus-release-nightly.service` declares `GH_CONFIG_DIR=/home/agent/leads/gh` (`a11ign-ai-leads` has push on `a11ign/corpus-backups`), and its comment no longer argues for the person's account.
- `host:check` now refuses a shipped unit that reaches `gh` and declares no `GH_CONFIG_DIR`, and any unit that declares the person's config (`HUMAN_ACCOUNT_ALLOWED`, empty). A shipped unit that changes the account is no longer reported as installed identity the repository lacks.

**What does not.** A copy and not a symlink, per `ceo`. `gh-real` and `herdr` stay unowned. Nothing here edits the global gitconfig.
