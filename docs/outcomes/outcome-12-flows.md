# Outcome 12: flows, not URLs (sizing)

Sizes #4084 outcome 12: assess a multi-step task with actions between steps, and report per step. Row #4535.
Every source reading below was taken at `origin/main` `791552a77` (2026-10-09) unless it says otherwise.

**The decision, in four lines.**

1. **Step actions are declared in the flows file, not supplied by outcome 11's route.** The file already has the
   verbs and the safety rules; outcome 11 (#4532) is the route for apps whose state the file cannot script
   (MFA, a login that is not a form), and the two share the same per-step report.
2. **What is pressed is only what the flow names, under the consent of whoever wrote and committed the file.**
   `probe-forms` and `probe-navigation` stay off on every run that has a flow.
3. **The per-step report is one capture per `capture:` step**, rendered as one section per step in the summary
   that already renders one section per capture. It reports what the screen reader said at that step, and never
   a verdict that the journey "worked" (ADR 0011's evidence bar).
4. **Build it as three pull requests, the first needing no Windows worker.**

## What it covers

The row's premise, "a flows file says how to **sign in**", is out of date. What exists, read from the source:

- **The vocabulary is already a journey's.** `FLOW_VERBS` is `goto, fill, choose, check, press, expect, capture`
  (`packages/cli/src/auth/flows.ts:32`), a flows file holds any number of NAMED flows (`flows.ts:353-370`), and
  ADR 0038 gives a `checkout` flow with `capture: cart-review` and `capture: delivery` as its own example
  (`docs/adr/0038-authenticated-capture.md:617-645`). `login-no-capture` is enforced only on the flow named by
  `--login-flow` (`flows.ts:383`).
- **The safety rules apply to every flow, not just the login:** a closed vocabulary with no script step, a
  pinned `origin:`, controls addressed by accessible name, a bounded `expect` (`flows.ts:10-23`, 30 seconds at
  most, `flows.ts:53`), and a literal typed into a password field refused (`flows.ts:427`).
- **Both browser drivers already replay a flow to a capture point.** `signIn` runs the login, then `plan.flow`
  sliced to `plan.upTo` (`packages/cli/src/auth/interpreter.ts:466-486`), and the rule layer calls the same
  function (`packages/cli/src/auth/rule-layer.ts:41`). The wire type carries `flow` and `upTo`
  (`packages/evidence/src/index.ts:46-52`). The worker's copy accepts and validates both
  (`a11ign/screenreader-worker` `src/auth-flow.ts:75` and `:238-239`, read at `c3b77925d`). A test replays a
  flow to a capture point with a fake browser (`interpreter.test.ts:449`).
- **What a run pressed is already reported per step:** `pressedByThisRun` lists a flow's `press`, `check` and
  `choose` steps up to `upTo` by control name and never a value (`packages/cli/src/auth/resolve.ts:83`), and
  SECURITY.md already says an authenticated run "presses only what its own files name"
  (`SECURITY.md:179`).
- **A report of several captures of one page already exists.** `PageEntry.results` holds "one per capture of
  this page" (`packages/cli/src/multi-page.ts:220-224`), `runSingleUrl` loops captures over form states
  (`multi-page.ts:294-300`), and `renderMultiSummary` writes one section per result
  (`packages/cli/src/action/summary.ts:790-805`).

**What does not exist, and is the whole gap:**

- **No non-login flow can be run.** `planFrom` builds the request from the login steps only
  (`resolve.ts:180-183`), so `flow` and `upTo` are never set on a real run, and no flag names a second flow
  (the only flows flags are `--flows` and `--login-flow`, `packages/cli/src/cli.ts:274-275`). The URL list is a
  whitespace-split string with no per-entry keys (`multi-page.ts:77`), so ADR 0038's `{ url, flow: checkout }`
  shape is a design and not a feature (`docs/adr/0038-authenticated-capture.md:681-690` says so itself).
- **A capture has no step label.** The report's unit is the page and its form state, so a reader cannot tell
  which `capture:` step a section belongs to.
- **Nothing says what a failed step means for a flow that is not a login.** A failed login step is
  `auth-login-failed` (`docs/adr/0038-authenticated-capture.md`, "The primitive"), which is right for a login
  and wrong as a verdict on a journey.
- **There is no journey verdict, and this document does not propose one.** ADR 0011's capability 5, "know
  whether the goal was reached", is the hard one, and its evidence bar forbids a journey finding the transcript
  does not itself prove. A flow is ADR 0011's "record and replay" alternative: the author's route, "worth
  building as a stepping stone, not as the destination". It finds what a screen-reader user hears at each step
  of the path the author scripted. It does not find the route nobody scripted.

**Whose consent, and what is pressed.** The flow's `press`, `check`, `choose` and `fill` steps run, and nothing
else: ADR 0038 Constraint 7 turns `probe-forms` and `probe-navigation` off on an authenticated run
(`resolve.ts:231`) and this decision extends that to every run with a flow. The consenting party is whoever
committed the file: `origin:` pins the site but does not prove ownership, so the consent also rests on the
existing refusal of an authenticated run in a public repository (`refuseAuthOnPublicRepository`,
`packages/cli/src/auth/refusals.ts:154`). **The first slice therefore requires `--login-flow`** (the run is an
authenticated one), and an unauthenticated flow against a site the adopter may not own is out until someone
rules on it. SECURITY.md's `probeForms` rule (`SECURITY.md:32`: "If you enable `probeForms` against a page you
do not own, you are operating someone else's application") is the reason, not an obstacle.

**The cost the consent has to name: a step is pressed more than once.** Each capture replays the login and the
flow from the start (ADR 0038, "On the wire and per capture"), a capture may be repeated up to
`MAX_CAPTURE_ATTEMPTS = 3` times (`multi-page.ts:30`, loop at `cli.ts:772`), and the rule layer signs in again
for itself (`rule-layer.ts:41`, `multi-page.ts:173-176`). So one `press: "Send invite"` before the last of c
capture points can run up to c x (3 + 1) times. Worked from those constants: **4 capture points can press an
early step up to 16 times, and one capture point up to 4**. "Invite a user" three times is three invitations.
The disclosure and a bound belong in the first row's SECURITY.md paragraph, and the account must be disposable.

## What it would cost

Three pull requests, one of them needing no Windows worker. **Inferred, not measured**: no flow has been run
end to end, so the PR counts are a reading of the diff each row below describes, against two measured
quantities.

- **Measured, review and merge latency:** `gh pr list --state merged --limit 40 --json number,createdAt,mergedAt`,
  median `createdAt` to `mergedAt` **18.1 minutes**, 90th percentile (nearest rank) **41.9 minutes**, over
  #4406 to #4518, run 2026-10-09 against `791552a77`. It is latency after a PR opens and says nothing about
  authoring time.
- **From `docs/capture-cost.md` (which marks its figures measured or chosen, and says to re-derive them), through
  `estimateMinutes`** (`multi-page.ts:66`, constants at `:44-51`): `node -e 'const e=(c,s)=>Math.ceil(1.5+c*(s+35)/60); ...'`
  at `791552a77` gives, for a typical capture of 340 s and a worst of 460 s, **8 and 10 worker-minutes for 1
  capture, 27 and 35 for 4, 33 and 43 for 5**.
- **Comparison, ADR 0038's own estimate:** the authenticated-capture build was 7 PRs, 3 needing NVDA, central
  estimate three working days, range two to five, "confidence is low"
  (`docs/adr/0038-authenticated-capture.md`, "Estimate of the build row"). This outcome reuses that primitive,
  which is why it is 3 PRs and not 7.

| Row | Contents | PRs | Windows worker to accept | Worker-minutes to accept |
|---|---|---|---|---|
| 1 | `--flow <name>`: run a named non-login flow after the login and capture at its end; SECURITY.md paragraph | 1 | no (fake-browser tests, `interpreter.test.ts`) | 0 |
| 2 | `capture:` steps become N captures, a step label on each result and section, a failed step reported as "could not complete at step k" and never as a finding, a cap on capture points | 1 | one rehearsal | 2 runs (one for the path, one control with a step that cannot be bound) of 4 captures: 54 typical, 70 worst |
| 3 | The Action's `flow:` input, `docs/github-action.md`, one Action rehearsal | 1 | one Action run | 27 typical, 35 worst (4 captures), about $0.27 to $0.35 at `WINDOWS_DOLLARS_PER_MINUTE` 0.01 (`multi-page.ts:51`) |

Rows 2 and 3 touch the fleet to accept, so they are for `orchestrator` to schedule (`engineer.md`'s resource
ban). **Not counted:** unauthenticated flows, a journey verdict, outcome 11's fixture, and any change to the
worker's own copy of the interpreter, which already accepts `flow` and `upTo`.

**Biggest uncertainty:** whether real NVDA announces the page after a scripted `press` that changes the page
without a load, which ADR 0038 left unmeasured for a login (its "first unmeasured fact") and which row 2's
rehearsal is the first to measure for a flow. If it does not, row 2 grows by a wait the flow vocabulary cannot
express (it has no sleep, by design), and the answer is `expect`.

## First row

**Row: `--flow <name>` runs a non-login flow from the flows file after the login, and the run captures the page
it ends on.**

**Region:**

```
packages/cli/src/auth/flows.ts
packages/cli/src/auth/resolve.ts
packages/cli/src/cli.ts
packages/cli/src/auth/flows.test.ts
packages/cli/src/auth/resolve.test.ts
SECURITY.md
```

**Change.** Add `--flow <name>`, valid only beside `--flows` and `--login-flow` (alone is a named error, as
`--auth-state` alone is, `resolve.ts:145-153`). Add `resolveRunFlow(file, name)` in `flows.ts` beside
`resolveLoginFlow`: it refuses the login flow's own name, a name the file lacks (listing the names it has), and
**any flow containing `capture:`** (refused by name: "capture points arrive with row 2", because skipping the key
would capture the page unscripted and report it as the scripted one, the defect ADR 0038 names for `flow:` in
the URL list). `planFrom` sets `flow` on the request (`resolve.ts:180`); do not set `upTo`, so every step runs.
`requiredEnvNames` and `pressedByThisRun` already read `plan.flow`. Add one paragraph to SECURITY.md under "What an
authenticated run presses": a flow's steps run once per capture attempt and once more for the rule layer, so a
non-idempotent step repeats, up to 4 times for one capture; use a disposable account. No Windows worker is
needed, and the acceptance runs the fake browser.

**Acceptance:**

```bash
bash -c 'pnpm exec tsx --test packages/cli/src/auth/flows.test.ts packages/cli/src/auth/resolve.test.ts packages/cli/src/auth/interpreter.test.ts && pnpm run typecheck && pnpm run lint && test "$(git diff --name-only origin/main...HEAD | grep -c "^SECURITY.md$")" -ge 1'
```

The new tests must include (a) `--flow` alone refused by name, (b) the login flow's own name refused, (c) a flow
with `capture:` refused by name, (d) a request whose `flow` is set and whose `pressedByThisRun` lists the flow's
presses, and (e) a mutation check in both directions: remove the refusal so it never fires, and make it always
fire, and each breaks its own test only.

**What would change this answer.** If the adopter's journeys are behind MFA or a login that is not a form, the
flows file cannot reach them and outcome 11 (#4532) is the route, with this document's per-step report reused.
If row 2's rehearsal shows NVDA does not announce a scripted page change, rows 2 and 3 are not worth building
until that is solved.
