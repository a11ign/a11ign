The ceo's role text says a number whose verdict reads `paused` is not a class to file a row for, in its daily-retrospective section and nowhere else. `.agent-org/roles/ceo.md` gained that bullet, and `packages/guards/src/ceo-retro-paused-number.test.ts` pins it: the section carries the sentence, the sentence appears exactly once in the file, and a copy in another section, or a file with no daily-retrospective heading, is refused. This is the ceo-side half of agent-org#1429, which cannot change this file itself.

- **Positive and negative controls, all pass:** the bullet in the section (accepted); the same section without it (refused); the sentence in another section while the retrospective section lacks it (refused); a file with no daily-retrospective heading (refused, not read as passing).
- **Real file:** `.agent-org/roles/ceo.md` at this head passes.
- **Before the change:** `ceo.md` as it stood at HEAD, before the edit, fails the real-file assertion and nothing else.

Mutation: the sentence deleted from the daily-retrospective section, and the sentence moved into a different section, each fail the real-file assertion and nothing else; `ceo.md` restored from a scratchpad copy and checked with `cmp` (byte-identical), and the restored file passes.

Acceptance: node --test packages/guards/src/ceo-retro-paused-number.test.ts
