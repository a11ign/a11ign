---
"a11ign": minor
---

A scan with `--flows <file>` and no `--login-flow` signs in by the file's `login:` block, as `a11ign login --check` does, and sends the worker the block's three variable names so NVDA signs in the same way. A file may be only a `login:` block; with a block and `--login-flow` the named flow is used and a notice says the block was not. The block's variables must all be set before anything is leased, and a `check:` that is a `url:` is refused (#5054, #4084).
