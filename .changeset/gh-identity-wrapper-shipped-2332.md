---
"@a11ign/agent-org": patch
---

**The `gh` identity wrapper, its human-account exception list and the git credential-helper wiring are now in the repository, and `host:check` fails when the host drifts from them.**

**Why.** The chairman ruled (#1950): no agent acts as them unless something explicitly asks. `~/.local/bin/gh` was an allow-list for the workers account, so every workspace it did not list fell through to the chairman's admin login, and `git push` was a second, unwrapped door because `~/.gitconfig` named the real `/usr/bin/gh` as its credential helper. The policy existed only on the host, so no review had ever read it.

**What changes.**
- `packages/agent-org/host/gh` is the wrapper as the host now runs it (inverted: an agent workspace gets `a11ign-ai-workers` unless its id is in the exception list; a missing workers account refuses). `A11Y_GH_REAL` and `A11Y_WORKERS_DIR` override its two host paths so a test runs it against a stub.
- `packages/agent-org/host/gh-human-account-workspaces.txt` holds the one exception — `w6 w2 w5`, temporary — with each id's role.
- `host:install` copies the wrapper, the list and `~/workers/README.md` (atomically); `host:check` reports NOT INSTALLED / DIVERGED for each, and DIVERGED for `~/.gitconfig` when the github.com credential helper is not the wrapper (a finding `host:install` does not fix). A global `user.name`/`user.email` that is a person's is a NOTE in the report and in `--json` `notes`, never a finding.

**What does not.** A copy and not a symlink, per `ceo`. `gh-real` and `herdr` stay unowned. Nothing here edits `~/.gitconfig`.
