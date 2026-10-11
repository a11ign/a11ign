---
"a11ign": patch
---

A flows file's steps may now carry `when: { heading | control: "<name>" }` (run only if that is on the page now) and `optional: true` (a missing target is skipped rather than failed; an ambiguous control or a timed-out `expect` still fails), and a flow may use `dismiss-if-shown: "<name>"` and `auto: true` (#4994). `when:` and `optional:` take a name, never a selector or a script, and are refused by the existing rules if they do. `auto:` runs the screen loop and needs credentials a plan carries (`plan.auto`), which no CLI flag supplies yet, so it is accepted in a flows file and not yet reachable from the command line. A screen the loop does not recognise now prints the exact step to add. The worker does not know these keys: do not send a flows file that uses them to a worker (#4994).
