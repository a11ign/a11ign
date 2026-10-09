# Try it in two hours

You already run an automated accessibility scanner in CI. This is a second layer that answers a different
question, and this page is the shortest honest path to finding out whether it is worth your time.

**We want your reaction, not a bug list.** If the output is not worth the minutes, that is the most
useful thing you can tell us, and it is the answer we have no other way of getting.

## What this finds that your scanner does not

Your scanner reads the markup. This drives **a real screen reader — NVDA, on Windows — through the page**
and records what it actually said.

That reaches failures markup cannot express, because they are about a *moment* rather than a state:

- a skip link that is present, correct-looking, and **inert**;
- a route change where the page updates and **the title does not**, so a screen reader user is told
  nothing about where they now are;
- a filter or form control that changes the page and **announces nothing**;
- a tab order that **contradicts the reading order** — the DOM has no reading order to contradict until
  something walks the page.

Every finding quotes the announcement it rests on. When we say a control is unnamed, the report shows you
the words NVDA spoke.

## What it will not do, stated up front

- **It does not replace your scanner.** It covers a handful of criteria deeply; yours covers many
  shallowly. Run both.
- **Most of what it reports is a referral, not an accusation.** The deterministic rules assert; the
  trained component only ever says *this is worth a person's look*. A referral on a page you believe is
  fine is expected behaviour, not a bug.
- **It needs Windows**, because NVDA is Windows-only. That is the real cost of the two hours.
- **It is published to npm, and it still needs a Windows machine.** `a11ign@0.5.3` was the registry's `latest` and `a11ign@0.5.4` its `next` when this was last checked (2026-10-09, `npm view a11ign dist-tags` printed `{ next: '0.5.4', latest: '0.5.3' }`: a reading at a moment, so check it again). This guide pins `latest`, by its commit, in every workflow below. `npx a11ign <url>` saves the clone and the build, not the machine: it needs the same capture worker as a clone does. [The commands are below](#the-other-route-run-it-from-the-repository).

## The fastest route: a GitHub Actions run

If your app is on GitHub, this needs one workflow file and no machine of your own.

```yaml
name: a11ign

on:
  pull_request:
  workflow_dispatch:

jobs:
  a11ign:
    runs-on: windows-2022        # NVDA is Windows-only; the action fails fast anywhere else
    timeout-minutes: 20          # a run that will not finish says so here, not after GitHub's own default
    permissions:
      contents: read
      pull-requests: write       # for the PR comment below; omit it and the report still runs, only quieter
    steps:
      - uses: actions/checkout@v7
      - uses: a11ign/a11ign@15881c7c59bee7cb49b464932f9732cb51e088f9   # the commit of the release tagged a11ign@0.5.3
        # Pinned to the full 40-character commit of release 0.5.3, so your CI does not move when a newer
        # one is published -- GitHub refuses an abbreviated SHA outright, it does not just discourage it.
        # To take a newer release, read `npm view a11ign dist-tags` for its number and
        # `git ls-remote https://github.com/a11ign/a11ign 'refs/tags/a11ign@*'` for its commit.
        id: a11ign
        with:
          url: https://your-site.example/the-page
          task: Send an enquiry
      # Keep the evidence: the full result, transcript included. Guarded on the output existing, so a run
      # that failed does not also fail the upload. `summary-md` is the rendered report; upload it beside the result.
      - uses: actions/upload-artifact@v7
        if: always() && steps.a11ign.outputs.result-json != ''
        with:
          name: a11ign-result
          path: |
            ${{ steps.a11ign.outputs.result-json }}
            ${{ steps.a11ign.outputs.summary-md }}
          if-no-files-found: warn
