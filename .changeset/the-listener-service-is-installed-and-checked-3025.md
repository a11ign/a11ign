---
"@a11ign/agent-org": patch
"@a11ign/lab": patch
---

**`host:install` and `host:check` now know the chairman-messaging listener, the one unit no timer starts (#3025).** `chairman-listen.service.in` is classified as the tool's and optional on the `messaging` key, so with the key absent it is not listed or installed and an installed copy is an orphan the install removes AND disables (`disable --now`, then delete). With the key present `host:install` writes it and runs `enable --now` on the SERVICE, never a bare `enable`; before this it only ever enabled timers, so the listener would have been written and never started. `host:check` asks a long-running service the two questions it asks a timer and answers in its own words: `LISTENER NOT ENABLED`, and `LISTENER ENABLED BUT NOT RUNNING` (`activating` counts as not running: for a `Restart=on-failure` service that is the crash loop), the second naming `journalctl --user -u` because a refusal exits 2 and the install does not fix one. `messaging:listen`, `messaging:watch` and `messaging:pair` exist as root scripts, as the units and `messaging:check` already named them.

**Not in this change:** the programs those scripts run live in `a11ign/agent-org` (#2907) and are not in this tree, so the scripts name paths that exist after the next sync.
