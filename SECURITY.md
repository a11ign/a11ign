# Security

## Reporting a vulnerability

Use GitHub's **[private vulnerability reporting](https://github.com/a11ign/a11ign/security/advisories/new)**
on this repository. Please do not open a public issue for anything exploitable.

There is no SLA. This is a small project with one maintainer, and saying so is more useful than promising a
response time nobody is on call to meet.

## What this tool does that you should know about before running it

a11ign drives a real browser and a real screen reader against a page you name. Five of its behaviours
are worth understanding before you point it at something.

### It operates controls on the page, and one probe presses buttons

`probeForms` **submits forms and activates buttons** — that is how criteria 3.3.1 (error identification) and
4.1.3 (status messages) are reachable at all; an error nobody hears only exists after a submit.

It therefore defaults **on in the GitHub Action and off in the CLI**, and the split follows who owns the page:

- a workflow runs against your own application, where submitting is intended
- the CLI can be aimed at any URL, and **pressing *Book* on a stranger's site is not a review**

`probeKindFor` decides what may be pressed, `chooseProbe` only dispatches on its answer, and the decision is
unit-tested (`probe-choice.test.ts`). A control is activated only
if it is a button whose name shares a meaningful word with the task you gave, or is submit-like — so
"show only bags" presses *Bags* and never *Delete account*. Disclosures are the one exception and are
activated unconditionally, because expanding something is side-effect-free.

**If you enable `probeForms` against a page you do not own, you are operating someone else's application.**

#### A forms config TYPES VALUES, which `probeForms` never does — 2026-09-03

`--forms <file>` (CLI) and `forms:` (Action) take a config that names fields by their **accessible name**,
gives each a **value**, and names the control to press (ADR 0024). So it does two things `probeForms` does
not:

- **It enters text into fields.** `probeForms` only activates controls; a config types the values you
  wrote into the fields you named. Whatever you put in a config is what gets typed.
- **It presses a control you NAMED, not one a heuristic chose.** The `chooseProbe` word-match guard above
  does not apply, because it exists to decide what is safe to press when nobody said — and here somebody
  did.

**That is a deliberate widening of what this tool will do, and the consent moves with it.** `probeForms`'s
split is about who owns the page; a config is an explicit instruction naming exact fields, exact values
and an exact control, so it is honoured wherever it is supplied — CLI included, and with `probeForms`
still off. Where a config applies it REPLACES the opportunistic probe for that capture rather than running
beside it.

Three things follow, and the third is the one to read before pointing this at anything real:

- **Nothing is submitted that the config does not name.** A field it does not name is not filled; a
  control it does not name is not pressed.
- **A field the config names that cannot be addressed by its accessible name is reported as a FINDING
  about the page (4.1.2), never as a configuration error.** A control a script cannot address by name is
  one a screen reader user cannot address either.
- **DO NOT PUT REAL CREDENTIALS OR REAL PERSONAL DATA IN A FORMS CONFIG.** It is a file in your
  repository, it is read verbatim, and the values are typed into a live page and can appear in the
  capture transcript — because NVDA announces what a field contains, and that transcript is the evidence
  this tool reports on and stores. Use test values against a staging environment. The corpus's own
  configured page uses `ada@example.test`.

#### What else may be operated, and the line that decides it — 2026-09-01

4.1.3 asks whether a status message is announced. Buttons were the only control that could fire one here,
so a live region updated by a **checkbox** or a **radio button** was structurally unreachable: real
filters, consent toggles and "show prices including VAT" controls are checkboxes far more often than they
are buttons.

**Checkboxes and radio buttons are now operated too, under `probeForms` and nothing else.** The line is
not "how likely is this to be destructive" — that is a judgement about somebody else's code that we cannot
make — it is **can activating this control navigate away or leave the page under measurement**:

| | operated? | why |
|---|---|---|
| disclosure | yes, ungated | expanding is side-effect-free; this predates the rest and is the loosest rule here |
| button | yes, if submit-like or task-named | activation is its whole purpose, so the NAME has to carry the consent |
| **checkbox, radio button** | **yes, under `probeForms`** | toggling a form control is the archetypal act of using a page, and it cannot navigate |
| `<select>` / combo box | **already was, and this does not widen it** | see below — it announces as *collapsed*, so the disclosure rule has always caught it |
| link | **yes: the first link on the page, by default** | `probeNavigation` follows it, because on almost every real page the first link is the skip link 2.4.1 tests. It has been on by default in the CLI and the Action since 2026-09-02 (`69dc7157`); the CLI's `--no-probe-navigation` turns it off, and the Action has no input for it. Until 2026-09-13 this row said links were not operated (#915, rehearsal 3) |

