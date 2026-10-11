## What

The three docs (`README.md`, `docs/github-action.md`, `docs/try-it.md`) pinned `a11ign/a11ign@fd5cf437…`, the `a11ign@0.6.6` commit, while `latest` on the registry is 0.7.0. The `docs-release-pin-currency` guard then failed `ts / run` on every PR.

- Every `fd5cf437…` pin is re-pinned to `0f481d193e3347de8f69287ab2b5bf73549b5e92`, the commit of tag `a11ign@0.7.0`. Comments and tag-form references say `0.7.0`.
- Prose about the pinned release is re-read against the 0.7.0 tree, not carried over from 0.6.6. What changed:
  - The closed flow vocabulary now also has `dismiss-if-shown` and `auto`, plus `when:` and `optional:` modifiers. The changelog says the worker does not know these keys, so the docs say so.
  - `a11ign login --check` (a `login:` block with a TOTP seed) is now in the tree. The docs say a scan cannot supply a seed, so TOTP stays out of scope for a run.
  - Two quotations in `try-it.md` that were not verbatim in any tag are reworded to the 0.7.0 source's own sentences.
  - `v0` now points at the 0.7.0 commit, so the `v0` reading is updated.
- Dated registry readings are re-dated 2026-10-11.

## Evidence

- `git ls-remote --tags https://github.com/a11ign/a11ign refs/tags/a11ign@0.7.0` prints `0f481d193e3347de8f69287ab2b5bf73549b5e92`; `refs/tags/v0` prints the same commit.
- `npm view a11ign dist-tags` at this minute: `{ latest: '0.7.0', next: '0.8.0' }`.
- `git grep "0\.6\.6\|fd5cf437" -- README.md docs/github-action.md docs/try-it.md` returns nothing.
- `node --import tsx --test packages/guards/src/docs-release-pin-currency.real-tree.test.ts`: pass 1, fail 0.
- Acceptance command below: exit 0.

## Acceptance

```bash
bash -c '! grep -q fd5cf437f37416098b2a4819282f575016ddf2be README.md docs/github-action.md docs/try-it.md && grep -Eq "a11ign/a11ign@[0-9a-f]{40}" docs/try-it.md'
```

Closes #5069
