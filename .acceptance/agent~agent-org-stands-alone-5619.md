Adds `.github/chainguard/outside-arm.sts.yaml`, the Octo STS policy for the `outside-arm` identity that agent-org's scheduled `outside-sweep` mints with (`scope: a11ign/a11ign`). Modelled on `auto-arm.sts.yaml`; subject pinned to agent-org's `main` by immutable ids, `job_workflow_ref` pinned to `auto-arm.yml@refs/heads/main`, `event_name: schedule`, pull-request and contents write only. Inert while `outside.arm` is off.

Not measured: the first successful mint (Done-when 2) can only be read from an `outside-sweep` run after a11ign#5603 sets the flag; it is looked for on the row, not held here.

Acceptance: grep -q 'event_name: schedule' .github/chainguard/outside-arm.sts.yaml && grep -q 'auto-arm\\.yml@refs/heads/main' .github/chainguard/outside-arm.sts.yaml

Mutation: not applicable (a configuration file with no guard of its own); the Acceptance was run against a copy with `event_name: schedule` removed and fails.

platform: Octo STS policy file, the platform's own trust mechanism.

Closes #5619