**A combo box has been operated all along, and writing this section is what found that.** The first draft
of this table said selects were not activated, citing the jump-menu idiom. Running `probeKindFor` on a real
announcement refuted it in one line: NVDA announces a `<select>` as `"Sort by, combo box, collapsed"`, and
rule 1 matches `collapsed` — so it is activated **unconditionally, without even `probeForms`**, and has
been since that rule was written.

That is worth stating plainly rather than quietly correcting, because the exposure is real and predates
this decision. It is also **smaller than it looks, for a reason that is checkable**: the disclosure probe
presses **Enter**, and Enter does not change a `<select>`'s value — arrow keys do. The jump-menu idiom
fires on `change`. So the navigation risk needs a value change that this tool never performs.

This is the same fact `screenreader_features.py` already records from the evidence side — *"Enter is not a
combo box's activation; the evidence is identical to a broken disclosure's, character for character apart
from the role"* — which cost 3 false positives when it was left implicit, and 12 more when the state-change
rule reproduced it. Here it is the third time, in the safety gate: **the control that is hardest to
classify is the one three separate layers have now each had to learn about separately.**

Two things bound this and both are load-bearing:

- **It changes nothing on a stranger's site.** `probeForms` is off in the CLI, so this only widens what
  happens where the operator has already said they own the page. A widening inside an existing consent is
  a different decision from granting one.
- **It is strictly more conservative than the disclosure rule already shipped.** Disclosures are activated
  with no gate at all, on the reasoning that expanding is harmless — which is an assumption about author
  behaviour, not a guarantee. Toggling a checkbox behind `probeForms` assumes less.

We are not claiming a checkbox can never do something surprising; an `onchange` handler can do anything a
disclosure's can. The claim is narrower and checkable: **it cannot navigate**, and navigation is what
separates "we observed the page" from "we left it".

### It can log in to the page it examines, and then it holds a credential — 2026-09-24 (ADR 0038)

Until this release nothing in the product could log in, and this file said the tool was "aimed at pages behind an
organisation's authentication" anyway. **That sentence was ahead of the product**, and it is replaced below by what
exists. Read [ADR 0038](docs/adr/0038-authenticated-capture.md) for the reasoning; this is what you need to know to run it.

