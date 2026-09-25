---
"@a11ign/agent-org": patch
---

**A per-PR reviewer instance can run its pull request's Acceptance and cannot be started without its name (#2498).** Measured
2026-09-25 with `codex sandbox -c sandbox_mode="workspace-write"`, the reviewer's own policy: the checkout and `/tmp` are writable,
`~/.npm` and the checkout's parent are not, and `npx` in a tree with no `node_modules` died with `rofs` writing `~/.npm/_logs`. That is
#2376's "0/4; `npx` failed before execution"; with the dependencies linked in the same `npx` runs.

`prepareReviewCheckout` now ends with `linkReviewDependencies`, the hybrid `node_modules` `reviewer.md` used to teach a reviewer to build:
third-party entries and `.bin` to the tick's checkout, `@a11ign/*` to THIS tree's `packages/` (a whole-tree link is refused by
`assert-glob-not-empty --run`, #2378), never `.cache`. It runs on every head-changing push, writes nothing to a tree that is already right,
and a tree it cannot link REFUSES the order, so no pane opens on a tree that cannot run its Acceptance. `reviewerEnvironment` adds
`npm_config_cache` under the instance's own tree (`node_modules/.cache/npm`), and a caller's `env` is now laid over the reviewer's instead of
replacing it, so `A11Y_REVIEWER_SESSION` cannot be dropped by omission. The order to an instance names the dependencies, the cache and
`A11Y_REVIEWER_SESSION=reviewer-<n> pr-review-verdict`, because a pane the tick did not start holds no variable.

`reviewer.md` carries the rule for a verdict whose Acceptance did not execute: never "not runnable" for an environmental reason, and a
`convinced` that did not execute names its CI run, or it is `not convinced (environment)`.

**Spawn path:** `wake.mjs` has one `workspace create` and one `agent start` and no path that resumes a process (its `resume` is a plain
prompt, #2470). `herdr.service` restarted at 2026-09-25T12:01:57Z and `reviewer-2485`'s `codex resume`, and four `claude --resume`, started
at 12:01:58Z-12:01:59Z, so the resume was herdr's restore of every live agent (inferred from the timestamps) and a pane made that way holds
none of the `--env` the tick gave it. The name therefore also travels in the order's text. The pin is in `wake-reviewer-instance.test.ts`.
