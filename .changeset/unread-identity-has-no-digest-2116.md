---
"@a11ign/evidence": patch
---

**A document identity that read nothing no longer carries a render label (#2116).** `documentIdentity(null)`, `documentIdentity({})`, a result object and a capture wrapper one level too high all returned `digest: "811c9dc5"` — the hash of an empty string, shaped like a render id — so an identity assertion written against the wrong object passed by comparing nothing while printing what looked like a reading. `digest` is now `null` when `read` is empty, and `identitySentence` opens `No document identity was read:` instead of `Document 811c9dc5:`; the conformance limitation that splices that sentence says the same. `read`, `components`, `verdict` and the `UNCOMPARABLE` semantics are unchanged, and an identity that read a component is labelled exactly as before. The module header now tells the next test author that `fixtures/calendly-687.json` is the fixture that can fail and the `rehearsal*` result fixtures cannot answer identity.
