`acceptance-sweep.yml:101` now reads `git diff --name-only --no-renames HEAD~1 HEAD`, so the lab's `changed-files-renames.test.ts` (#939) has no bare `--name-only` to flag in the file. One line changed; `ci.yml:726` (the allowlisted `/tmp/changed.txt` feed) is untouched.

- **Line changed:** `-  if git diff --name-only HEAD~1 HEAD | grep -qvE …` / `+  if git diff --name-only --no-renames HEAD~1 HEAD | grep -qvE …`.
- **Why it is also the safer reading for this guard:** the step refuses a commit touching a path outside `.acceptance/`; with a bare `--name-only` a rename from another directory into `.acceptance/` would list only the destination and pass.
- **Mutation check (measured):** with the fix the Acceptance exits 0; with ` --no-renames` removed from line 101 it exits 1 (the guard fires); restored from a copy, `diff` identical.
- The lab test itself is not run here (it lives in the lab repo; worker-4569 reads it after `CORE_REF` moves past the merge, per the row's Done-when 2).

Acceptance: bash -c '! git grep -n -- "--name-only" -- .github/workflows/acceptance-sweep.yml | grep -v -- "--no-renames"'

Closes #4608

🤖 Generated with [Claude Code](https://claude.com/claude-code)
