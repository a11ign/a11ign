# ADR 0038: A run is authenticated by a login the machine that drives the browser performs, and no credential crosses the worker's channel

## Status

**Proposed, 2026-09-24.** Not accepted until `ceo` has reviewed it, and the security clauses in particular.
Row #2269, the design half of `ceo`'s ruling on #2262 ("c. Auth", comment 5810424410).

**It is a design. It ships no capability.** The build is its own row, and the SECURITY.md edit and the
known-gaps entry are each part of that build and not of this row.

**Seven clauses are FIXED INPUTS.** They are quoted below in the ruling's own words, under one heading each,
and this ADR does not re-argue them. What it decides is everything the ruling handed it by name: the
mechanisms' input surface, the override (or absence of one) on clause 5, the named navigation script, how a
list of URLs composes with it, what an authenticated run presses, and an estimate of the build.

**Read before quoting anything here as found.** The two research digests (#2262, comments 5810424674 and
5810424916) are the evidence for the mechanism survey and were not re-run. Every item they marked unverified
is still marked unverified where this file uses it, and the list is at the end. Every claim about NVDA's
behaviour under typing is **unmeasured** and says so.

## Context

**The chairman's first outside user could not run the tool on a product that sits behind a login, and nothing
in the product can log in.** Checked at `3301b804c`: no ADR mentions a login, `packages/cli` has no way to
log in to a page under test, and the one hit for `login` in the CLI source is about a `codex` login.

**Two problems share the word "authenticated", and the design turns on which one it is.**

| | where NVDA and the browser run | who else can reach the channel | so a secret in the request |
|---|---|---|---|
| **the GitHub Action** | a throwaway GitHub-hosted runner; the worker is started by the Action itself (`A11Y_WORKER: http://127.0.0.1:8765`) | nobody: one job, one VM | never leaves the machine, and a secret held in GitHub Secrets is read from that machine's environment |
| **a remote worker** | a fleet machine or a person's box, reached with `--worker http://host:8765` | anyone on the segment: plain HTTP, no authentication, no TLS, every interface (SECURITY.md, "The capture worker has no authentication") | hands a session to whoever listens |

**Four facts about the current tree make this harder than "add a login step".** Each was read from the
source, not assumed.

1. **The worker's request boundary ignores unknown fields on purpose** (`captureOptions`, `server.mjs`: "an
   unknown field must be ignored rather than obeyed"). That is what lets an older worker take a newer host's
   request, and it is also the exact shape of the defect clause 1 names: **an `auth` field sent to a worker
   that predates it is dropped, the login page is captured, and the report describes a login page as though
   it were the product.**
2. **The rule layer logs in separately.** `captureAndScan` runs the capture and axe-core concurrently, and
   axe loads the URL in the CLI's own Playwright browser (`pageContext`). A login performed only inside the
   worker's Edge would leave axe examining the login wall.
