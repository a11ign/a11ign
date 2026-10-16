## What

#5624 (epic #5602, home row a11ign/agent-org#1577): the Octo STS trust policy `outside-nightly`, which the outside home of the nightly org jobs (`outside-nightly.yml` in agent-org) mints its token with. The file is shaped like `project-ref-bump.sts.yaml` in agent-org, a workflow in another repository, so its subject is that repository's immutable ids pinned to `main`.

- `.github/chainguard/outside-nightly.sts.yaml` (new): `issuer`, `subject_pattern` for `a11ign/agent-org` on `main`, `claim_pattern` for `job_workflow_ref` `outside-nightly.yml@refs/heads/main` and `event_name` `schedule|workflow_dispatch`, and the five permissions the row names with what each is for.
- `packages/guards/src/force-rerun-triggers-cover-the-27.test.ts`: the `.github/chainguard` population pin moves from 7 to 8 and the total from 27 to 28, with the comment naming `outside-nightly`. The test reads the directory from the tree, so the new file is counted by it, and the pin is the author's to move in the same change.

**The dot in `outside-nightly.yml` is unescaped, on purpose.** The row's Acceptance is `grep -qF 'outside-nightly.yml@refs/heads/main'`, which an escaped `\.yml` cannot satisfy. An unescaped `.` matches any one character, so the pattern would also admit a lookalike file name on agent-org's `main`; the repository id and the `main` ref still bind it. The file's header says so.

## Evidence

- Acceptance, as written in the row, against the first version (escaped dot): exit 1. Against the file as it stands: exit 0.
- Guard tests reading `.github/chainguard/`: `packages/guards/src/force-rerun-triggers-cover-the-27.test.ts` failed before the pin moved (`.github/chainguard` had 8 files, expected 7) and passes after (5/5). `octo-sts-policies`, `nightly-reads-octo-sts` and `octo-sts-trusted-issuers` pass under `tsx --test` (22/22).
- `pnpm run test:org` after `pnpm run build`: 1392 tests in 101 files, 0 failed. Before the build, `judge-exports-on-disk` failed for want of `dist/`, which `pretest` builds.
- `pnpm run lint`: 0 errors.
- Repo ids read from the API: `a11ign/agent-org` is owner `320310787`, repo `1388747923`, matching the subject pattern.

## Not yet

- Done-when 2 of the row (the policy exercised by a run of `outside-nightly`, linked on a11ign/a11ign#5609) cannot happen until #5609 sets `outside.nightly` on. Nothing in this change can reach it.
- Nothing has minted a token against this policy, so the policy is untested in Octo STS itself; the file is validated only by the guards above and by the row's grep.

Acceptance: test -f .github/chainguard/outside-nightly.sts.yaml && grep -qF 'outside-nightly.yml@refs/heads/main' .github/chainguard/outside-nightly.sts.yaml
