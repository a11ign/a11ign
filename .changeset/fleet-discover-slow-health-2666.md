---
"@a11ign/control": patch
---

**`fleet:discover` no longer reports a box that answers `/health` in 3 s as `ASLEEP?` (#2666).** The probe timeout was 2 s and three healthy workers answer in 2.85-2.93 s, so the reconciler read a slow answer as an absence, and `--enroll` would have read it as "not enrolled". The timeout is now 6 s (about twice the slowest measured box). The cost is bounded and stated: `scan` probes all 254 addresses at once, so a scan with any silent address takes the timeout, measured on loopback at 2007 ms before and 6007 ms after.
