Re-pins `README.md`, `docs/github-action.md` and `docs/try-it.md` from `a11ign/a11ign@0f481d193e3347de8f69287ab2b5bf73549b5e92` (release 0.7.0) to `091918da7213322b9893b0b0f144f963127fb8f5` (release `a11ign@0.9.0`, the `latest` dist-tag on 2026-10-11; `next` read 0.9.0 that morning and 0.10.1 later that day). Every sentence naming the pinned release was re-read against the 0.9.0 source. The generated `consumer-gate.yml` and `outsider-job.yml` are regenerated from the new README fence, because their freshness tests compare against it.

Acceptance: bash -c '! grep -q 0f481d193e3347de8f69287ab2b5bf73549b5e92 README.md docs/github-action.md docs/try-it.md && grep -Eq "a11ign/a11ign@[0-9a-f]{40}" docs/try-it.md'

Closes #5119
