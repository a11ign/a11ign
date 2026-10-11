THROWAWAY, for a11ign/agent-org#970 done-when 2: `pnpm-lock.yaml` here omits the root importer's `@changesets/cli`, with `package.json` untouched, so `release-dry-run` must be RED. Not for review, never to merge; closed once its check run is linked from a11ign/a11ign#5140.

Acceptance: bash -c 'git diff --quiet HEAD^1 HEAD -- package.json'

Draft-because: throwaway proof of a red release-dry-run for agent-org#970, do not review or merge

Closes: none -- a throwaway pull request that proves done-when 2 of a11ign/agent-org#970 and is closed unmerged
