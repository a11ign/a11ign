`SUPPORT.md` at the repository root says where to ask, what is promised, who maintains the project and what is not offered. Every sentence in it repeats something the repository already says, and it quotes the one promise (`SECURITY.md`'s "There is no SLA.") word for word, so it adds no commitment of its own. `README.md` links to it from the Contents line.

- **Real tree, green at this head:** the test reads the checked-in `SUPPORT.md`, `SECURITY.md` and `README.md` and passes all nine of its tests (the four checks, and a control for each).
- **Fails before the change:** with `SUPPORT.md` absent, the file fails at load with `ENOENT` for `SUPPORT.md`, so the check was live before the document existed.
- **The checks bite:** applied together to the real files, four breaks (the quoted sentence paraphrased, the sentence "We reply within 2 days." appended, the `docs/licence-faq.md` link misspelled, and the README link pointed at `./SECURITY.md`) made 4 of 9 tests fail, with the expected values `true` and `[]` that those checks assert, and the five controls passed. The files were restored from copies and `diff` showed them byte-identical. The breaks were not run one at a time, so the failing tests are not named per break.

Acceptance: npx rstest run --config scripts/rstest/rstest.config.ts --include packages/cli/src/action/support-statement.test.ts

Mutation: the quoted sentence paraphrased, "We reply within 2 days." appended, the `licence-faq.md` link misspelled, and the README link retargeted, all at once on the real files: 4 of 9 tests failed (expected `true` twice, `[]` twice), the five controls passed, and both files were restored byte-identical from copies.
