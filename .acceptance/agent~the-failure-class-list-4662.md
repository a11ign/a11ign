`.agent-org/failure-classes.json` gains the `hold-on-idle-row` class with `guard: null` and a `guardNote` naming a11ign#4661 as the rule that sets the guard when it merges. Its two seeds are `a11ign/agent-org#550` (merged 21:29Z, held `--until closed a11ign/a11ign#4524` while #4524 was ready and unclaimed) and `a11ign/a11ign#4437` comment 6089503125, the chairman-verified direction that names the class. The file holds definitions only, so this is the data half; the code half is a second pull request in `a11ign/agent-org`.

- **Measured before the change** (`git show origin/main:.agent-org/failure-classes.json`): `grep -c hold-on-idle-row` is 0, and the Acceptance command exits 1.
- **Measured after the change** (this branch): the Acceptance command exits 0.
- **Re-read:** `a11ign/agent-org#550` is MERGED at 2026-10-09T21:29:13Z, and comment 6089503125 on #4437 is dated 2026-10-09T21:24:21Z and carries the `[class: hold-on-idle-row]` marker.
- **Nothing in this repository reads the file** (`git grep failure-classes` outside the JSON finds only docs and the agent-org tool's reader), so no test here pins the class count.

Acceptance: node -e 'const c=JSON.parse(require("fs").readFileSync(".agent-org/failure-classes.json","utf8")).classes.find(x=>x.id==="hold-on-idle-row"); if(!c||c.guard!==null||!c.guardNote||!c.seed.length||c.seed.some(x=>!x.ref||!x.basis)) process.exit(1)'

Closes #4662
