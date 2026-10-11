---
"a11ign": patch
---

The CLI can read a TOTP secret given as a bare base32 seed or as a whole `otpauth://totp/` URI, taking algorithm, digits and period from the URI and defaulting to SHA-1, 6 and 30. An `otpauth://hotp/` URI, a missing secret and an out-of-range option are each refused by name, never quoting the value (#4992).
