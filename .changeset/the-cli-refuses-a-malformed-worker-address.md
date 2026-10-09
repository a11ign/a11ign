---
"a11ign": patch
---

`witness --worker <value>` refuses a malformed address (`http://:8765`) or a missing value before it leases or captures, with the fleet layer's own `assertWorkerUrl`, naming `--worker`, instead of passing the value on as written (#4593).
