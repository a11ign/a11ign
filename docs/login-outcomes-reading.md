# Reading a failed sign-in: login outcomes on real Auth0

This is a reading of one run, kept so the next reader can tell what was measured from what was inferred. It
names no fix. The question it answers is narrower: a **wrong one-time code** on the real Auth0 login ended
`signed-in-check-never-matched`, where a rejected code should end `totp-rejected`. Which screen the loop ended on, which
alert it read, and which copy of the loop decided are the three things that have to be known before anything is changed.

## Why a wrong seed ended signed-in-check-never-matched (a11ign#4084)

**Short answer: the record does not name the cause.** It establishes three things. The loop kept reading the
one-time-code form and never left it. The worker's copy of the loop decided the outcome, not the CLI's. And the
trail carries no alert text, so the two causes that would explain a missed rejection (the text does not match,
or the alert is not read at all) cannot be told apart from it. The third candidate, that the budget ran out before
the screen was read, is ruled out.

### What the run recorded

The reading is of the falsifier run, which deliberately signs in with a random authenticator seed so the sign-in
must fail:

- Run **38770567987**, workflow `auth0-e2e` in `a11ign/auth-capture-check`, a `workflow_dispatch` on `main`,
  created `2026-10-15T16:37:33Z`, conclusion `success`.
- The job log says `FALSIFIER: true` and "the authenticator seed is replaced by a random one, so the sign-in must
  fail". It ends with: `FALSIFIER HELD: a wrong seed ended auth-login-failed (outcome signed-in-check-never-matched) and the heading was not read.`
- The installed CLI is `a11ign@0.10.8`, and the worker is `@a11ign/screenreader-worker 0.13.2`.
- Artifact **`auth0-e2e-evidence`** (id `11990569281`, 3215 bytes, created `2026-10-15T16:42:38Z`, not expired).
  It holds `auth-trail.json`, `worker.log`, `scan.err`, `reader.err`, `spa.log`, `worker.err` (empty) and
  `a11ign-result.json` (empty).

The loop trail, `auth-trail.json`, is one loop and nothing more:

```json
{ "phase": "login", "index": 2, "outcome": "signed-in-check-never-matched",
  "branches": [
    { "screen": "landing", "kind": "submit" },
    { "screen": "identifier-and-password", "kind": "type" },
    { "screen": "one-time-code", "kind": "type" } ] }
```

It records only the branches the loop **acted on**. A screen the loop read but did not act on leaves no entry, and
nothing after `one-time-code` was acted on. The trail has no headings, no controls, no alert, no budget and no timing.

`reader.err` is the transcript reader failing: `SyntaxError: Unexpected end of JSON input` from `read-transcript.mjs`.
No page transcript was written, so the alert text was never recorded anywhere in the artifact.

### Which copy decided

The loop exists twice: in the CLI (`packages/cli/src/auth/screen-loop.ts`) and in the worker's shipped package
(`@a11ign/screenreader-worker@0.13.2`, `dist/src_auth-flow_ts.mjs`). The record places this run in the worker's copy:

- `scan.err` reads `Using http://127.0.0.1:8765 (A11Y_WORKER)`, the local worker.
- `worker.log` has the stack `captureWithNvda` → `signIn` → `signInByScreens` → `explainFailure` → `loginFailed` in
  `@a11ign/screenreader-worker@0.13.2`. The CLI's `screen-loop.ts` appears nowhere in it.

