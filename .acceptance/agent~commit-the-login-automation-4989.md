Commits the login-automation research to `docs/research/`, unedited: a byte-identical copy of the sourced report on the agents host (#4989, parent #4084). The SHA-256 is pinned so CI can check the copy without the host path.

- **Measured** (this session): `cmp` against `~/research/login-automation-for-authenticated-scans.md` exits 0, so the copy is byte-identical.
- **Read for secrets:** a pattern scan of all 277 lines for credential-, address- and token-shaped strings. Every hit was an environment-variable name (`A11IGN_LOGIN_*`, `secrets.*` references) or a public documentation URL. No credential value, address or token was found.

Acceptance: bash -c 'echo "c4889e51ac8ffc325bd209b2f8ad0fdf794cf140ffdf5eaada81f91525ced715  docs/research/login-automation-for-authenticated-scans.md" | sha256sum -c --quiet'

Closes #4989
