---
"@a11ign/agent-org": patch
---

**`hygiene:report` reads the `/tmp` user quota, so a full quota is no longer visible only as four unrelated test files going red (#2220).** `/tmp` on the agent host is a `usrquota` tmpfs, and `df` read 80% and 3.1 GB free while a 50 MB write was refused. The report now prints a `/tmp user quota` row that reads the quota itself (`quotactl_fd`; no `quota` binary is installed here) and says **EXHAUSTED**, **CONSTRAINED** (90% or more), **OK** or **NOT MEASURABLE** with its reason. The verdict never consults `df`, which is printed only as the contrast, and NOT MEASURABLE (no `usrquota` on the mount, no limit for the user, or a part that could not be read) is never a pass. The reader takes an injectable `exec`, so a test never reports whatever the real `/tmp` is that minute. Read-only: nothing under `/tmp` is deleted.
