`release.yml`'s comment on the `decide` job said the verdict it reads counts only from `QUALIFICATION_WRITER`. After a11ign#5057 the decider counts two identities, `QUALIFICATION_WRITER` (the user account `a11ign-ai-leads`) and `QUALIFICATION_WRITER_APP` (the managers App, `a11ign-managers[bot]`), so the sentence was false. The comment now names both constants and says the verdict counts from the lab's own identities and from no other creator.

**What moved:** `.github/workflows/release.yml`, the comment above `name: release` only (three lines replaced by four, the last of them the rewrapped tail of the same sentence). No step, permission or trigger changes.

platform: nothing built; one comment reworded.

Acceptance: `bash -c 'git grep -q "QUALIFICATION_WRITER_APP" -- .github/workflows/release.yml && git diff origin/main --stat -- .github/workflows/release.yml | tail -1'`

## Evidence

Measured at this head: the Acceptance exited 0 and printed ` 1 file changed, 4 insertions(+), 3 deletions(-)`. Measured: the file with every `#` comment line removed is byte-identical to `origin/main`'s (`diff` empty), and `git diff -U0 origin/main` shows 0 changed lines that are not comments, so done-when 1 ("only comment lines changed") holds. The file still parses as YAML (`yaml.parse`).

The sentence is stated against the code, not inherited from the row: `scripts/release-reads-qualification.ts` exports `QUALIFICATION_WRITER = "a11ign-ai-leads"`, `QUALIFICATION_WRITER_APP = "a11ign-managers[bot]"` and `QUALIFICATION_WRITERS` of both (measured with `git grep -n QUALIFICATION_WRITER origin/main`, at `49a472684`), and #5057 is CLOSED.

Not measured: no workflow run; a comment changes none.

Closes #5067

Mutation: the Acceptance's grep notices its own target. At `origin/main` (`git grep -q "QUALIFICATION_WRITER_APP" origin/main -- .github/workflows/release.yml`) it exits 1, so the Acceptance fails there; at this head it exits 0. No guard was added, so there is no second direction.
