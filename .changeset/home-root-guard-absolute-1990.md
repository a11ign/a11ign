---
"@a11ign/lab": patch
---

**The home-root guard reads `/home/<user>/<dir>`, the one spelling CONFIGURATION can use (#1990).** Its
pattern was `/root`, `$HOME`, `~` — and **a systemd unit cannot expand `~` or `$HOME` in an
`Environment=` line**, so the literal absolute path is the only form available to every host unit in
`packages/agent-org/host/`. Host units are the file class most likely to carry a second copy of a
machine's layout, being the only files here that address a specific host by absolute path, and they were
precisely the class the guard could not see.

Measured 2026-09-22, two branches adding the identical fact within the hour: #1982 wrote
`Environment=GH_CONFIG_DIR=/home/agent/workers/gh` and **passed**, the guard never seeing it; #1986 wrote
the same line and also spelled it `~/workers/gh` in prose, and **failed — on the prose only**. The guard
fired on the documentation and stayed silent on the configuration, while its own message ("a path under a
home root is not automatically this machine's") is exactly right about both.

The user segment is matched rather than named: `agent` is this host's account and `runner` is GitHub's,
and a pattern naming either would answer about one machine while claiming to answer about home roots. The
widening surfaces two real directories, now classified — `workers` (the `a11ign-ai-workers` `gh` config
root named in two installed units, `host-units.mjs`'s remedy text and `host-units.test.ts`) and `work`
(GitHub's hosted-runner workspace root, in `doc-cross-reference-report`).

**The absolute branch takes a forward slash and nothing else**, which the older branches' `[/\\]{1,2}`
does not: reusing that here read a JS newline escape in `host-units.test.ts`'s fixture — a `HOME=` line
joined to the next `Environment=` line by an escape, inside one string — as two directories under a home
root, neither of which anybody has. Classifying those would have put nonsense in a list whose whole value
is that every row is a decision somebody made.

(The two names are deliberately not written out here. The first draft of this note did write them, and
**the guard caught its own changeset** — which is the file's own fourth-instance lesson arriving one more
time: a guard keyed on a shape finds that shape in the prose describing it, and quoting the literal is
the one edit that is never needed.)

A new test drives **both spellings of one path** through one extracted `homeRootNamesIn`, asserting an
unclassified segment surfaces from each and is reported identically (normalised to `~/<segment>`), and
that a classified one goes quiet in both — so the next widening cannot fix one form and leave the other.
That test is also the named positive control for the tree-wide emptiness assertion beside it, which until
now was empty over a population it could not see.
