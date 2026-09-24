---
"a11ign": patch
---

**A run that needs to log in now refuses what it must, with a named error each time, and no flag can ask it to yet (#2359, PR 3 of 7).** Ten named errors join the fault table with a what / try / see entry apiece: a remote worker refuses an authentication request before anything is sent or the rule layer's browser launches; a worker whose answer lacks `authApplied: true` (an older worker that ignored the request and captured the login page) is `auth-not-applied` and never a report; authentication with `JUDGE_BACKEND` set to a vendor refuses unless `--send-authenticated-transcript-to-judge-vendor` is given, which cannot be set from the environment; and an authenticated run on a repository that is not private is refused whole. The CLI exits 2 on these, like a configuration error, and not 3 ("wait for a release"). No run changes behaviour until PR 7 makes the flags reachable.
