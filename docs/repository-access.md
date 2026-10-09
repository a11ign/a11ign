# Repository access — who holds what on each code repository

ADR 0039, item 7 (#69; row #3124). **The declaration is [`repository-access.json`](./repository-access.json)**,
pinned by `packages/lab/src/packaging/layer-repository-access.test.ts`. This page says what the model is, why,
and who may change GitHub to match it.

## The model

- **`DanBeckDev` is the only `admin`**, on every code repository.
- **No agent account is `admin` anywhere.** The agent accounts are `a11ign-ai-workers`, `a11ign-ai-leads`,
  `a11ign-ci` and `a11ign-bot`; each holds `write`. An agent with admin can edit the ruleset and classic
  protection of the repository whose review requirement `.claude/rules/main-review-requirement.md` says nobody
  may walk past, and the admin-only `branches/main/protection` read then answers as that agent, which collapses
  *read the protection* and *be exempt from it* into one thing.
- **`Cemmaw` holds `write` on the tracker and no direct grant (`none`) on the others.** `none` means no
  collaborator entry; on a public repository the account can still read it.
- **The code repositories** are every `repo` of `.agent-org/project.json`'s `code` array, plus
  `a11ign/screenreader-worker`, which exists before it is declared there (#2701). A test pins the declaration's
  key set equal to that union.
- **`a11ign/.github` is the exception to "each agent holds `write`" (#4417).** Read live 2026-10-09 with
  `gh api repos/a11ign/.github/collaborators --jq '.[]|[.login,.role_name]|@tsv'`: `a11ign-ai-workers` and
  `a11ign-ai-leads` hold `write`, and `a11ign-bot` and `a11ign-ci` hold `read` (with `DanBeckDev` at `admin`).
  `Cemmaw` has no collaborator entry, so `none`; the per-user `permission` endpoint reports `read` for the account
  because the repository is public, which is not a grant. Read as `a11ign-ai-workers`, so this is the list as
  that account sees it, a reading and not a decision that `read` is the level the two accounts should hold.

## The `bots` team

`bots` is an org team attached to the layer repositories, and it is how the agent accounts reach them. **The tree
never named it before this page** (0 references, ADR 0039, item 7, reading 4); it was live GitHub state only.

- **The level it must hold on a layer is `push` (GitHub's name for `write`), never `admin`.**
- **Read at filing (2026-10-03), it held `admin` on `a11ign/screenreader-worker`**, which is why all four agent
  accounts were `admin` there. **Standing reading, 2026-10-05 (#3587): no difference remains.** The chairman's
  session set `bots` to `push` on `screenreader-fleet`, `documents`, `control` and `lab` (`admin` before, the same
  class: every split repository was created at `admin`), `screenreader-worker`, `toolchain` and `agent-org` already
  being `push`; the live collaborators read is green across all six code repositories. The `bots` team level itself is
  readable only with org admin (a non-admin token gets 404), so the chairman's read-back on #3587 is the evidence for it.
- **The team holds NO level on `a11ign/.github`** (declared as `teams.bots.exceptions` in
  [`repository-access.json`](./repository-access.json); ceo's ruling 2026-10-09). That repository holds the org-wide
  Octo STS policies: the reviewer account reads it and does not write, and the lead and worker accounts hold their own
  `write` grants, so the team is not needed there. Raising it to `push` would be an org-admin act and is not asked for.
- The team's level on the tracker is its own and is not changed: an org-level `bots` change was rejected in the
  ADR because it would move the tracker's permission too.

## Who may edit it

**Editing a team's level or a collaborator's permission is an org-admin act, and the org admin is the chairman.**
No agent session performs it, and this row writes only the target.

**The downgrade of `bots` from `admin` to `push` on `a11ign/screenreader-worker` is asked of him ONCE** (`ceo`'s
ruling on #2701): not before the throwaway measurement on the item-5 row is posted, so that one act carries both.
Until then the live read below is EXPECTED to differ on that repository.

## The live read

```bash
A11Y_CHECK_REPO_ACCESS=1 pnpm exec tsx --test packages/lab/src/packaging/layer-repository-access-live.test.ts
```

It reads `repos/<r>/collaborators` for each declared repository and prints each difference from the declaration
by account. **It is opt-in and read-only, and it is not part of the row's Acceptance command** (a job with no
token cannot ask). Asked, only a full match answers: a difference and a repository it could not read
(`CANNOT_TELL`) are both red, and an unreadable repository is never a pass.

**What it certifies is the collaborator list as the asking account sees it.** It does not read the `bots`
team's own level (`repos/<r>/teams`); that is the figure the chairman edits, so read it there after the edit.

## What is not here

The `gh` wrapper and the git credential helper name no repository (the test pins it with a positive control that
they do name accounts), so a new repository needs no change to either. The `host-units.mjs` sentence
"write, not admin" (about `a11ign-ai-leads`) is read as text by the test and agrees with the declaration; that file
lives in `a11ign/agent-org` and is edited there, never here.
