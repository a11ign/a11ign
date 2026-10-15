The `changeset` check's refusal now ends with one marker line, `Cleared-by: review` when the owed entries are carried and only an approval on the head is missing, `Cleared-by: edit` when anything else is owed. `clearedBy` asks `settleRefusal` itself with an approval on the head assumed, so the marker cannot drift from what settles. The `dependency` step in `ci.yml` re-emits it as an `::error` annotation, the one route a check run's reader can see (`docs/github-action.md`: the job summary is on neither API).

- **(a)** a 0.x minor with every owed entry carried and no approval prints `Cleared-by: review` and fails; on `main` there is no such line.
- **(b)** the same with the entry not carried prints `Cleared-by: edit`, with or without an approval on the head.
- **(c)** an approval at the head prints the `ACCEPTED` line and no marker.
- **(d)** an approval at an earlier head still prints `Cleared-by: review`.
- **(e)** the `dependency` step's shell, taken out of the parsed `ci.yml` and run under `bash -e` against the real `check` in a throwaway repository, annotates `::error title=changeset::Cleared-by: review` (or `edit`) and still exits 1; a settled head annotates nothing, exits 0 and sets `settled=true`; a `check` that crashes and prints no marker is annotated with nothing and still exits non-zero.

Acceptance: pnpm exec rstest run --config=scripts/rstest/rstest.config.ts --include packages/guards/src/dependency-changeset.test.ts

Mutation: `clearedBy` forced to always `edit` fails 3 tests; forced to always `review` fails 2; each restored byte-identical.
Mutation (the step, `ci.yml` restored byte-identical after each): the annotation never emitted fails 2 tests; always emitted `Cleared-by: review` fails 3; the status swallowed (`[ "$status" = 0 ] || exit "$status"` replaced by `true`) fails 3.

Live read: NOT made before merge. This `feat` pull request is not a dependency pull request, so its `changeset` job is skipped; the first live annotation will be on a dependency pull request after merge (a11ign#5528 is the standing one). The step is exercised by (e) in its place.
