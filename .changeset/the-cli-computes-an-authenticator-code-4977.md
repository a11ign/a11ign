---
"a11ign": patch
---

The CLI can compute an RFC 6238 authenticator code (`packages/cli/src/auth/totp.ts`) and refuses a missing or malformed seed by variable name, never by value. Nothing reads it yet: the flow-file wiring is a later change.
