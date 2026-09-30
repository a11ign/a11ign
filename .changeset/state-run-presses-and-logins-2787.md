---
"a11ign": patch
---

**A saved-state run no longer reports pressing the login's controls, or performing a login (#2787, #2566 item 6, ADR 0038 amendment 9).** `--auth-state` skips every login step but the final `expect:`, yet `a11ign-summary.md` read "What this run pressed: Login" and the result carried `logins: { performed: 1 }` beside a notice saying the run performs no login. The pressed list now omits the login's steps under a state (the flow's and a forms config's stay), and the `logins` tally counts none and states a minimum of 0. A run with no state is unchanged.
