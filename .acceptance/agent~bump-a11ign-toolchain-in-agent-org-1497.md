Bump `@a11ign/toolchain` from 0.10.0 to 0.10.2 (npm `latest`, the first release that exports `./refusal-owners-are-open`; 0.10.0 does, 0.10.1 does not, and the row names 0.10.2), and delete the core's copy of the refusal-owner reader. The test imports the package's export and asks `readIssueState` for `a11ign/a11ign`, because the package names no repository. The live-tree test and the `ci.yml` step test stay here: they read this repository's own files.

Acceptance: `node --test scripts/refusal-owners-are-open.test.ts` exits 0, with 14 tests passing and the live read skipped with its reason.

Live: `A11Y_CHECK_REFUSAL_OWNERS=1 node --test scripts/refusal-owners-are-open.test.ts` exits 0 with 15 passing, and prints `LIVE PASS: package.json script "gate:lab-held" names #4425: a11ign/a11ign#4425 is open`.

Mutation: none. No guard logic changed here: the reader's verdicts are the package's, and the 14 fixture tests run unchanged against it.

platform: checked the toolchain's published `./refusal-owners-are-open` export (npm `@a11ign/toolchain@0.10.2`) before keeping a copy; the copy is deleted, not extended.

Waits-on-done-when: none. The lab's copy (a11ign/lab, #5351) is the lab's row, not this one.
