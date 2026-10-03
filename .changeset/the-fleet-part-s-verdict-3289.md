---
"@a11ign/lab": patch
---

**The fleet part's verdict can be posted as a `qualification` commit status, and a verdict that is missing is never a pass (#3289, #3136 done-when 3).** The release reads that status and nothing wrote it, so every real release waited in its outcome 3. `qualificationStatus` turns a `gate:stability` reading into the payload: `PASS` or exit 0 is `success`; `FAIL`, exit 1 and exit 2 (INCONCLUSIVE) are `failure`; a started run is `pending`; a missing, unparseable or out-of-contract verdict is `failure` saying "not a pass". Every description names `gate:stability` and says "fleet part only", never "release:gate passed". The poster runs on the control plane (`ceo`'s ruling A: the lab holds no write credential), reads a second token file, and posts NOTHING, saying so and exiting 3, when that file is absent. Nothing has been posted to GitHub yet: the one real post is gated on the token file existing.
