A release gate's refusal must name an OPEN owning row, and a test now fails when a `REFUSED ... #n` string names a closed issue (#5333, chairman a11ign#928 2026-10-13).

`scripts/refusal-owners-are-open.ts` reads every `REFUSED` string in `package.json` scripts and every `REFUSED` or `::error` line of `release.yml` (YAML comments are not read), takes each bare `#n` after the marker as the owner, and asks `readState` whether it is open. `(#n)` is this repository's citation idiom and is not an owner; the compensating control is that a `REFUSED` string with NO bare owner is itself a finding, so rewording an owner into parentheses cannot pass. An issue that cannot be read is `CANNOT_TELL` and fails.

**The premise at this head, measured:** `gate:lab-held` no longer names #5179 (#5332 re-pointed it to #4425, open), so the live read is GREEN on this tree, not red as the row's text expected. The string also cites `(#5087)`, closed for good: a literal "every `#n` after REFUSED" reading would have been red on that citation, which is why the citation idiom is exempt. The fixture is the 2026-10-12 string itself (`git show 3d55b5398:package.json`).

**Fixture half** (`node --test scripts/refusal-owners-are-open.test.ts`): 11 pass, 1 skipped (the live read, opt-in with its reason printed). Closed owner fails naming `package.json script "gate:lab-held"` and `#5179`; the same fixture with the owner open passes; an unreadable issue is `CANNOT_TELL` and fails.

**Live half** (`A11Y_CHECK_REFUSAL_OWNERS=1`, instrument `gh api repos/<repo>/issues/<n>`), measured at this head:

```
LIVE PASS: package.json script "gate:lab-held" names #4425: a11ign/a11ign#4425 is open
```

`ci.yml` gets a `refusalOwners` job that runs the live half with `github.token` and is in `gate`'s `needs` and result loop, so it BLOCKS; it asserts the `LIVE PASS` line so a skip cannot stand in for a read. It reads the tree under test, so the pull request that re-points a refusal turns it green itself.

**Not done, named:** `a11ign/lab`'s `gate:core-held` is not checked by this PR. The reader is exported (`refusalsInPackageJson`, `findings`, `readIssueState(repo)`) for the lab's CI; that is a row in the lab, filed beside this PR.

Also run (measured, this head): `pnpm run lint` 0 errors; `pnpm run typecheck` exit 0.

platform: checked `gh api` for the state read; nothing in GitHub or pnpm refuses a refusal message that points at a closed issue, so a small reader is what there is.

Acceptance: `node --test scripts/refusal-owners-are-open.test.ts` exits 0, with 11 tests passing and the live read skipped with its reason.

Mutation: seven, each restored byte-identical. (A) `failures` never fires: fails the closed-owner, unreadable, citation, reworded-parenthesis and release.yml tests. (B) `failures` always fires: fails only the owner-open test. (C) citation exemption removed: fails the closed-owner, owner-open, unreadable, citation and reworded tests. (D) citation exemption over-broad (drops everything after the first `(#`): fails the same four plus the real-tree control. (E) YAML comments read as refusals: fails only the release.yml test. (F) an ownerless `REFUSED` is no finding: fails only the reworded-parenthesis test. (G) an unreadable issue read as open: fails only the live-reader test.

Closes #5333