The two copies are the same at every line this reading depends on (the alert regex is `screen-loop.ts:125` and
the worker's `src_auth-flow_ts.mjs:1427`, identical). So a fix must be made in the copy that decided, and a
test of the CLI's copy alone would not show the worker's behaviour.

### Mechanism, from the worker's source

Line numbers are in `@a11ign/screenreader-worker@0.13.2`'s `src_auth-flow_ts.mjs`:

- **Ending matchers are checked first** (`classifyScreen`, 1451–1458). A rejection alert that matched the
  `totp-rejected` regex (1427) would have ended the loop as `totp-rejected`. This run did not, so **no alert the loop
  read matched that regex**.
- **A screen the loop has already acted on is not acted on again** (`screen_loop_step`, 1646–1654). After the code was
  typed and submitted, the loop kept seeing the same form and did nothing with it.
- **Typing submits** (`typeFields`, 2696–2709): the `type` branch fills the fields and then presses submit or Enter, so
  no separate submit branch is recorded after the code. That is why the trail ends at `one-time-code/type`.
- **The budget end returns `never-matched`** (`budgetEnd`, 1655–1663) unless the loop had seen a screen it could not
  classify, in which case it would have returned `unknown-screen`. This run returned `never-matched`, so every screen
  the loop read matched one of its own branches. A form that was classified as `one-time-code` and not as an error
  is a screen the loop had no reason to leave.
- **The budget is 90 s by default** (`LOGIN_LOOP_BUDGET_MS = 90000`, line 2590). No caller passes `loopBudgetMs`. The
  capture reached `browserClosed` at `96173 ms` (`worker.log`), which fits the loop using its full budget.
- **Alerts are read by role** (`LOOP_ROLES`, 2600; `readScreen`, 2613–2638). An `alert` role is read, with its name
  falling back to the `StaticText` beneath it. An error shown as a field message without an `alert` role is not in
  that set, so it would not be read.

The loop reads the screen every `POLL_MILLIS` (500 ms, line 1596). So the screen was read repeatedly and never changed
to one the loop would act on. The trail's silence after `one-time-code` is consistent with that.

### The three causes, and where the record stands

| Cause | Status | Why |
|---|---|---|
| **(a)** alert text on real Auth0 does not match the `totp-rejected` regex | **Undecided** | Consistent with the record, which cannot show the alert's text. Needs the real text. |
| **(b)** alert not read by `alertTexts` (no `alert` role, or a field error) | **Undecided** | Consistent with the record, which cannot show the alert's role. Needs the accessible tree of the one-time-code screen after submit. |
| **(c)** the loop time budget ended before the screen was read | **Ruled out** | The loop read the one-time-code screen on every 500 ms poll (above). The budget did not end it before any read. |
| *(not in the row's list)* no rejection was rendered at all | **Not excluded** | If Auth0 accepted the code and held the form, or showed no message, neither (a) nor (b) applies. The worker's own failure text says to check "the flow's signed-in selector against the page the login reaches", which points at the sign-in check, not at an alert. |

### Done-when, item by item

The row has three items. This reading meets part of item 1 and none of item 2. Item 3 does not apply, because the
artifact is live and holds the branches.

| Item | Status | What is missing |
|---|---|---|
| (1) the screen, the alert's role and name, the copy that decided, the step count and budget left, the run id and the artifact name | **Partial** | Headings and controls, the alert's role and name, and budget left are not in the artifact. `spa.log` holds one line and `worker.err` and `a11ign-result.json` are empty. The copy, step count, run id and artifact name are recorded. |
| (2) which of (a), (b), (c) holds, the real alert text as a labelled fixture, and one fix row per faulty copy with a negative control | **Not met** | (c) is ruled out. (a) and (b) need the alert's text and role, which the record lacks. Without them there is no faulty copy to name, no real text for a fixture, and so no fix row to file. The next record is in the section below. |
| (3) the artifact expired or lacks the branches | **Not applicable** | The artifact is live and holds the branches. |

Item 2 is blocked on evidence this artifact does not hold. The row stays open until a wrong-code run records the alert.

### What the record lacks

The gaps behind the table above:

- **Screen the loop ended on:** `one-time-code`, inferred from the last branch. Its headings and controls are not recorded.
- **Role and accessible name of the alert:** not recorded. This is the discriminator between (a) and (b).
- **Which copy decided:** the worker, `@a11ign/screenreader-worker@0.13.2` (above).
- **Step count and budget left:** three branches, `index: 2`. Budget left is not recorded. The default budget was 90 s and the run used about 96 s of capture time, so the loop used its budget; the exact remainder at the end is not in the artifact.
- **Run id and artifact name:** run `38770567987`, artifact `auth0-e2e-evidence` (`11990569281`).
- **Real alert text:** absent. The transcript reader failed, so nothing holds it.

### Retry, as the row describes it

The row says a timeout is retryable once. The CLI's rule (`retryDecision`, `packages/cli/src/auth/login-outcomes.ts:79–80`)
retries only when the failure is `transient`, not final, on the first attempt, and at most once per run. The
worker's `loginEnded` (2727–2733) passes the outcome through and sets no `transient` flag. This run made one capture
attempt (`scan.err`: `Logins: 2 performed (1 capture attempts, 1 rule-layer scans)`), so no retry was exercised here.
Whether the CLI marks this outcome transient is not checked by this reading.

### Fixtures and controls

No fixture was added to `packages/cli/src/auth/screen-loop.test.ts`. The row asks for the real alert text as a labelled
constant, and that text is not in the record. A made-up string would make a test pass against a page nobody has seen.
The existing negative control, `screen-loop.test.ts:221` ("a callback that never settles ends signed-in-check-never-matched"),
is unchanged and is the control any future budget-timeout fix must keep passing.

### Next record needed

Naming the cause needs a run that keeps the one-time-code screen's controls and the alert's role and accessible name
in the trail or transcript. The loop does not record what it reads without acting, so the trail cannot show this
unless the record is widened. Ordering that run is a fleet action, so it belongs to `orchestrator`, not to this reading.

### What this reading does not verify

- The row's premise that a11ign#5495 and #5510 keep the loop branches. Neither number resolves in `a11ign/a11ign` or
  `a11ign/auth-capture-check`, so they were not read.
- Any behaviour of Auth0 itself. Everything above is from the worker's shipped code and this run's artifact.
