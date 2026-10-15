`.github/workflows/dependency-pr-body.yml` matched the PR title with `^deps: bump`, which is case-sensitive, so Dependabot's `deps: Bump @guidepup/setup from 0.29.1 to 0.29.2` (a11ign#5485) was "not auto-declared" and `acceptance` and `gate` failed. The pattern now reads `^deps: [Bb]ump`; the allowed-files list, the owned-path check and the major-bump refusal are untouched.

- **Before the change:** the new test reads `title_pattern` out of the workflow and 2 of its 4 tests fail on the capital-B titles.
- **After:** all 4 pass.
- **Mutation, both directions:** an always-false pattern is the "before" state above (the bump titles fail); an always-true `^deps: .*` fails the not-a-bump test only (1 of 4).

Acceptance: pnpm exec rstest run --config scripts/rstest/rstest.config.ts packages/guards/src/dependency-pr-body-title.test.ts
