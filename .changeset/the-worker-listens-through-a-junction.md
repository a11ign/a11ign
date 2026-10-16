---
"a11ign": patch
---

The worker the lockfile installs is `@a11ign/screenreader-worker` 0.13.4, whose server starts when the launcher reaches it through a directory junction. Under 0.13.3 a deployed worker found its own module at a different path from `process.argv[1]`, took itself for a library and exited 0 with no output, which took worker-5 down after a provision (a11ign#5588, under #5155; screenreader-worker#66).
