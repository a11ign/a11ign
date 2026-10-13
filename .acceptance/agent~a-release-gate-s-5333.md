A release gate's refusal must name an OPEN owning row, and a test now fails when a `REFUSED ... #n` string names a closed issue (#5333, chairman a11ign#928 2026-10-13).

`scripts/refusal-owners-are-open.ts` reads every `REFUSED` string in `package.json` scripts and every `REFUSED` or `::error` line of `release.yml` (YAML comments are not read), takes each bare `#n` after the marker as the owner, and asks `readState` whether it is open. `(#n)` is this repository's citation idiom and is not an owner; the compensating control is that a `REFUSED` string with NO bare owner is itself a finding, so rewording an owner into parentheses cannot pass. An issue that cannot be read is `CANNOT_TELL` and fails.

**The premise at this head, measured:** `gate:lab-held` no longer names #5179 (#5332 re-pointed it to #4425, open), so the live read is GREEN on this tree, not red as the row's text expected. The string also cites `(#5087)`, closed for good: a literal "every `#n` after REFUSED" reading would have been red on that citation, which is why the citation idiom is exempt. The fixture is the 2026-10-12 string itself (`git show 3d55b5398:package.json`).

**Fixture half** (`node --test scripts/refusal-owners-are-open.test.ts`): 13 pass, 1 skipped (the live read, opt-in with its reason printed). Closed owner fails naming `package.json script "gate:lab-held"` and `#5179`; the same fixture with the owner open passes; an unreadable issue is `CANNOT_TELL` and fails.

**Live half** (`A11Y_CHECK_REFUSAL_OWNERS=1`, instrument `gh api repos/<repo>/issues/<n>`), measured at this head:

```
LIVE PASS: package.json script "gate:lab-held" names #4425: a11ign/a11ign#4425 is open
```

`ci.yml` gets a `refusalOwners` job that runs the live half with `github.token` and is in `gate`'s `needs` and result loop, so it BLOCKS; it asserts the `LIVE PASS` line so a skip cannot stand in for a read. It reads the tree under test, so the pull request that re-points a refusal turns it green itself.

**A live instance, measured outside this tree.** `a11ign/lab`'s `gate:core-held` still says "... is a11ign/a11ign#5179", a REPO-QUALIFIED reference. A reader that saw only a bare `#n` would have passed it, so the reader reads `owner/repo#n` in its own repository. Run over the lab's `package.json` read from GitHub on 2026-10-13: `REFUSED names a11ign/a11ign#5179 as its owner, and a11ign/a11ign#5179 is CLOSED`, 1 failure.

**Not done, named:** the lab's string is not re-pointed and the lab's CI does not run the reader; that is a11ign/a11ign#5351 (Region `lab:`). The core's reader is not a published package, so the lab copies it or the core publishes it: the row says so.

Also run (measured, this head): `pnpm run lint` 0 errors; `pnpm run typecheck` exit 0.

platform: checked `gh api` for the state read; nothing in GitHub or pnpm refuses a refusal message that points at a closed issue, so a small reader is what there is.

Acceptance: `node --test scripts/refusal-owners-are-open.test.ts` exits 0, with 13 tests passing and the live read skipped with its reason.

The test declares `// no-token: gh` (the acceptance job has no token): the fixture half spawns nothing, `readIssueState` takes an injected runner there, and the one read of GitHub is the opt-in live test, which `ci.yml`'s `refusalOwners` job runs with `github.token`.

Mutation: ten, each restored byte-identical. (A) `failures` never fires: fails the closed-owner, unreadable, citation, reworded-parenthesis and release.yml tests. (B) `failures` always fires: fails only the owner-open test. (C) citation exemption removed: fails the closed-owner, owner-open, unreadable, citation and reworded tests. (D) citation exemption over-broad (drops everything after the first `(#`): fails the same four plus the real-tree control. (E) YAML comments read as refusals: fails only the release.yml test. (F) an ownerless `REFUSED` is no finding: fails only the reworded-parenthesis test. (G) an unreadable issue read as open, (H) a `closed` answer read as open, (I) an unexpected state read as open: each fails only the live-reader mapping test, which drives `readIssueState` through an injected runner for open, closed, another word, empty and a throwing call. (J) the owner/repo qualifier dropped from the reference pattern: fails the three qualified-owner tests.

Closes #5333