```

Save it as `.github/workflows/a11ign.yml`. It runs on every pull request, and `workflow_dispatch` also lets you start it by hand from the repository's Actions tab (or `gh workflow run a11ign.yml`) — `workflow_dispatch` resolves the workflow from the default branch as GitHub sees it at dispatch time, so trigger it only after the push that changed the workflow has landed, not in the same breath as the push.

**Not on a pull request, no comment.** A run started by hand or by a push has nothing to comment on: the log's last line is the count (`a11ign: N finding(s)`), with a line before it for anything that bounds that count (an examination that ended early, a capture spanning more than one document, criteria resting on an examination known to be partial), and another for the criteria axe-core FAILED (`a11ign: N criteria FAILED by the rule layer (axe-core)`), which sit beside the count rather than in it, and the full result, transcript included, is in the `a11ign-result` artifact the upload step saves above. The rendered report is in the pull-request comment and the run's job summary, and a CLI-only reader has no route to the job summary; the pinned release has the `summary-md` output, so the upload step above puts the same report in the artifact beside the result, and the artifact is the one that works headlessly ([`docs/github-action.md`](./github-action.md#why-it-looks-like-this) has the reason and the `gh` commands).

**`task` is load-bearing, but the word match it enables is not the guard on what gets operated.** It is
what a user is trying to *do*, in plain words. On this shipped default (`probe-forms` on), a run always
expands disclosures and submits submit-like buttons, whatever the task says, and toggles checkboxes and
radio buttons with no task-word test either; it activates any OTHER button only if its announced name
shares a meaningful word with the task — so *"show only bags"* activates a **Bags** button and never a
**Delete account** one. Separately, `probe-navigation` (on everywhere by default) follows the first link on
the page, task or no task. See [SECURITY.md](../SECURITY.md#it-operates-controls-on-the-page-and-one-probe-presses-buttons)
for the full rule and [the README's "Using it"](../README.md#using-it) for why a well-chosen task does not
also sharpen the verdict.

**Don't have a page picked yet?** Point it at `https://www.w3.org/WAI` — the W3C's own accessibility
site — for a first look before choosing anything of your own. We have already run it there
([`docs/github-action.md`](./github-action.md#tested-against-real-sites-in-the-wild)): 141 announcements,
and the same 3 findings on every measurement taken — axe-core's rule layer flags three `4.1.2` violations
inside the page's embedded YouTube player, none from the trained scorer — a real, reproducible result
rather than an untested placeholder. It is informational, with nothing to submit, so a `task` about learning something on the page (`"Learn about web accessibility"`) is enough. **The Action still operates controls on it, and the task word only gates one of them.** With the
defaults, a run against this exact page and task activated five controls: one button whose name happened
to share the word "Web" with the task, and — with no task-word test at all — three submissions of the
search form (landing on an empty query) and a followed link to a different page. On a site you do not own,
that is someone else's application being submitted to and navigated on your behalf. The CLI defaults
`probe-forms` off for exactly that reason; `probe-navigation`, which followed the link here, is on
everywhere by default and needs `--no-probe-navigation` to turn off — [see below](#the-other-route-run-it-from-the-repository).
**A run can leave the page you gave it entirely, and this one did** — the followed link above landed on a
second document, and the result says so itself: "THIS CAPTURE NAMED MORE THAN ONE DOCUMENT ... its
evidence was gathered across more than one page" is the tell. See
[SECURITY.md](../SECURITY.md#it-operates-controls-on-the-page-and-one-probe-presses-buttons) for the full
table of what a default run operates.

**Once you have seen real output, point it at the page with your contact form on it.** A long page with a
form exercises far more of this layer than a page of text alone — the form is where the announcements
this tool exists to hear actually happen.

<!-- WHY THE MARKERS BELOW EXIST (#1060): this page promised a floor and then cited two figures under
     it in the same sentence, calling them "within a few percent of each other" when the spread was
     seventy per cent. The markers make the checked population explicit. Nothing explanatory goes
     INSIDE them: a range named in a sentence about the old range is exactly what a text check cannot
     tell from the claim itself. Figures quoted outside the block are deliberately not held to the
     range, which is what lets the consent-banner failure be quoted as the failure it is. -->

<!-- TIMING:BEGIN -->

**Expect three to eight minutes for a real page.** Measured on eleven real-page runs (#311, #915): 3 m 14 s,
3 m 45 s, 4 m 14 s, 4 m 32 s, 4 m 38 s, 4 m 50 s, 5 m 48 s, 5 m 52 s, 6 m 35 s, 7 m 52 s and 7 m 54 s. **There
is a floor — the fastest run that reached the page was 3 m 14 s — and above it the spread is wide:** the
slowest of the eleven is 144 per cent longer than the fastest, so a simpler page does not reliably mean a
shorter run, and the range is a bound rather than a prediction for your page — and, per the runs below, not
a guaranteed lower bound either. Most of it is the screen reader reading, and that time is not
parallelisable or recoverable.

<!-- TIMING:END -->

**A run finishing well under four minutes is not necessarily a shorter examination — check the report
itself before reading speed as good news.** Two of the eleven are fast because they failed: `hubspot.com`
opened on a consent overlay Escape did not dismiss and read almost none of the page, on two separate runs
(4 m 50 s and, later, 3 m 45 s). The genuinely fastest of the eleven, `notion.com` at 3 m 14 s, completed
cleanly with 84 announcements and no overlay — so a fast run is not itself the tell; the report is. **Nor
is any figure above a guaranteed floor: a clean run on this exact page finished its capture-and-judge
step in 4 m 22 s** (run 34774692947, 2026-09-13), **its result byte-identical to a 5 m 08 s run the same
day** (34774183433); **a separate clean run elsewhere finished its capture alone, excluding judging, in
3 m 48.9 s, transcript byte-identical to a 4 m 44.7 s one** (runs 34782000257 and 34781484432). **So
duration alone does not tell you which happened — check the report itself:** if it shows almost nothing on
a page you know is large, you are looking at the banner (see the check below); a fast, full report is a
good run. **If a site redirects you to a regional page, pass that regional URL instead** — the tool refuses
a page it was not asked for, so a global homepage that redirects (`stripe.com` from the UK, for one) stops
within a minute with `wrong-page`; the regional URL it redirects to (`stripe.com/gb`) captures normally.
The range above has no ceiling of its own — the workflow's own limit on a run that will not finish at all
is stated below.

**Those are capture times, not the job you are billed for.** Setup comes on top. The two most recent jobs measured at a single build, both at `3bb1fddf` with warm caches (V1 rehearsal 4, runs 34781484432 and 34782000257, 2026-09-13), took 6 m 42 s and 5 m 56 s for the whole job. The only cold-cache job measured is older and at a different build, `0e809d13` (V1 rehearsal 1, run 34764686304, the same day): setup 85.3 s, capture and judging 7 m 30 s, and 9 m 20 s for the whole job. Budget runner time for the job, not the capture. The snippets above set `timeout-minutes: 20` on the job — a bit over twice the slowest one measured (9 m 20 s) — so a run that will not finish says so at 20, not after GitHub's own much longer job default.

**A run that does not finish looks nothing like a slow one.** Rehearsal 5's run 34799670660 (same commit, page and task as a run that had just succeeded) started its Action step and never completed it: the job ended after 50 m 01 s with GitHub's own annotation, "The hosted runner lost communication with the server" — not a11ign's. It left no log (`gh run view --log` answered "log not found"), no artifact, and a diagnostic step added with `if: always()` never ran either. **This says nothing about why**, or how often — that count is its own row ([#1520](https://github.com/a11ign/a11ign/issues/1520), still being measured: 1 lost of 12 runs so far whose Action step ran past 60 s). **What to do:** re-run the same commit. A single lost run like this one is evidence about GitHub's infrastructure that day, not about your page.

## What sign-in covers

**Read this before you spend an afternoon on a login.** It is the scope in three lists; the sections after it are the how. It is read against the pinned release (`a11ign@0.5.3`) and `docs/known-gaps.md` [§51](./known-gaps.md#51-a-run-cannot-get-past-mfa-sso-or-a-captcha-and-nothing-in-the-tool-detects-the-third-out-of-v1-by-ruling-2275-2262), and where a thing was only run on a fixture it says so.

### Supported

- **A scripted form login.** A test account's username and password typed, by accessible name, into a form on one pinned `origin:`, with the values in GitHub Secrets and the repository private. It has been read once on a page that is not a fixture: one page, one runner, one afternoon (`the-internet.herokuapp.com`, #2561), a target that prints its demo credentials and has no MFA, SSO or CAPTCHA. Your login is not that page.
- **A redirect login through a declared identity-provider origin (`idp-origins:`), shown on a fixture only.** Your sign-in page sends the browser to a provider's origin, a username and password go into a form there, and the provider sends the browser back to yours. It has been run against a local fixture with a real Chromium and a fake provider (#4086, #4088), with one NVDA reading of the signed-in page on one box (#4107). **It has not been run against a hosted provider.**

### Not supported

- **MFA.** An SMS code, an emailed code or a push approval has no step in the flow vocabulary, and a run waits for no person. TOTP (an authenticator-app code) is deferred.
- **SSO**, other than a username and password on a form at an origin you can name. Any other origin ends the run with `auth-login-failed`, reason `left-origin`.
- **A CAPTCHA.** It is never solved: the run ends `auth-challenge-detected`, which names it.
- **A hosted provider, run end to end: not yet shown.** The redirect login above is a fixture reading, so against your provider (Auth0, Okta, Entra ID or any other) a run is the first reading.

ADR 0038's scope line for MFA and SSO, quoted rather than paraphrased ([Constraint 6](./adr/0038-authenticated-capture.md#constraint-6-mfa-sso-and-captcha-are-out-of-v1)):

> **MFA, SSO and CAPTCHA are OUT of v1, recorded as a known gap** (`docs/known-gaps.md`), with "use a dedicated test
> account without MFA" as the stated route (the advice BrowserStack and LambdaTest give).

### If your app needs MFA

In the order you can actually take them today:

1. **Make a test account without MFA**, the ADR's stated route: a staging environment with MFA off, a role your admin exempts, or a username and password login beside the SSO button. It needs no person at any point, which a saved state does (the one who saves it, and again when it expires).
2. **Load a sign-in state you saved by hand, once** (`auth-state:`, [how and its limits](./github-action.md#logging-in-with-a-saved-state-auth-state)). It carries the run's own origin's cookies and `localStorage` only, so a site that keeps its session in `sessionStorage` or IndexedDB cannot be carried, and a state that no longer holds ends `auth-state-expired`. It has been read on one real site, with a state a script made rather than a person.
3. **Assess the page your own Playwright test has already signed into and reached. This route is not built.** [#4532](https://github.com/a11ign/a11ign/issues/4532) sizes it (#4084 outcome 11) and no document exists yet, so there is nothing to link and nothing to run. When it exists it is the route for an app whose login is not a scripted form, because the suite's own session is reused rather than replayed.

If none of the three reaches your page, this tool cannot examine it today: say so rather than working around it.

## Behind a login: an authenticated run on a private repository

**Use this if the page you want examined is only reachable after you sign in.** It is the same Action as above
with three additions: a private repository, a test account whose credentials live in GitHub Secrets, and a small
*flows file* that says how to sign in. The reference for each is [`docs/github-action.md`](./github-action.md#logging-in-flows-and-login-flow);
this section is the order to do them in. Read [SECURITY.md](../SECURITY.md#it-can-log-in-to-the-page-it-examines-and-then-it-holds-a-credential--2026-09-24-adr-0038) once first: the run holds a credential.

### What this path does not cover

Decide this before you spend anything, because each of these ends the path rather than slowing it:

- **A site whose only sign-in is MFA, SMS or an emailed code, or that puts a CAPTCHA in front of the login, is out of scope; so is an SSO that is not a username and password on a form at an origin you can name** (one that is, see [`idp-origins:`](#a-login-through-a-separate-identity-provider-origin-idp-origins)). SMS codes, emailed codes and push approvals are a documented gap, and TOTP (an authenticator-app code) is deferred. **If the site has a way to make a test account without them** (a staging environment with MFA off, a role your admin exempts, a separate username and password login next to the SSO button), use that. If it has none, this path cannot reach your page today: say so rather than working around it.
- **A CAPTCHA is never solved.** A login step that fails on a page showing a reCAPTCHA, hCaptcha or Turnstile widget ends the run with `auth-challenge-detected`, which names the challenge and stops.
- **Attaching to your own signed-in browser is not built.** What exists instead is loading a sign-in state you saved by hand (`auth-state:`, [#2566](https://github.com/a11ign/a11ign/issues/2566), merged): it is the route for a site behind SSO or MFA, and it is **not walked in this section**, which is the plain username-and-password path. It has its own steps, the limits of the file and one measured reading in [`docs/github-action.md`](./github-action.md#logging-in-with-a-saved-state-auth-state): read that if a form login cannot reach your page.
- **Only what your flows file names is pressed.** `probe-forms` and `probe-navigation` are switched off for a run that logs in, whatever you set.

### 1. The repository must be private

**A run that logs in on a repository that is not private is refused before NVDA is installed** (`auth-refused-public-repository`). The reason is where the output goes: the pull-request comment, the job log, the artifact and the job summary all carry text from behind your login, and on a public repository anyone can read every one of them. Check yours:

```bash
gh repo view OWNER/REPO --json isPrivate --jq .isPrivate     # must print true
```

**On a private repository those same four places are visible to everyone who can read the repository**, so keep the test account's data to things that group may see.

### 2. A test account, and the secrets

Make a **dedicated account** on a staging copy of the app, with **no MFA**. (A site that publishes a demo account for trying things, with no MFA, can stand in for a trial: its published username and password are used the same way. Measured: `tomsmith`, `standard_user` and `secret_sauce` each passed the length and ordinary-word checks.) Its username and its password must each be **at least 8 characters and not an ordinary word** (`a11y-audit-7f3c`, not `admin` or `test`): a shorter value is refused (`auth-credential-too-short`), because hiding it from the output would rewrite your page's own words.

Put both values in the repository's secrets. The names are yours; the flows file and the workflow below must use the same two. **Other secrets already in the repository are not read**: only the two names the workflow passes to the Action count. **Eight characters is enough** (`at least 8`), and a secret's value can never be read back, so `gh secret list --repo OWNER/REPO` tells you a name exists and not what it holds: if you are not sure a secret is right, set it again.

```bash
gh secret set APP_TEST_USER --repo OWNER/REPO         # prompts for the value; setting a name that exists replaces it
gh secret set APP_TEST_PASSWORD --repo OWNER/REPO
# with no terminal to prompt on, pass the value on stdin instead (single quotes, so a shell does not read a `!` in it):
#   printf '%s' 'the-value' | gh secret set APP_TEST_USER --repo OWNER/REPO
```

### 3. The flows file

Save this as `.github/a11y-flows.yml` (any path inside the repository works; the workflow names it). It says how to sign in, in a closed vocabulary of steps: `goto`, `fill`, `choose`, `check`, `press`, `expect` and `capture`. There is no script step and no sleep.

```yaml
version: 1
origin: https://staging.example.com            # every goto is resolved against it; leaving it fails the run
flows:
  login:
    steps:
      - goto: /login                           # the path of your login page; `/` if it is the site root
      - fill: { field: "Email address", from-env: APP_TEST_USER }
      - fill: { field: "Password",      from-env: APP_TEST_PASSWORD }
      - press: "Sign in"
      - expect: { heading: "Dashboard" }       # REQUIRED as the last step of a login flow
```

- **`from-env:` is the only way a login fills a value.** A literal password is refused (`auth-literal-secret`); the variable's name is what the flow holds, and the value arrives from the secret.
- **A control is named by what a screen reader announces, and never by selector.** The match is exact: it is case-sensitive, and runs of spaces count as one, with none at either end. A text field's name is normally its label's words (`Email address`), or its placeholder when it has no label (measured on one site, `www.saucedemo.com`: `Username` and `Password` were placeholders and bound); a button's is its text. Where you are unsure, copy the name from your browser's accessibility inspector (in Chrome or Edge, developer tools, Accessibility, the *Name* of the field or button), not from the visible text (**this route is not verified**: no session has followed it through a browser's developer tools; every cold run of this path worked without one): **a button drawn as an icon plus a word can have a name that begins with a character you cannot see**, and a flow that says only the word will not find it. Write such a character as a YAML escape inside double quotes. On `the-internet.herokuapp.com/login` the button is `"\uF090 Login"`, where `\uF090` is an icon-font glyph. **If you have no browser**, the labels in the page's HTML are the best guess, and they are right for a plain labelled field; they are wrong for a control named by an icon or an `aria-label`. An icon in the HTML (`<i class="fa fa-sign-in">` beside the word) is a hint that the name may begin with a glyph and never proof either way: on `the-internet.herokuapp.com` the login button's name began with one and the `Secure Area` heading beside an `<i class="icon-lock">` did not. **A page built by JavaScript (a single-page app) has no labels in the HTML you can fetch:** `curl` returns an empty `<div id="root">`, so the labels fallback above does not apply to it. Without a browser, take the guess from what the page's own script names its fields, or from the field's placeholder or button text as you see them on screen. Take the guess, run it, and if the run ends in `unbindable-field` its log names the name it looked for: correct that one and run again. That costs a run (section 5) for each miss, which is the price of not looking in a browser. **A control the flow cannot find by name ends the run with `auth-login-failed` (`unbindable-field`), and that is also a real 4.1.2 failure of your login form:** a screen-reader user cannot address it either.
- **The last step must be an `expect:`, and it decides whether the login worked.** Choose something **only the signed-in page shows**: the heading of the page you land on after signing in, or the *Sign out* button. **If the landing page has no heading and its *Sign out* sits inside a closed menu** (a shop's product list, for one: its title is a plain `<span>`), choose a button or link every signed-in page carries and the login page does not, with `control:` (the menu button's own name, for one), or `text:` for words only the signed-in page announces. **A weak one passes for the wrong reason.** To choose it, sign in once yourself in a browser and read the landing page's heading or a button on it. If you cannot sign in by hand, read the landing page's HTML: its heading's visible words are the best guess, and a heading that starts with an icon glyph will not match until the glyph is in the name, so a run ending in `expect-not-met` (`no heading "…" appeared`) means correct it. Then open the login page signed out and confirm what you chose is not on it, nor in the error it shows for a wrong password, nor in a header every page carries. `heading:` and `control:` match a heading or control of exactly that name; `text:` matches any announced text that *contains* yours, which makes it the easiest to get wrong.

### A login through a separate identity-provider origin: `idp-origins:`

**Use this if your sign-in page sends the browser to another origin, a hosted identity provider such as `https://login.example.com`, and signs in with a username and password on a form there.** Without it the run ends `auth-login-failed`, reason `left-origin`, the first time the page leaves your `origin:`. Add the provider's origin to the flows file, beside `origin:`:

```yaml
version: 1
origin: https://staging.example.com
idp-origins: [https://login.example.com]       # EXACT origins, nothing wider; the provider's, never your own
flows:
  login:
    steps:
      - goto: /login                           # your app redirects to the provider from here
      - fill: { field: "Email",    from-env: APP_TEST_USER }
      - fill: { field: "Password", from-env: APP_TEST_PASSWORD }
      - press: "Sign in"                       # the provider sends the browser back to your origin
      - expect: { heading: "Dashboard" }       # on YOUR origin, as before
```

What the pinned release (`a11ign@0.5.3`) does with it, read off `packages/cli/src/auth/flows.ts` and `docs/known-gaps.md` §51 at that tag:

- **Each entry must be an exact `http` or `https` origin.** The file is refused when it loads if an entry "holds a wildcard; list each origin exactly", "carries a path, query or fragment", "carries a username or password", or "is the app's own origin, which needs no allowance". The key is optional, and a file without it behaves as before.
- **The declared origins are allowed only between the login's steps.** "The last step, the `expect:`, and the requested page must be on the app's origin, so a run that ends parked on the provider is still `left-origin`", and "nothing is typed into an origin that is not declared".
- **`left-origin` is what any other origin ends in.** An origin the flow does not name, a third site the provider redirects on to, or a login that finishes parked on the provider is `auth-login-failed` with reason `left-origin`, and the message names the step and the page it was on. It is also what you get when the declaration is missing or misspelt.
- **The in-memory-token case is what this is for.** A hosted provider whose token lives only in the page's memory (an SPA SDK's `cacheLocation: 'memory'`) leaves nothing in cookies or `localStorage` for a saved state to carry. The login therefore round-trips through the provider in the same browser as the capture, and **the flow must finish on the product origin, on the page you asked to examine**: a login that already ended on the requested page is not loaded a second time, because a load discards a token held only in memory.
- **It works for a test account without MFA, unattended.** It does not answer MFA, a CAPTCHA or a person present.

**What is not shown:** `docs/known-gaps.md` [§51](./known-gaps.md#51-a-run-cannot-get-past-mfa-sso-or-a-captcha-and-nothing-in-the-tool-detects-the-third-out-of-v1-by-ruling-2275-2262) records that this was read on a local fixture (a real Chromium, a fake provider), **not on a hosted provider**, with one NVDA reading on the same fixture, and that MFA is not covered. Your provider is untested, so a run against it is the first reading.

### What a v3 run shows you

Each line names where the pinned release shows it:

- **Probing is off by default.** The Action's `probe-forms` input defaults to `false` (`action.yml`, `probe-forms:`; `packages/cli/CHANGELOG.md`, 0.4.0): the run does not press your forms' buttons with no valid input, and its log says criteria 3.3.1 and 4.1.3 were not assessed. Set `probe-forms: "true"` on a staging app to turn it on ([SECURITY.md](../SECURITY.md) says why not on production).
- **An evidence pack is written.** The `evidence-pack` output (`action.yml`) is a Markdown file of per-criterion outcomes and the NVDA announcements behind them, for an assessor; it is not a VPAT or ACR. It exists for a run of one URL, and is empty for a `urls` list, a `forms` config or a PDF. Upload it beside `result-json`.
- **A criterion referred on most pages is listed once.** On a multi-page run the summary prints `<criterion> <name>: left to a person on N of M pages` once, when it was referred on at least half the pages and at least three (`CHANGELOG.md`, 0.5.3). A single-page run prints as before, and `--json` and the evidence pack are unchanged.
- **WCAG 2.2 criteria it did not cover are named.** The summary and terminal report list them (2.4.11, 2.5.7, 3.2.6, 3.3.7, 3.3.8 on the recorded run) and say their absence from the findings is not a pass (`CHANGELOG.md`, 0.4.0).
- **A multi-line `urls:` scans every page** on a Windows runner (`CHANGELOG.md`, 0.4.1).

### 4. The workflow

Save it as `.github/workflows/a11ign-authenticated.yml`:

```yaml
name: a11ign-authenticated
on: pull_request
jobs:
  a11ign:
    runs-on: windows-2022
    timeout-minutes: 20
    permissions:
      contents: read
      pull-requests: write
    steps:
      - uses: actions/checkout@v7
      - uses: a11ign/a11ign@15881c7c59bee7cb49b464932f9732cb51e088f9   # the commit of the release tagged a11ign@0.5.3
        id: a11ign
        env:                                     # the credential enters HERE, on the step that calls the Action
          APP_TEST_USER: ${{ secrets.APP_TEST_USER }}
          APP_TEST_PASSWORD: ${{ secrets.APP_TEST_PASSWORD }}
        with:
          url: https://staging.example.com/orders   # the page to examine, once signed in: not the login page
          task: Review my recent orders
          flows: .github/a11y-flows.yml
          login-flow: login
      - uses: actions/upload-artifact@v7
        if: always() && steps.a11ign.outputs.result-json != ''
        with:
          name: a11ign-result
          path: |
            ${{ steps.a11ign.outputs.result-json }}
            ${{ steps.a11ign.outputs.summary-md }}
```

- **Pin the Action to the full 40-character commit SHA of a release that has the login flow, as above.** The pin above is release `0.5.3` (tag `a11ign@0.5.3`, commit `15881c7c59bee7cb49b464932f9732cb51e088f9`), which has it; the `v0.1.0` tag predates the login flow, so a workflow pinned to it would ignore `flows` and `login-flow` and examine your login page as though it were the product. On 2026-10-09 `npm view a11ign dist-tags` read `latest` `0.5.3` and `next` `0.5.4`, and `git ls-remote --tags https://github.com/a11ign/a11ign refs/tags/a11ign@0.5.3` printed `15881c7c59bee7cb49b464932f9732cb51e088f9` (readings at a moment, so look again). **Pin `latest`, not `next`.** To find the newest `latest`, run `npm view a11ign dist-tags`, then `git ls-remote --tags https://github.com/a11ign/a11ign refs/tags/a11ign@<version>` for that version's commit. The Action runs the code at the SHA you give it, not a registry version, so the SHA is what decides what you get. **Do not write `a11ign/a11ign@v0`:** that tag exists (`git ls-remote --tags https://github.com/a11ign/a11ign refs/tags/v0` printed the `0.5.3` commit on 2026-10-09) but it is a moving tag, so your CI would take a newer release without a change on your side. **What this does not claim:** the cold runs behind this section used a commit earlier than the `0.3.0` release, and the `0.5.3` commit pinned here has not been walked by a fresh reader.
- **The secrets go in `env:` on the step that calls the Action**, never in `with:`: an input is interpolated into shell text, and an environment variable is not. Give `flows` and `login-flow` together or neither.
- **A pull request from a fork gets no secrets**, so it ends in `auth-credential-missing`. Run it from a branch of the repository itself.
- **`task` is a label for the report and a hint about what a visitor is doing.** For a run that logs in it does not choose what is pressed; your flows file does.

### 5. Before you start it: what it will cost you

**The run states the number in its log before it does anything: `authenticated run: this run will perform at least N logins`.** N is a minimum. There is one login per capture and one more per capture for the rule layer (axe-core), so a single URL is at least 2, and a capture that has to be repeated logs in again, up to three attempts each. Every login is a real request to a real account, and **repeated logins can trip a lockout or bot detection on your site**: tell whoever runs the staging environment, and use an account that being locked out of costs nothing. A page list whose minimum passes 20 logins is refused before any worker starts, with no override (split the list, or set `axe: false`); a failed login stops the list rather than trying again for every page. The full cost table is in [`docs/github-action.md`](./github-action.md#logging-in-flows-and-login-flow).

### 6. Run it, and find the output

Push the two files on a new branch and open a pull request into your default branch, or into any other branch: `on: pull_request` fires for a pull request into any base, and the file is read from the pull request itself (`git switch -c a11ign-auth`, `git add .github`, `git commit`, `git push -u origin a11ign-auth`, then `gh pr create --fill`). **The workflow runs from the pull request's own branch, so your default branch is not touched to test it.** (A `workflow_dispatch` trigger, by contrast, reads the workflow from the default branch, so it only works once the file has been merged.) Follow the run in the Actions tab, or find it with `gh run list --repo OWNER/REPO --branch a11ign-auth` and follow it with `gh run watch <run-id> --repo OWNER/REPO`; the run may not be listed the moment the pull request opens, so look again.

**The result lands in four places, and on a private repository every one of them is visible to whoever can read the repository:**

| where | what |
|---|---|
| the pull-request comment | the rendered report, updated in place on each push |
| the job summary | the same report, on the run's page in a browser |
| the `a11ign-result` artifact | the report and the full result (`gh run download <run-id> --repo OWNER/REPO --name a11ign-result`) |
| the job log | the last line is the count (`a11ign: N finding(s)`), and a named fault is printed here |

Every value from your login is replaced with `‹credential›` in the report, the summary and the result file, and the report says how many announcements it changed. **A green run says the run reached and read your page, not that the page is fine.** `0 finding(s)` is a count of what was judged, and the report says what was not: a page unlike the ones the trained scorer was validated on is reported as *not scored*, which is unchecked and never clean. Read the report's *Not determined* line and its criteria before you read the count. A green run is one whose Action step exits 0 and whose job conclusion is `success` (`gh run view <run-id> --repo OWNER/REPO`). **The report has a section, *What this run pressed*, that lists every control pressed by name**: check it holds only what your flows file named.

### 7. When it ends in a named fault

Each fault is a sentence in the log's last lines with `(fault: <code>)` after it. What each means, and what to do:

| fault | what it means | what to do |
|---|---|---|
| `auth-refused-public-repository` | the repository is not private | section 1; nothing was installed or examined |
| `auth-credential-missing` | a variable the flow reads with `from-env:` is empty on the runner | the secret is not set, is named differently from the flows file, is not under `env:` on the Action's step, or the run is from a fork |
| `auth-credential-too-short` | a username or password is under 8 characters | a distinctive test account (section 2) |
| `auth-literal-secret` | a `fill:` in a flow carries `value:` for a password | use `from-env:` |
| `auth-login-failed`, reason `unbindable-field` | the flow names a control the page does not expose by that accessible name | copy the name from the accessibility inspector, glyphs included; if the control truly has no name, that is a finding about your login form |
| `auth-login-failed`, reason `expect-not-met` | the login ran and the page after it was not the one your `expect:` names | wrong password, an account that needs MFA or a password change, or an `expect:` that is not what the signed-in page shows |
| `auth-login-failed`, reason `left-origin` | the login went to another site | an identity provider you did not declare: see [`idp-origins:`](#a-login-through-a-separate-identity-provider-origin-idp-origins) for a provider that signs in with a form; SSO beyond that is not covered |
| `auth-login-failed`, reason `expect-not-met`, at `login step 1 (goto)`, with `could not be loaded (CDP: no Page.loadEventFired within 30000 ms)` | the browser on the runner never finished loading your login page. The log names the reason `expect-not-met` although no `expect:` has run yet (the wording is the tool's, not yours) | **not your flows file or your secrets.** Add a step that fetches the page from the runner (`curl -sS -o /dev/null -w '%{http_code}' https://your-site/login`): if that answers 200 and the run still fails, the page is waiting on something the runner cannot reach, usually a third-party analytics or A/B-testing script. Re-running does not help then (measured 2026-10-07: the same failure on four consecutive runs the same day, on `the-internet.herokuapp.com`, a page that had been green on 2026-09-26 and 2026-09-30); use a staging page without it |
| `auth-session-lost` | the login worked and the page then asked for showed the login form again | run again; then check the account may hold a session and the URL is reachable when signed in |
| `auth-challenge-detected` | a step failed on a page with a CAPTCHA widget | an account or environment your site exempts from the challenge |
| `auth-refused-judge-backend` | `judge-backend` names a vendor that would receive a transcript of a page behind a login | leave it at its default, `local` |
| `auth-credential-in-artifact` | a value from your login survived redaction in what the run was about to write | **do not use the output**; report it with the variable names and no values |

A run that fails outside these (for example a runner that never becomes ready) is not a fault of the login: re-run the same commit **once**. A second identical failure is not flakiness: read the last lines of the Action step's log for the line that names it, and compare it with the table above.

## Why an authenticated run refuses, and how to opt in

A run that logs in is refused in three places before it examines your page. Two of them are about where a copy of the signed-in page's text would go, and each is refused **by default on purpose**: a refusal is cheap to lift on purpose and expensive to find out about afterwards. The third, a public repository, is in [section 1](#1-the-repository-must-be-private) and has no opt-in. This section covers the other two: the fault name you will see, the reason, whether there is a deliberate way past it, and what taking it risks. The decision is [ADR 0038](./adr/0038-authenticated-capture.md) (Constraints 1 and 5); the statement of what leaves your machine is in [SECURITY.md](../SECURITY.md#it-can-log-in-to-the-page-it-examines-and-then-it-holds-a-credential--2026-09-24-adr-0038).

| fault | refused when | opt-in |
|---|---|---|
| `auth-refused-remote-worker` | the run logs in and `--worker` names a machine other than this one | **none, by design** |
| `auth-refused-judge-backend` | the run logs in and `JUDGE_BACKEND` is `codex`, `anthropic` or `openai` | `--send-authenticated-transcript-to-judge-vendor` |

### A remote worker: `auth-refused-remote-worker`, with no opt-in

**Why.** The CLI talks to a worker over plain HTTP with no authentication and no TLS, so anything sent to it can be read by anyone on the network, and a session is a credential. The refusal is raised before the request body is built: nothing is sent and no page is examined, and the run ends with the fault and **no report**, never a clean one. A worker that is not on the same machine is any `--worker` address whose host is not `localhost`, an address in `127.0.0.0/8` or `[::1]`; a worker address that cannot be parsed, or none at all, is treated as remote too, because refusing is the safe reading of "I could not tell".

**There is no opt-in, and that is the decision, not a gap.** ADR 0038 refuses until the channel is authenticated and encrypted, and no flag or environment variable switches the refusal off, because a switch would be the one thing a shared runner or a copied command line could turn on without anyone deciding to. What the run needs is the browser and the worker on one machine, and there are two supported ways to get that:

- **The GitHub Action**, which starts the worker on a throwaway runner from the environment you gave the step ([section 4](#4-the-workflow)). This is the route this page walks.
- **The CLI with a worker on your own machine:** point `--worker` at `http://127.0.0.1:8765`.

**An SSH tunnel to a remote worker is tolerated by accident, and is not an opt-in.** The CLI judges the address it was given, and a tunnel's local end is `127.0.0.1`, so it passes the check without being asked. Nothing in the tool can tell the difference, and it is no safer: the tunnelled worker reads the variables named in your flows file from its **own** environment, so the run either ends in `auth-credential-missing` (that worker holds nothing) or, if it does hold your variable, performs the login in a browser on a machine other people can reach. Do not export a test account's variables into a shared worker to make a tunnel work ([SECURITY.md](../SECURITY.md) says the same). No code change would make this safe: the missing piece is an authenticated, encrypted channel and a worker that is yours alone, and neither is built.

### A vendor judge backend: `auth-refused-judge-backend`, and the opt-in

**Why.** The default judge is `local`, our own scorer running on your machine, and nothing leaves it. `JUDGE_BACKEND=codex|anthropic|openai` sends the capture's transcript to that vendor, and the transcript is the page's text as a screen reader announced it. For a page behind your login, that is text from behind your login. The refusal is raised when the arguments are read, before the capture starts, so a refused run does not first spend a capture.

**The opt-in.** Name the flag on the run. It is one flag per run, it only means something on a run that logs in (`--flows` and `--login-flow`), and it cannot be set from the environment, so a variable left on a shared runner cannot turn it on for a job that never named it:

```bash
# CLI
npx a11ign https://app.example.com/dashboard --flows .github/a11y-flows.yml --login-flow login \
  --send-authenticated-transcript-to-judge-vendor
```

```yaml
# the Action
with:
  send-authenticated-transcript-to-judge-vendor: "true"
```

**What it risks.** The signed-in page's transcript **leaves your machine (or your runner) for the vendor you named**, under that vendor's terms and retention, not yours. Given the flag, the run prints on stderr which vendor receives it before the judge runs, so you can see it was taken. Your credentials are not part of what is sent: every value from your login is replaced with `‹credential›` before the transcript leaves, with or without the flag, and the flag does not switch that off. **Everything else on the page is still sent**: names, balances, messages, whatever the signed-in view announces. Use it with a dedicated test account on seeded data you would be content to show that vendor; if you cannot say that about the page, leave `judge-backend` at `local`.

## The other route: run it from the repository

**Use this if your app is not on GitHub, or you want to see the output before you commit a workflow file.**
It is the same tool; the difference is where the Windows machine comes from. **`npx a11ign` works** — the package
is on npm — and the repository's own registry check (`registry-consumer-gate.yml`) runs exactly that command on a
Windows runner, from a clean directory with the published packages and a worker beside it. Typed on a Linux box
with no worker (2026-10-03), it installs from the registry and stops at the worker message quoted below; the full
run on Windows is the registry check's, not something this page's author watched.

```bash
npx a11ign https://www.w3.org/WAI --task "Learn about web accessibility"
```

**Or from a clone**, if you want the source, or a build of `main` rather than the release:

```bash
git clone https://github.com/a11ign/a11ign.git
cd a11ign
pnpm install
pnpm run witness https://www.w3.org/WAI --task "Learn about web accessibility"
```

Node 20 or later for both. `pnpm install` builds the workspace, so the clone has no separate build step.

**Either command needs a capture worker and will not invent one.** A screen reader is a Windows desktop
application: there is no Docker image, and no flag substitutes for the machine. Run on a Mac or Linux box
with nothing configured, this is exactly what you get — quoted rather than paraphrased, because it is the
most likely first result and it is not a crash. It names the address it fell back to, because you named none:

```
Using http://localhost:8765 (default)
```

Nothing is listening there, so the refusal follows:

```
No capture worker answered at http://localhost:8765 (nothing was configured, so this address was a guess).
A screen reader is a Windows application, so nothing runs here without one. Set A11Y_WORKER to point at a
worker you have, or see docs/getting-started.md to set one up (~20 minutes with a Windows machine already,
or use the GitHub Action if you have none).
(connect ECONNREFUSED 127.0.0.1:8765)
```

That last line is the reason the connection failed — `ECONNREFUSED` here, since nothing is listening; a
firewall or a different local setup will say something else.

**Three ways past it, cheapest first:**

| you have | do this |
|---|---|
| a GitHub repo | **[the Action above](#the-fastest-route-a-github-actions-run)** — a GitHub-hosted Windows runner is the worker, and you configure nothing |
| a Windows machine already | [`docs/getting-started.md`](./getting-started.md) — about twenty minutes, then `A11Y_WORKER=http://<that-machine>:8765` |
| neither | a Windows VM, 1.5–2 hours from scratch. **Take the Action instead** unless you specifically want the local path |

`pnpm run doctor` reports what this machine has and what each gap needs. It is read-only — it never starts
or stops anything — so it is safe to run before you have decided anything.

**One target needs none of that: a PDF.** Point the CLI at a URL whose path ends in `.pdf` (any case; a `?query` or `#fragment` after it does not hide it) — `pnpm run witness https://example.com/report.pdf` — and it scans the document's accessibility tag tree, with no worker, no browser and no NVDA, so it runs on the Mac or Linux box that got `ECONNREFUSED` above. What comes back is `pdf:` findings, in a *PDF layer* section (the `pdf` field under `--json`): `pdf-untagged`, `pdf-missing-lang` and `pdf-figure-no-alt`. **It does not run a screen reader over the document:** it reads the tag tree, the structure a screen reader would be handed, and does not say what one would announce.

**`--probe-forms` is off here and on in the Action, and that is deliberate.** The CLI can be pointed at any
URL, and pressing *Send* on somebody else's production site is not a review. A workflow runs against your
own app, where submitting is intended.

## What a long marketing page will actually produce

Your page is one large page with many images, links and headings, and probably a contact form and a
consent banner. Here is what to expect from that shape, so nothing in the output is a surprise.

**Read the cookie banner warning first — it is the one thing that can waste the whole run.**

### The consent banner is the real risk, and you can check for it in ten seconds

**A screen reader that opens on a consent overlay can see the overlay and nothing else.** Measured on our
own test page: with the banner in the way, headings went 5 → 0, links 6 → 1, graphics 1 → 0. The page
simply vanished.

We handle it — the tool reads the page structure before anything can trap focus, and it presses Escape,
which dismisses most banners. **It does not always work.** On a batch of real public-sector pages, 24
captures opened on a consent overlay and never reached a heading. In one real run (#398) the page this
guide recommends pointing at — your own contact-form page — returned nothing but a consent-overlay
warning, after the full five minutes: the judgement was correct (it genuinely could not get past the
banner), but that is the worst-case shape the timing range above does not cover, and it is why the check
below matters more than the number.

**So check one thing before you judge the output:** if the report shows almost nothing — a handful of
elements on a page you know is large — you are looking at the banner, not at your site. Tell us; that is a
defect in our tool, not in your page. Running against a URL that skips the banner (a staging build, or a
page reached with the cookie already set) will also work.

### What is likely to appear, and which of it is a claim

| what your page has | what you may see | is it a claim? |
|---|---|---|
| Many images | **Missing alt text** (announced as unlabelled, or with an empty name), and **alt text that is a filename**: a camera name such as *IMG 4821*, or a name ending in an image extension, spoken (*photo dot jpg*) or written (*logo.png*) | **Yes — asserted.** Both are read directly from what the screen reader said. A generic placeholder name such as *thumbnail-image* is **not** a filename and is not flagged, so an image named that way still needs a person to look |
| *Learn more* / *Read more* links | Link purpose unclear from the text alone | **No — a referral.** It means *a person should look*, not *this is broken* |
| Unnamed graphics inside links or buttons | A control with no accessible name | **Yes — asserted**, when nothing names it |
| Headings | Heading structure, and whether headings and labels describe their content | Mixed — some asserted, some referred |
| A contact form | Error messages that are never announced; a status message nobody hears | **Only if you use the GitHub Action with a `task`** — see below |

**Referrals will outnumber assertions, and that is the design rather than hedging.** A referral on *learn
more* is the tool saying it cannot tell from the announcement alone whether the surrounding context makes
the link clear — which is exactly the judgement a person makes in a second and a scanner cannot make at
all.

**Zero of each is also a real answer, and the run does not let it read like a failed one.** A page with
nothing to flag — no missing alt text, no unnamed controls, nothing worth a referral — is a real, tested
outcome: it is how this project checks for over-flagging in the first place, scoring the W3C's own
accessibility site (a reference-quality accessible page) against an expectation of no findings at all. What
tells that apart from a run that never actually read your page is not the count, it is the shape of the
report. **A capture the tool doubts never gets to report a finding count.** With the GitHub Action, a
doubted capture replaces the usual summary entirely with **"a11ign — could not read this page,"** and the
job fails rather than passes, with its own reason on the log: *"the capture could not be confirmed to have
read the requested page; reporting no findings. This is a failed measurement, not a clean page."* Running
from the repository, the same doubt reaches you as a `WARNING` printed to stderr above a report that still
runs underneath it. So a report that runs normally — the usual heading, a non-zero announcement count,
findings and per-criterion outcomes both printed — and says `0 finding(s)` (the Action's own words for it:
**"No lived-experience findings. The screen-reader layer found nothing it could evidence"**) is a clean
read of your page, **unless the trained scorer abstained.** A "could not read this page" summary, a `WARNING`, or a
job that failed instead of finished is the tell that it was not — check
[the consent banner](#the-consent-banner-is-the-real-risk-and-you-can-check-for-it-in-ten-seconds) first.

**Abstention is a fourth tell, and a zero count under it is not yet a clean read.** When the page is unlike
anything the scorer was validated on (measured on `https://www.gov.uk/`, run 37134253796: nearest training
similarity 0.6476 against a 0.6557 floor), it declines to score. The page reads fine in every other way, with the
usual heading and a full announcement count, and the findings are empty because nothing was scored. The Action
says **"Not scored: no lived-experience verdict for this page"** where the clean wording would be, and the
scorer's summary line says the page "was NOT scored" and its criteria are "unchecked, not clean". In the
`a11ign-result` artifact it is `verdict.abstained: true` with `confidence: 0`, and the affected criteria are
`cantTell` in `outcomes`. `verdict.taskCompletable` stays `true` and means nothing there. Read the rule-based
(axe-core) table, which still ran, and treat the rest as a page for a person.

### The contact form needs one thing from you

The command-line tool **never submits a form on a page it does not own** — pressing *Send* on somebody's
production site is not a review. The GitHub Action does, because you own the app, **and only when you give
it a `task`**. If you want the form assessed, say what a visitor is trying to do (*"Send an enquiry"*) and
point the run at the page with the form on it.

### How long a large page takes

**Expect three to eight minutes**, per the measurement above (#311, #915) — the floor is fixed regardless
of shape, because the time is a screen reader reading and that is not parallelisable or recoverable. The
range above it is not: the slowest measured run is 144 per cent longer than the fastest. A very large page can still exhaust our capture budget beyond that
range, and if it does you will get a partial result that **says** it is partial rather than a short one
that looks complete. The log adds a line above its count of findings,
`a11ign: N criteria rest on an examination known to be partial -- see the artifact`, and the job summary's
**Not determined** line counts those criteria apart. Which criteria, and why, is in the `a11ign-result`
artifact: each is `cantTell` in `outcomes`, and its `reason` names the sweep that fell short. A real run on
`https://www.w3.org/WAI` read *"The link sweep said it reached the end having found far less than the page's
census, so something held it, so this criterion rests on an examination known to be partial."* The
`conformance` block's reach line sets what the screen reader reached against what the browser exposes, type by
type. On a large page, open the artifact before you read a low count as a clean page.

## YOUR PAGE — the one section that is not written yet

**Everything above is the path for the shape of page you have: one large marketing page, many images and
links, a contact form, probably a consent banner. It is complete and you can follow it today.**

This section is deliberately blank, and it is the only part of this page that is. It gets filled in when
we have your URL, and it will hold three things nobody can write without it:

- **The exact workflow file for your page**, with your URL and the `task` a visitor on it is actually
  trying to do — not `Send an enquiry` as a placeholder, but the words that match a control on your page.
- **Whether your page has a consent banner in the way**, checked before you spend the minutes. This is
  the single thing most likely to waste the run, and it takes us one capture to answer.
- **What your run actually produced, read alongside you** — which findings are assertions, which are
  referrals, and which of the referrals were worth your attention. That last judgement is the one we are
  asking you for, and it is easier to make with somebody who can point at the announcement each one rests
  on.

**Why it is empty rather than filled with an example.** A worked example against a site we chose would
read as though the path had been walked, and it has not — not by anyone outside this project, which is
the entire point of #38. **An empty section that says what goes in it is honest; a plausible example is
not.**

**Nothing above depends on this.** If you would rather just run it, the GitHub Actions route needs your
URL and one line of `task`, and you will get a report.

## What we would like back

Four questions, and short answers are better than considered ones:

1. **Did the run see your page, or did it see the cookie banner?** The quickest tell is whether the
   element counts look like your page at all.
2. **Did you believe the findings?** For any you did not, the announcement is quoted — was the quote
   wrong, or was our reading of it wrong?
3. **Were the referrals worth reading, or noise?** They will outnumber the assertions. If *learn more*
   showing up thirty times is not useful, say so — that is a product decision we would rather make on
   your reaction than on our own taste.
4. **Was it worth the minutes it cost**, and did it tell you anything your existing scanner had not?

And, whenever it happens: **where did you get stuck?** Every question you had to ask us is a defect in
this page.

Open an issue, or reply to whoever sent you here. **A blunt "no" with a reason is worth more to us than a
polite yes.**

Your answers are recorded in [`outsider-runs.md`](./outsider-runs.md), in a fixed shape, in your own words
where you said them and `NOT STATED` where you did not.

## Things you may reasonably want to know

**Does it send anything anywhere?** No. The tool talks to the page you point it at and the machine running
it, and nothing else. No telemetry, no usage reporting, no call home, and no plan to add any.

**How accurate is it?**

<!-- CLAIM:BEGIN -- checked by public-claim.test.ts against a gate result recorded in
     docs/board/reported/, exactly as the README's claim block is. This figure lived here as a
     SECOND COPY for a while and went stale when the first one moved; that is why the markers exist. -->

**On our own corpus of 1,405 conformant records the deterministic rules asserted no failures.** The real-page figure is in the README's claim block: measured 2026-09-24 on the 40 conformant real pages of the calibration set at protocol 21, 0 criteria asserted wrongly and 395 referred ([`README.md`](../README.md)). The time a capture takes is a different figure: one capture occupied a worker for 105 s to 460 s depending on the page, measured 2026-09-24 at protocol 21 and not refreshed since ([`capture-cost.md`](./capture-cost.md)).

<!-- CLAIM:END -->

Both are measurements of pages **we** chose, not a claim about the web — which is exactly the gap your run
helps close. Your page is one we did not choose, which is the whole reason we are asking.

**Is it a conformance certificate?** No. It is evidence about specific criteria on specific pages.