3. **The browser is reused across captures** (`browser-session.mjs`: "a persistent renderer keeps session
   state", on by default). On a fleet worker a session left in that browser is the next capture's session.
4. **The evidence leaves the machine.** The CLI writes the whole capture to `runs/witness/*.json`
   (`writeWitnessArtifact`), the Action prints it to `--json`, tells the user to upload it as an artifact
   (`result-json`), renders a summary that quotes announcements, and **by default posts that summary as a
   pull-request comment**. On a failed worker start the Action prints the worker's stdout and stderr into
   the job log.

## Decision

**A run is authenticated by a scripted login that the machine driving the browser performs, reading its
secrets from that machine's own environment. The request to the worker carries the script, with the NAMES of
the environment variables, and never a value.** That is clause 3, and it is also the only shape that makes
clause 1 structural rather than policed: a request with no secret in it cannot leak one over HTTP, so the
refusal below is a second lock and not the only one.

The seven clauses follow, each with what the design does with it. The decisions the clauses do not cover
come after them, under "The design calls beyond the seven".

## Constraint 1: credentials never cross the worker's HTTP channel

> **Credentials never cross the worker's HTTP channel, and a session is a credential.** Cookies and storage
> state count. **Remote-worker mode REFUSES an auth request with a named error until that channel is
> authenticated and encrypted** — it does not silently drop the login and report a page as clean.

**What crosses.** A login flow (selectors-free steps, see the primitive below) whose secrets are
`from-env: NAME` references; for saved state, a **path** on the worker's own machine. Never a value, never a
cookie, never a file's contents. Nothing derived from a session (cookies, storage state) is ever exported from
the worker to the CLI either: that is the same channel in the other direction, and it is why the rule layer
logs in for itself ("The design calls beyond the seven").

**What "remote" means.** A worker address whose host is `localhost`, a `127.0.0.0/8` address or `[::1]` is
local; every other address is remote. This is decided from the address the CLI was given, before a socket
opens. **An SSH tunnel to a shared worker presents as loopback and is not distinguished**, and the design
tolerates that because of the first sentence above: such a run carries no value, the tunnelled worker's
environment holds no such secret, and the run ends in `auth-credential-missing`, not in a session. (A fleet
worker that an operator has provisioned with a customer's secret would be a credential custodian, which is
clause 2.)

**The refusal, verbatim, and where it is raised.**

```
The worker at <host> is remote, and this run needs to log in. The worker takes plain HTTP with no
authentication and no TLS, so anything sent to it can be read by anyone on the network, and a session is
a credential. Nothing was sent and no page was examined. (fault: auth-refused-remote-worker)
  What happened: the run asked for authentication and its worker is not on this machine.
  Try: run the capture on the same machine as the browser (the GitHub Action does this), or point
       --worker at http://127.0.0.1:8765.
  See: docs/adr/0038-authenticated-capture.md, Constraint 1.
```

Raised **in the CLI, in `captureViaWorker`, before the request body is built**, and again on the axe path
before Playwright launches, so that neither layer can proceed. It is a fault code with a
`FAULT_REMEDIATION` entry in `packages/cli/src/fault-remediation.ts`, in the shape the existing codes use
(what / try / where), because ADR 0028 says recovery and messages are keyed on codes and never on wording.
**A run in remote-worker mode with an auth request produces THAT error and never a report**: exit status
non-zero, no `runs/witness` file, no summary, no PR comment.

**The worker refuses too, and an older worker cannot be trusted to.** A worker that knows `auth` answers `403
auth-refused-remote-worker` to an auth request whose socket peer is not loopback. A worker that does not know
it ignores the field (fact 1), so **the CLI requires a positive acknowledgement**: the response to an auth
request must carry `authApplied: true`, and a response without it is `auth-not-applied` and no report. Absence
of the acknowledgement is a failure and never a clean page, which is ADR 0020's rule ("unexamined is not
failing") applied to the login.

**A failed login is an error and not a finding about the page.** Wrong credentials, a login page that
changed, or a field the script cannot address by accessible name end in `auth-login-failed` with the reason
(`expect-not-met`, `unbindable-field`, `left-origin`), the step, and no report of the target. The `expect:`
step at the end of a login flow is **required by the schema**: a login with no post-condition would report the
login wall as a page.

**The channel is not designed here.** Making the worker's channel authenticated and encrypted is a separate
decision with its own ADR, and until it exists the refusal stands. **Even then, shipping secrets to a shared
fleet worker is Clause 2's custodianship**, so the ADR that opens the channel must answer that first.

## Constraint 2: we do not become a credential custodian

> **We do not become a credential custodian.** The vendor-hosted vault is ruled OUT. It contradicts
> SECURITY.md's "nothing leaves the machine by default", and it is the one mechanism that ships secrets to a
> third party.

**What the design does with it.** The tool has no place to store a secret and no command that would write
one. There is no `--password`, `--token`, `--cookie` or `--header` flag and no `password:` input on the
Action, **on purpose**: argv is readable in process listings and shell history, and an input is interpolated
into the workflow's shell text. A secret enters the run only as an environment variable of the machine that
drives the browser (`env:` on the workflow step that calls the Action), and the flow file names the variable.
The flows schema has no field for a literal secret in a login flow (see "The primitive"), so a password cannot
be committed by typing it into the file the tool reads.

**Nothing is persisted.** The scrub set (Constraint 4) exists only in the process's memory. A saved storage
state is the user's file, on the user's machine; the tool reads it and never copies it.

## Constraint 3: the chosen direction, and the input surface for it

> **Chosen direction: a scripted login run on the machine that drives the browser, secrets read from that
> machine's environment** (GitHub Secrets on the throwaway runner). Form login over token injection
> (Lighthouse's own recommendation). Saved storage state second. Attaching to a person-signed-in browser is
> the third, for interactive use, and it is the only one that handles MFA/SSO.

**The input surface, in `ceo`'s order.** At most one mechanism per run; two given is `auth-ambiguous`.
Nothing is discovered implicitly: every path is named, as ADR 0024 decided for `--forms`.

| | CLI | Action input | Secrets |
|---|---|---|---|
| **1. form login** | `--flows <file> --login-flow <name>` | `flows:` and `login-flow:` | environment of the step: `env: { APP_TEST_USER: ${{ secrets.X }}, ... }`; the flow names them |
| **2. saved storage state** | `--flows <file> --login-flow <name> --auth-state <path>`: the state is loaded, then the flow runs, and its `expect:` step is what decides the state is still good | `flows:`, `login-flow:` and `auth-state:` | the state file is the secret; the Action reads a path a previous step wrote to `$RUNNER_TEMP` |
| **3. attach to a signed-in browser** | `--auth-attach <http://127.0.0.1:PORT>`, a debugging endpoint of a browser the person launched and signed in | **none, on purpose** | none: the person's browser holds the session |

Three notes, each a decision.

- **Mechanism 3 is CLI-only, loopback-only, and not unattended.** It is the only route through MFA and SSO
  and it needs a person present, which a throwaway runner does not have. **Its feasibility is unverified**:
  the worker owns the browser it launches (`--app` window, a debugging port it opens, and it kills stray
  browsers), so attaching the worker to somebody else's Edge conflicts with that ownership. It is therefore
  **a spike row first, before any build**, and the estimate below does not cover it.
- **`env:` reaching a composite action's steps is believed, not verified.** If the build's first run shows it
  does not, the fallback is an input mapped into the step's `env:` and **never** into `run:` text.
  Interpolating `${{ inputs.x }}` into the shell is what the Action does today for `url` and `task`, and a
  secret must not go that way.
- **The Action masks more than GitHub does.** GitHub masks a secret's exact value in logs and nothing derived
  from it. The Action adds `::add-mask::` for the URL-encoded and base64 forms of every `from-env` value at
  the start of the step, and the masks do not apply to files, which is why Constraint 4's command exists.

## Constraint 4: the transcript and the evidence JSON are PROVEN not to contain the credential

> **A screen reader announces what is typed.** The capture transcript and the evidence JSON must be proven
> **not to contain the credential** — a username can be echoed. That is an acceptance the design row must
> state as a command, with a positive control.

**Two defences, and the proof of the second is the command.**

1. **Prevention, by construction.** Login steps enter values with the browser protocol's text insertion, which
   produces no key events, and the transcript does not begin until the login flow has ended and the page has
   settled. So the login is not in the transcript to start with. **That NVDA stays quiet on inserted text is
   UNMEASURED**: NVDA's typed-character setting is one this worker has never called
   (`docs/screenreader-settings-audit.md`, "`speakTypedCharacters` is real and never called"), so it is at
   NVDA's default, and that default is not recorded in the repo. The build reads it from
   `/diagnostics.screenReaderDefaults` as its first act, and the design does not depend on the answer,
   because of the second defence.
2. **Containment, at the one place bytes leave.** Everything the CLI writes or prints passes through one
   function that replaces every occurrence of every `from-env` value, in its raw, JSON-escaped, URL-encoded
   and base64 forms, with `‹credential›`, counts the replacements, and **discloses the count** ("2
   announcements contained a value from your login and were redacted"). After replacing, it scans again, and
   **a remaining hit is `auth-credential-in-artifact`: nothing is written and nothing is printed.** A page
   that legitimately says "Signed in as ada" therefore does not fail the run and does not publish the name.
   The username is scrubbed like the secret, because the ruling puts it in the credential: it is often an
   email address.

**Scope of the proof.** Everything that leaves the machine, and not only the two named files: the `--json`
output, `runs/witness/*.json`, the rendered summary (which is posted as a PR comment), and the worker's
stdout and stderr (which the Action prints into the job log when the worker does not start).

**The command.** A build row can run this. `scripts/auth-leak-check.mjs`, wired as `npm run auth:leak-check`,
is proposed; it does not exist yet. It drives a real capture in which a login flow types a **known fake
credential**, then searches what was captured and written for it, and fails on a hit.

```bash
export FAKE_USER=canaryuser6d3f2a FAKE_SECRET=canarysecretb81c94   # letters and digits only, see below

# THE REAL RUN. The fixture does not echo the credential. Must exit 0 and print a non-zero examined count.
npm run auth:leak-check -- --fixture login-quiet --stage written --user-env FAKE_USER --secret-env FAKE_SECRET

# POSITIVE CONTROL 1. The fixture DOES echo the credential (its account page pre-fills the username into an
# edit field, which the form-field sweep reads aloud), and --stage raw reads the worker's response before
# the scrub. Must exit EXACTLY 1: exit 2 means the command could not run and is not a pass.
npm run auth:leak-check -- --fixture login-echo --stage raw --user-env FAKE_USER --secret-env FAKE_SECRET; test $? -eq 1

# POSITIVE CONTROL 2. The same echoing fixture, but the artifacts the tool WROTE. The containment must have
# removed it: exit 0, and the printed redaction count is at least 1, so the scrub demonstrably had work to do.
npm run auth:leak-check -- --fixture login-echo --stage written --user-env FAKE_USER --secret-env FAKE_SECRET
```

**The exit code is a contract.** `0` clean, `1` a leak was found, `2` the command could not examine anything.
Every run prints how many files and announcements it examined, **and examining zero is exit `2`**, so a
capture that produced nothing, or a scan pointed at an empty directory, cannot read as clean. The first
command's exit `0` is an emptiness claim, and it is vacuous unless a **positive control** shows the detector
can fire: that is the second command, and the two are read together.

**The fake credential is letters and digits only, on purpose.** NVDA speaks a typed punctuation character by
its name, and it speaks typed characters one at a time, so **a credential typed by keystroke appears in a
transcript as a run of one-character announcements, and a contiguous-string search misses it.** The detector
therefore also searches for a run of four or more consecutive one-character announcements that spell a
substring of a credential, case-insensitively. That branch has its own positive control, at the level a
Linux CI job can run: a checked-in transcript in which the fake credential is spelled out, fed to the
detector, must be reported. Both live in `auth-leak-detector.test.ts`, which the build row's Acceptance
runs, and which needs no Windows machine.

## Constraint 5: authentication plus a non-local judge backend refuses by default

> **Auth + a non-local judge backend refuses by default**, because SECURITY.md already says a transcript
> from behind authentication reaches the vendor under `JUDGE_BACKEND=codex|anthropic|openai`.

**There is an override, and it is narrow.** A person who authenticates and chooses `anthropic` has made that
choice with their own key and their own data, and refusing forever would only send them to a workaround. So:

- The refusal is `auth-refused-judge-backend`. Its text names the backend that would receive the transcript,
  says what a transcript from behind authentication may contain, and **names the override**, so the refusal
  is remediable without editing code.
- **The override is one flag per run: `--send-authenticated-transcript-to-judge-vendor` (CLI) and
  `send-authenticated-transcript-to-judge-vendor: "true"` (Action).** It is deliberately long and single
  purpose. **It cannot be set from the environment**, so that a variable left in a shared runner cannot turn
  it on for a job that never named it. Given, the run prints on stderr which vendor receives the transcript
  before the judge runs.
- **It does not extend to credentials.** They are scrubbed before the transcript leaves (Constraint 4), and
  the override does not switch that off.

**Where it is raised.** At argument resolution in the CLI, before the capture starts, so that a refused run
does not first spend a 300 second capture. The decision **calls `judgeBackend()` from `@a11ign/judge`**, the
function the judge itself reads `JUDGE_BACKEND` with, and does not re-spell the comparison: that function
lower-cases the value and treats an empty string as `local`, and a second spelling of it would disagree the
first time one of them changed. The Action's *Check the judge is usable* step repeats the check in shell
for the same reason it already exists, which is to fail before NVDA is installed.

## Constraint 6: MFA, SSO and CAPTCHA are out of v1

> **MFA, SSO and CAPTCHA are OUT of v1, recorded as a known gap** (`docs/known-gaps.md`), with "use a
> dedicated test account without MFA" as the stated route (the advice BrowserStack and LambdaTest give).

**What the design does with it.** Nothing to build, and three things to make true.

- **The known-gaps entry is the build's row, filed with the build**, as the ruling says. This ADR does not
  write it and the build row's Region carries it.
- **A login that reaches one of them ends in a named error and never in a capture.** The flows file pins an
  `origin:` (below); a redirect to an identity provider is a `left-origin` `auth-login-failed`, and a login
  that stops at a challenge fails its `expect:`. A CAPTCHA appearing mid-run reads like a broken page, which
  ADR 0024 already records as this repo's most expensive recurring shape, so the error's remedy names the
  dedicated test account.
- **Mechanism 3 is the only route through them**, for interactive use, and is a spike (Constraint 3).

The evidence is the digests': every hosted tool that supports login excludes or leaves undocumented OTP, SMS,
CAPTCHA and OAuth-only flows, and none is documented as handling them unattended.

## Constraint 7: `probe-forms` presses buttons, and a login makes the buttons real

> **`probe-forms` presses buttons, and a login makes the buttons real.** The design row must say what an
> authenticated run presses and how a user is told. **The SECURITY.md change lands in the SAME PR as the
> capability.** SECURITY.md already says the tool "is aimed at pages behind an organisation's authentication"
> while nothing in the product can log in; that sentence is a claim ahead of the product.

**What an authenticated run presses.** The inventory is wider than `probeForms`, because a logged-in first
link is as real as a logged-in button. Read from `capture-probes.mjs` and SECURITY.md's operated-controls
table:

| operated today | on an authenticated run |
|---|---|
| a button that is submit-like (`submit`, `sign in`, `save`, `send`) or shares a word with the task (`probeForms`) | **not pressed automatically.** In a logged-in application *Save* and *Send* are real. |
| checkboxes and radio buttons (`probeForms`) | **not toggled automatically**, for the same reason |
| the first link, followed (`probeNavigation`, on by default in the CLI and the Action) | **off.** The first link of a logged-in page is as likely to be *Sign out* as a skip link, and following it ends the session under test. |
| disclosures and combo boxes (Enter) | unchanged: expanding is side-effect free, and this is the rule already shipped |
| Tab (`probeFocus`) | unchanged: it moves focus and activates nothing |
| **what the run's own files name** | **pressed, and only this**: the login flow's steps, a flow's `press:` steps, and the states a forms config (ADR 0024) names |

So an authenticated run presses **only what its files say**, which is ADR 0024's consent rule ("consent
attaches to the specific dangerous operation instead of to forms in general") extended to the whole run. The
Action's `probe-forms` and `probe-navigation` defaults are `"true"`, and an input's default cannot be told
from an explicit `"true"`, so **the narrowing is applied to every authenticated run, and an author who wants
a press writes it as a `press:` step.** Refusing the combination outright was rejected: it would take away
the route to 3.3.1 and 4.1.3 that a forms config already provides.

**How the user is told, in three places.**

1. **At the start**, on stderr and as a `::notice::` on the Action: "authenticated run: automatic pressing
   and link-following are off; this run will press only what your flows and forms config name."
2. **In the report**, a list headed "What this run pressed", from the capture's own `interaction` record,
   with the control's accessible name for each. It does not list values.
3. **In SECURITY.md**, below.

**The sentence that is ahead of the product.** `SECURITY.md`, in "And it will not start collecting,
deliberately" (line 180 at `3301b804c`): *"This tool is aimed at pages behind an organisation's
authentication, and the transcript IS the page's text."* Nothing supports that sentence today. **The
capability's PR must change it in the same diff**: say which mechanisms exist and which do not (MFA, SSO and
CAPTCHA are out), replace the aspiration with the supported claim, add the "what an authenticated run
presses" section above, and add Constraint 5's refusal to "What it sends where". **Requirement on the build
row:** its Acceptance must include a command that fails when the capability PR does not touch that file, for
example `git diff --name-only origin/main...HEAD | grep -c '^SECURITY.md$'` printing at least `1`. Because
the build is several PRs, **the capability is the PR that makes the flags reachable**; every earlier PR is
code no flag can reach, and SECURITY.md changes in that last one.

## The design calls beyond the seven

**The primitive: a flow, designed once.** One file holds named flows, and every use of it (a login, a
complete process, a step before one URL) is the same thing. It is the primitive `ceo`'s ruling asked for, and
it is what ADR 0024 deferred when it said a wizard "turns a declarative file into a script and is where
Playwright ends up. That is v2 and it is a different design."

```yaml
version: 1
origin: https://app.example.test        # every goto is resolved against it, and leaving it fails the run
flows:
  login:
    steps:
      - goto: /login
      - fill: { field: "Email address", from-env: APP_TEST_USER }
      - fill: { field: "Password",      from-env: APP_TEST_PASSWORD }
      - press: "Sign in"
      - expect: { heading: "Dashboard" }          # REQUIRED as the last step of a login flow
  checkout:
    steps:
      - goto: /cart
      - press: "Proceed to checkout"
      - capture: cart-review                      # a capture point; a flow with none captures at its end
      - fill: { field: "Postcode", value: "AB1 2CD" }
      - press: "Continue"
      - capture: delivery
```

- **A closed vocabulary: `goto`, `fill`, `choose`, `check`, `press`, `expect`, `capture`.** No script step, no
  evaluated expression, no fixed sleep (`expect` waits, with a bound). This is a security property and not a
  simplicity one: the file runs with secrets in its environment, and a file that can run code is the "some
  environment variables are executable" class SECURITY.md already warns about.
- **Controls are addressed by accessible name, never by selector**, ADR 0024's decision 1 and for the same
  reason: a control the script cannot address by name is one a screen-reader user cannot address either.
  `within:` and `nth:` disambiguate as they do there. On a *login* this is not a finding to report
  alongside a page: it is `auth-login-failed` with reason `unbindable-field` and the field's name, because
  nothing after it can be examined. **This is a real cost**: an inaccessible login form cannot be tested with
  this tool. It is listed under "What would falsify this".
- **`fill` takes `from-env:` or `value:`, and a login flow's `fill` takes only `from-env:`.** The schema
  refuses a literal in the flow that `--login-flow` names, and the worker refuses a literal typed into a
  password-type input in any flow (`auth-literal-secret`). A value from `from-env:` is a credential wherever
  it appears and joins the scrub set.
- **`origin:` is pinned**, as ADR 0024 pins it, so a flow written for staging cannot be pointed at production.

**The `press:` question (#2268's deferral), answered: `task` does not become a `press:` list.** The
explicit form of "press this control" is the `press:` **step** in a flow, per page, which is what ruling (a)
called the same question as per-page declarations. `task` keeps what ruling (a) gave it: a label for the
report and a word-match guard for the un-scripted, un-authenticated `probeForms` press. It gains no second
meaning, and a flow makes it irrelevant on the pages it covers. Deciding it here once is the point: two
declarations of the same act would disagree.

**How a URL list composes with it.** The URL-list row ships v1 with no flows, and the shape below is what it
must already accept so that nothing is undone.

```yaml
urls:
  - https://app.example.test/pricing                          # v1: a plain string
  - { url: https://app.example.test/login, auth: none }       # the login page itself, unauthenticated
  - { url: https://app.example.test/orders }                  # authenticated by the run's --login-flow
  - { url: https://app.example.test/cart, flow: checkout }    # flow runs after the login, from this URL
```

- **The login is run-level and a per-entry `auth: none` opts one entry out.** WCAG-EM's sample includes
  authentication pages, and the login page examined **while logged out** is one of them.
- **A flow yields one capture per `capture:` step**, or one at its end. Each is one capture for the cap and
  for the "N captures, about X minutes" line, which for an authenticated run also says how many logins it
  will perform.
- **v1 of the URL-list row must REFUSE `flow:` and `auth:` by name** ("flows arrive with the authenticated
  capture build"), and never ignore them. A v1 that skipped an unknown key would capture the page unscripted
  and report it as the scripted one, which is Constraint 1's defect arriving through the list.

**On the wire and per capture.** A capture request carries `{ url, flow: <the resolved steps>, upTo: <index> }`
and the worker replays the login and then the flow to that point. **The login runs once per capture** and
the session is destroyed after it. Holding a session across captures in the worker was rejected for v1: it
makes the worker stateful with a credential-equivalent that any client of that port could reuse, which is
Constraint 1's exposure in a new place. The price is named: N captures are N logins, and a flow with k
capture points replays its prefix each time. That can trip a lockout or bot detection, which ADR 0024
already recorded for repeated submissions, and it is a falsifier below.

**The rule layer logs in for itself.** The CLI runs the same flow in its own Playwright context before axe
scans, from the same environment, on the same machine. That is two logins per capture. The flow interpreter
is written over a small driver interface with two implementations (the browser protocol in the worker,
Playwright in the CLI). Exporting the worker's session to Playwright was rejected because it is Constraint 1's
channel. **If the second driver proves the largest part of the build, the cut is to skip axe on an
authenticated run in v1**, reporting the rule layer as *unchecked* and never as clean (ADR 0020), which
takes one PR out of the estimate.

**A session does not outlive its capture.** After every authenticated capture the worker clears cookies and
storage for the origin, closes that browser, and evicts the capture's stored response. An authenticated
request is never served from a reused browser (`reuseBrowser` is forced off for it), and the worker's
in-memory result history (`RESULT_HISTORY`, the last eight responses, replayable by id) never holds an
authenticated transcript after it has been delivered once.

**The Action's pull-request comment.** The summary quotes announcements, and `comment-on-pr` defaults to
`true`. **On a public repository that would publish text from behind a login.** An authenticated run on a
repository whose `event.repository.private` is not `true` refuses `comment-on-pr: "true"` with
`auth-refused-public-comment`, and the input's description says so. **This is not one of the seven and is
`ceo`'s to confirm** on the PR.

## Consequences

**A login page that changes breaks the run**, and the message names the step. That is right: silence would
be the alternative.

**An authenticated run examines less than an unauthenticated one by default**, because it does not press or
follow anything the author did not name. The report says so, and for the criteria that need a press it says
they were not reachable rather than clean.

**Every authenticated run costs at least two logins per capture**, one per layer, and a login is a real
request to somebody's system with a real account. The docs lead with a dedicated test account and staging,
as ADR 0024's do for form states.

**Nothing on the lab side gains an authentication surface.** `training:capture`'s cache key describes
evidence (ADR 0025) and a session cannot be part of a key that is committed, so the calibration corpus stays
public pages, and authenticated capture is a product-path feature only.

**The scrub can alter what the scorer reads**, by replacing a username with a marker. That is the
containment's price. It is why the count is disclosed rather than hidden, and why the first defence (do not
type into the transcript) matters more than the second.

## Alternatives rejected

**A vendor-hosted credential vault** (BrowserStack, LambdaTest, Siteimprove, axe Monitor; Level Access is
**unverified**). Rejected by Constraint 2. The digest's own table says the vendor is the credential holder
and that it is the only mechanism that ships secrets to a third party. Sources: BrowserStack says
credentials are "encrypted and stored securely" and advises sample accounts "not associated with a real
person" (its *test pages behind login* and *sensitive credentials* pages); Siteimprove says credentials are
entered in the platform and held in AWS secrets storage (its *adding and replacing credentials* page); axe
Monitor keeps credentials in scan-level environment variables Deque holds (its *advanced scans* page). Their
limits are the digest's: OTP, SMS, CAPTCHA and OAuth-only flows are excluded or undocumented, which is also
what Constraint 6 records for this tool.

**Cookie or header injection** (pa11y's `headers`, Lighthouse's `extraHeaders`). Rejected: a cookie is a
session and so a credential (Constraint 1) that would sit in a workflow file or an environment variable for
as long as it lives, it expires without saying so, and there is no step to check it still works. Source:
Lighthouse's own authenticated-pages documentation recommends the form-based login and says to "only
directly set the token... as a last resort"; its list notes that a cookie header "will override any other
Cookies you expect to be there".

**Reusing a browser profile** (Lighthouse's Chrome-profile option). Rejected: a profile carries every
session the person has, where the design's whole point is one dedicated test account, and the digest reports
that Lighthouse itself calls the option "still under development". This worker also prunes and replaces its
profile, so the two would fight.

**A declarative `auth:` block with a username selector and a password selector** (the shape of BrowserStack's
and LambdaTest's saved profiles). Rejected: it cannot express a multi-page login, which BrowserStack ships
separately as "Multipage auth", it uses selectors that ADR 0024 rejected, and it would be a second
primitive beside the flow that WCAG-EM's "complete processes" need anyway.

**Sending secrets in the request body once the worker speaks TLS.** Not rejected forever and not decided
here. Clause 1 names the condition (an authenticated and encrypted channel), and a shared fleet worker that
receives a customer's secret is a custodian, which is Clause 2. That is its own ADR.

**Login once per run, with the session held in the worker.** Rejected for v1, above.

**Prevention only, or a scrub only.** Rejected each. Prevention alone is a bet on NVDA's behaviour that this
ADR has not measured and cannot make on a page that legitimately echoes an account name. A scrub alone would
leave a per-character echo in the transcript that the scorer reads.

**Extension in the person's signed-in browser** (WAVE, Evinced's `active_tab`, Siteimprove). Not adopted as
a mechanism; it is the closest cousin of mechanism 3, and the digest's stated limit for it is "manual,
single page".

**Network-side trust** (Siteimprove's IP allowlist or auth proxy). Rejected for v1: the Action runs on
runners whose addresses change, and the change would be to the user's network and not to this tool.

**Making `task` a `press:` list.** Rejected above.

## What would falsify this

- **NVDA echoes text the browser protocol inserted**, so that the login is in the transcript. Then the
  design's first defence is false and the scrub carries the whole load, and the disclosed redaction count on
  real runs is the number to watch. The decision survives; its stated safety margin does not.
- **A real login the chairman's outsider needs cannot be written in the closed vocabulary**, for instance a
  custom widget with no accessible name or a step that must wait on script. Measure it on the second outsider
  run: how many of the first logins written were expressible.
- **An outsider's product signs in with SSO.** Then v1 does not reach them, and the known gap is the first
  thing they meet and not a footnote. The estimate would have to be redone around mechanism 3.
- **A login form the script cannot address by accessible name.** That is a real 4.1.2 failure of the
  product under test, and a tool that cannot get past it cannot report on anything behind it. If an
  outsider hits it, the amendment to weigh is a selector escape hatch for the *login flow only*.
- **Login per capture locks an account or trips bot detection.** Then the held-session design becomes the
  price of using the tool on that product, and Constraint 1 has to be re-read against it.
- **The composite action does not pass step `env:` through.** Then the fallback in Constraint 3 applies.
- **A worker that the refusal did not stop.** Any run in remote-worker mode that produces a report has
  falsified Constraint 1's enforcement, and the test that shows it is the first one the build row writes.

## Sources, and what stays unverified

The mechanism claims are from the two digests on #2262 (comments 5810424674 and 5810424916), whose sources
are the vendors' own documentation: Lighthouse authenticated pages and Lighthouse CI configuration; pa11y
and pa11y-ci; Playwright's authentication guide (its `storageState` file "may contain sensitive cookies and
headers that could be used to impersonate you or your test account"; `sessionStorage` is not persisted);
Cypress `cy.session`; BrowserStack; LambdaTest; Siteimprove; axe Monitor; WAVE; Evinced; W3C WCAG-EM Step 3.

**Unverified, and used above only as marked:** axe DevTools Pro limits; Level Access (its help pages
returned 403, snippets only); Accessibility Insights authentication (no authoritative source);
cypress-axe (no primary source); Siteimprove's sources conflict on MFA; every pricing figure except WAVE's.
**Not from the digests and mine:** the default cap numbers (`ceo`'s own, marked as chosen), every claim
about NVDA's typed-character behaviour (unmeasured), and the three unverified assumptions named where they
occur (`env:` reaching a composite action's steps, feasibility of mechanism 3, and that the browser
protocol's text insertion produces no key events for NVDA to speak).

## Estimate of the build row

**What this estimates.** Elapsed working time for one engineering session, from the claim of the build row to
the merge of **the pull request that makes the mechanism 1 flags reachable**, with a fleet worker available
for the acceptance runs. It counts the flows primitive, all seven clauses' enforcement, the leak check and
the SECURITY.md change. **It does not count:** mechanism 2 (storage state), mechanism 3 (a spike, then a
build, and not estimable before the spike), the URL-list row, the capture-cost measurement, the known-gaps
entry (its own filing), or the second outsider run.

| PR | contents | needs a Windows worker to accept |
|---|---|---|
| 1 | flows schema, parser and validator; `origin:`; closed vocabulary; literal refusal | no |
| 2 | scrub, leak detector and `auth-leak-detector.test.ts` with both positive controls | no |
| 3 | named errors and `FAULT_REMEDIATION` entries; the remote-worker refusal; `authApplied`; the judge-backend refusal and override | no |
| 4 | the worker's interpreter over the browser protocol, session purge, `reuseBrowser` off, result eviction | **yes** |
| 5 | the Playwright driver for the rule layer | no |
| 6 | fixtures `login-quiet` and `login-echo`; `auth:leak-check`; its three commands run on the fleet | **yes** |
| 7 | the Action's inputs, masks, notice and public-repo comment refusal; the flags become reachable; **SECURITY.md** | **yes**, one Action rehearsal |

**Seven pull requests, three needing NVDA. The central figure is three working days, and the range is two to
five.** Confidence is low, and the reasoning is stated so it can be attacked:

- **Measured:** the last 40 merged pull requests opened and merged with a median of 26 minutes and a 90th
  percentile of 76, `gh pr list --state merged --limit 40` at 2026-09-24. That is review-and-merge latency
  after a pull request opens, and it says nothing about authoring time.
- **Not measured, and the largest uncertainty:** the authoring time of PR 4 and PR 6, which need NVDA's real
  behaviour under a login (the first unmeasured fact above) and a fleet worker, and the fleet's contention
  for acceptance runs, which nothing here measures. **These two are where five days comes from.**
- **Cuts, if the date matters more than the coverage:** skip the rule layer on authenticated runs (PR 5,
  reported as unchecked), which takes a half day out.

**`ceo`'s proposal was that the chairman's due date attach to the second outsider run.** This estimate is
for the auth build alone. The outsider run also waits on the URL-list row and the cost measurement, and a
date set from this figure alone would omit both.
