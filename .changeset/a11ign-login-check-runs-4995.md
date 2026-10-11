---
"a11ign": minor
---

`a11ign login --check --flows <file> [--login-flow <name>]` runs only the login and its verification in a real browser, with no scan. It exits 0 when signed in and 2 on any failure; a login that crossed origins prints the exact `idp-origins: [...]` line to paste, and a failed run writes a scrubbed artefact (steps, screenshots with inputs masked, trees) under the witness artefact root's `login-check` directory. A rejected password is attempted once and never retried (#4995, #4084).