**What exists.** A **form login**: `--flows <file> --login-flow <name>` (the Action's `flows:` and `login-flow:`). The
flows file names the login's steps by the *accessible name* of each control, in a closed vocabulary with no script step,
no evaluated expression and no fixed sleep, and pins the site's `origin:`. **A secret enters the run only as an
environment variable of the machine that drives the browser, and the flows file names the variable** (`from-env:`).
There is no `--password`, `--token`, `--cookie` or `--header` flag and no `password:` input, on purpose: argv is
readable in process listings and shell history, and an Action input is interpolated into shell text.

**Its status, measured 2026-09-25 (#2399).** The form login is implemented and has completed one authenticated capture on a real worker (`a11y-worker-3`, 64 announcements, on a fixture page built for the test). On that run **NVDA did not speak the text inserted through the browser protocol**: `npm run auth:leak-check` exited `0` on the raw transcript, and its positive control, a page that echoes the value back, exited `1`, so the check can see a leak when there is one. **That is one run, one machine and one page, with NVDA's typed-character setting as read there; it does not show the same of your page.** Everything below is what the code does and refuses, plus that one reading.

**What does not exist.** MFA, SSO and CAPTCHA (**use a dedicated test account without MFA or SSO**); saved storage
state; attaching to a browser you have signed in. A login that reaches an identity provider ends in `auth-login-failed`
(`left-origin`) and never in a capture.

**What an authenticated run presses — and only this.** A login makes the buttons real, so an authenticated run turns
`probe-forms` and `probe-navigation` **off, whatever you set**, and presses **only what its own files name**: the
login flow's steps, a flow's `press:` steps, and the states a forms config names. In a logged-in application *Save* and
*Send* are real, and the first link of a page is as likely to be *Sign out* as a skip link. Disclosures and Tab are
unchanged (expanding activates nothing, and Tab moves focus). The run says so before it starts, on stderr and as a
`::notice::` on the Action, and its report and `result-json` carry a **What this run pressed** list — by control name,
never a value.

**Where the credential goes, and where it does not.**

- **Never over the worker's channel.** The request to the worker carries the flow and the variable NAMES, never a value,
  and never a cookie or a storage state. A worker that is not on the same machine **refuses** an authentication request
  (`auth-refused-remote-worker`), because that channel is plain HTTP with no authentication and no TLS; a worker that
  predates the field is caught by insisting on `authApplied: true` in its answer (`auth-not-applied`).
- **Not into what the run writes or prints.** A screen reader announces what is typed, so every value (and its JSON-escaped,
  URL-encoded and base64 forms) is replaced with `‹credential›` before anything is written, printed, judged or reported,
  the count is disclosed, and a value that survives redaction — or a run of one-character announcements spelling one —
  ends the run with `auth-credential-in-artifact`, writing and printing nothing. **A value shorter than 8 characters is
  refused** (`auth-credential-too-short`): replacing `admin` everywhere would rewrite the page's own words, and its
  absence could not be proven. The Action also adds `::add-mask::` for the URL-encoded and base64 forms, which GitHub does
  not derive. `npm run auth:leak-check` has been read once against a real NVDA (2026-09-25, #2399: exit `0`, with a working positive control), and the first defence held on that page. **The redaction and the per-character refusal above remain the defence to rely on**; one reading is not a promise about yours.
- **Not to a rented judge.** Authentication with `JUDGE_BACKEND=codex|anthropic|openai` is refused
  (`auth-refused-judge-backend`) unless the run names `--send-authenticated-transcript-to-judge-vendor` (the Action's
  `send-authenticated-transcript-to-judge-vendor: "true"`), which **cannot be set from the environment** and, given,
  prints which vendor receives the transcript before the judge runs. Credentials are redacted first either way; the
  transcript is still the page's text.
- **Not to a public repository.** An authenticated Action run on a repository that is **not private** is refused whole,
  before NVDA is installed (`auth-refused-public-repository`): the pull-request comment, the job log, the uploaded
  artifact and the job summary would each show text from behind your login to anyone. Use a private repository, or the CLI
  on your own machine, where nothing is published unless you publish it.
- **Not kept.** A session does not outlive its capture: the worker clears cookies, cache and storage for the origin, closes
  the browser, and holds the response for one delivery only. The rule layer signs in for itself in its own in-memory
  browser and never receives a session from the worker.

**A worker that holds your variable is a credential custodian, and you must not make it one on a shared machine.** We do
not become a credential custodian (ADR 0038, clause 2), and a fleet worker that has a customer's variable in its
environment is one. **Do not export those variables into a shared fleet worker's environment.** In the Action the worker is
started by the Action on a throwaway runner from the environment you gave the step, and that is the supported route.

**What the SSH-tunnel tolerance does NOT cover.** A tunnel to a shared worker presents as loopback, so the refusal above
cannot tell it from a worker on this machine, and it is tolerated because the run sends no value: the tunnelled worker's
environment holds no such secret, and the run ends in `auth-credential-missing`, not in a session. **That reasoning stops
at a worker whose environment DOES hold the variable.** The same tunnel to such a worker yields a real session, in a browser
on a shared machine that other people can reach. Nothing in the tool can see the difference. It is why the paragraph above is
a rule and not a warning.

**A login is a real request to a real account.** Every authenticated run performs at least one login per capture and one per
page for the rule layer, and says how many before it starts. Use a dedicated test account on staging: repeated logins can
trip a lockout or bot detection.

### The capture worker has no authentication, and binds all interfaces

The Windows worker that runs NVDA serves plain HTTP on port 8765 with **no authentication of any kind** and
no TLS. This is deliberate and documented (`packages/control/ansible/README.md`), and it is why the
fleet is managed over SSH rather than by adding routes to the worker: *a mutating route there would be
unauthenticated remote code execution on every box in the fleet.*

The consequence for you:

- **Run workers on a trusted network segment only.** Never expose port 8765 to the internet, and do not
  assume a cloud provider's default security group does the right thing.
- A worker will capture any URL it is handed, from anyone who can reach it. Treat network reachability as
  full authority over that machine's browser.
- `/diagnostics` returns process lists, disk usage, browser profile sizes and screen-reader logs.

### The GitHub Action changes Windows settings on the machine it runs on, and they persist

The Action is built for a throwaway GitHub-hosted Windows runner. On any other Windows machine (a self-hosted
runner, a workstation), know that it writes these registry values, and **nothing in the Action puts them back**:

| key | value | written by | why | persists? |
|---|---|---|---|---|
| `HKLM\SOFTWARE\Policies\Microsoft\Edge` | `HideFirstRunExperience` = `1` (DWORD) | `action.yml`, step *Suppress Edge's first-run experience* | a fresh Edge profile shows a first-run sign-in surface, and NVDA's quick navigation escapes into it and reports findings about Edge's own chrome | **yes** — a machine-wide Edge policy for every user, until you delete it; the step creates the key with `New-Item -Force` |
| `HKLM\SOFTWARE\Policies\Microsoft\Edge` | `BrowserSignin` = `0` (DWORD) | the same step | the same | **yes**, the same |
| `HKCU\Control Panel\Desktop` | `ForegroundLockTimeout` = `0` (DWORD) | `packages/worker-fleet/src/provisioning/apply-foreground-lock-timeout.ps1`, run by the step *Allow Edge to be forced into the foreground* | with a non-zero timeout Windows will not let Edge be forced into the foreground, so NVDA reads nothing and a capture returns zero phrases with no error | **yes**, for the user account the runner uses — the script sets it through `SystemParametersInfo` with `SPIF_UPDATEINIFILE`, which writes it into that user's profile, and also writes the registry value directly |

Read from the step and the script, not from a run on a persistent machine: the Action has only ever been run
on throwaway runners. Windows' non-zero `ForegroundLockTimeout` is its protection against focus stealing: it stops
another application taking the foreground from the one you are using. **`0` turns that protection off, for every
application, not only Edge.** To undo on a machine you keep, delete the two Edge policy values and set
`ForegroundLockTimeout` back to what it was: rehearsal 3's runner started at `200000` (run 34774183433 logged
`ForegroundLockTimeout: 200000 -> 0`).

The Action also installs NVDA (`npx @guidepup/setup install nvda`) and turns off *Speech Viewer at startup* in the `nvda.ini` files of that installation, and installs Python packages with pip. Those are software changes rather than registry settings, and the same
throwaway-runner assumption covers them.

### Some environment variables are executable

`A11Y_PYTHON` is read at five call sites and becomes the interpreter that is executed. Passing it is
equivalent to running arbitrary code as the invoking user. The Ansible job interface never forwards
environment from its caller for this reason — its env is a fixed dictionary in the role, and jobs are named
from a fixed catalogue rather than passed as commands. See
`docs/adr/0032-the-scorer-runs-as-a-subprocess-in-a-python-venv.md` for why the scorer is a spawned
subprocess at all, rather than in-process JS.

Treat `A11Y_PYTHON`, `A11Y_SCORER_MODEL` and `DATASET_ROOT` as trusted-input-only.

## What it sends where

**Nothing, by default.** The judge backend defaults to `local` — our own trained scorer, running on your
machine. No page content, transcript or finding leaves the machine unless you opt in.

`JUDGE_BACKEND=codex|anthropic|openai` exist for comparison against a rented model. Setting one sends the
capture transcript — which contains the page's text as a screen reader announced it — to that vendor. If the
page is behind your authentication, that transcript may contain data from it. **An authenticated run therefore refuses a
non-local backend by default** (`auth-refused-judge-backend`), and the one override is
`--send-authenticated-transcript-to-judge-vendor`, an argument and never an environment variable: it prints the vendor
that receives the transcript before the judge runs, and credentials are redacted before the transcript leaves either way.

### And it will not start collecting, deliberately

Recorded 2026-08-27 as a decision rather than an omission, because "we have not built telemetry yet" and
"we are not going to" look identical from outside and only one of them is a promise.

There is a real cost to that. Nobody knows how the shipped scorer behaves on a consumer's pages: it is
calibrated against 94 real pages from five publishers, and a page shape absent from that set could be
mis-scored systematically without anyone learning. Every published rubric for a production model asks for
exactly this feedback loop.

It is still the wrong trade here. This tool can log in to a page behind your authentication (a form login, from a
flows file, with the credential taken from an environment variable — see above; MFA, SSO and CAPTCHA are out), and the
transcript IS the page's text. A usage report that carried enough to be useful would carry that;
one stripped until it was safe would say nothing about the finding it came from. There is no version of
this that is both informative and honest about the promise above.

What bounds the risk instead, none of which requires a consumer to send anything:

- **The mapping.** A finding from the model carries no `mapping`, and `RequirementMapping` treats absent as
  `secondary` — so it becomes `cantTell`, a referral for a human, never an assertion. The layer that
  ASSERTS is the deterministic one, measured at 0 false positives across 1,183 conformant records. A model
  wrong about somebody's page produces a question, not an accusation.
- **The proxy population.** `calibrate-abstention` scores the real-page corpus through the product path and
  reports ASSERTED-WRONGLY separately from REFERRED, which is the number to watch.
- **The abstention floor.** A page outside the model's support is abstained on rather than guessed at.

If you want us to know how it behaved on your pages, an issue with the capture JSON is the route — a
deliberate act by someone who has read what they are sending, which is the only form of this that respects
the paragraph above.

## Scope

In scope: anything that lets a page under test escape the capture sandbox, escalate on a worker, or reach
the control plane; anything that causes a finding to be silently fabricated or suppressed.

Out of scope: the unauthenticated worker port itself (documented above, by design), and denial of service
against your own fleet.

## Credential handling

ADR 0012 splits the control plane along what each side must hold: the control container holds the fleet SSH
key, the lab container holds **no** key, and Wake-on-LAN needs no credential at all. No password is stored
anywhere in this project. If you find one committed, that is a vulnerability — report it.
