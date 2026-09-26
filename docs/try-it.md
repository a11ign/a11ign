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
- **Nothing is published to npm yet.** You install from the repository — [the commands are below](#the-other-route-run-it-from-the-repository), and `npx a11ign` will not work yet.

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
      - uses: actions/checkout@v4
      - uses: a11ign/a11ign@v0.1.0
        # Pinned to v0.1.0, the first tagged release. Use the full 40-character commit SHA instead if
        # your CI must not move even across a release -- GitHub refuses an abbreviated one outright, it
        # does not just discourage it.
        id: a11ign
        with:
          url: https://your-site.example/the-page
          task: Send an enquiry
      # Keep the evidence: the rendered report and the full result, transcript included. Guarded on the
      # output existing, so a run that failed does not also fail the upload.
      - uses: actions/upload-artifact@v4
        if: always() && steps.a11ign.outputs.result-json != ''
        with:
          name: a11ign-result
          path: |
            ${{ steps.a11ign.outputs.result-json }}
            ${{ steps.a11ign.outputs.summary-md }}
          if-no-files-found: warn
```

Save it as `.github/workflows/a11ign.yml`. It runs on every pull request, and `workflow_dispatch` also lets you start it by hand from the repository's Actions tab (or `gh workflow run a11ign.yml`) — `workflow_dispatch` resolves the workflow from the default branch as GitHub sees it at dispatch time, so trigger it only after the push that changed the workflow has landed, not in the same breath as the push.

**Not on a pull request, no comment.** A run started by hand or by a push has nothing to comment on: the log's last line is the count (`a11ign: N finding(s)`), with a line before it for anything that bounds that count (an examination that ended early, a capture spanning more than one document, criteria resting on an examination known to be partial), and the report is in the `a11ign-result` artifact the upload step saves above — both the rendered report and the full result, transcript included. The same report is also written to the run's job summary, but a CLI-only reader has no route to that; the artifact is the one that works headlessly ([`docs/github-action.md`](./github-action.md#why-it-looks-like-this) has the reason and the `gh` commands).

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

## Behind a login: an authenticated run on a private repository

**Use this if the page you want examined is only reachable after you sign in.** It is the same Action as above
with three additions: a private repository, a test account whose credentials live in GitHub Secrets, and a small
*flows file* that says how to sign in. The reference for each is [`docs/github-action.md`](./github-action.md#logging-in-flows-and-login-flow);
this section is the order to do them in. Read [SECURITY.md](../SECURITY.md#it-can-log-in-to-the-page-it-examines-and-then-it-holds-a-credential--2026-09-24-adr-0038) once first: the run holds a credential.

### What this path does not cover

Decide this before you spend anything, because each of these ends the path rather than slowing it:

- **A site whose only sign-in is SSO, MFA, SMS or an emailed code, or that puts a CAPTCHA in front of the login, is out of scope.** SMS codes, emailed codes and push approvals are a documented gap, and TOTP (an authenticator-app code) is deferred. **If the site has a way to make a test account without them** (a staging environment with MFA off, a role your admin exempts, a separate username and password login next to the SSO button), use that. If it has none, this path cannot reach your page today: say so rather than working around it.
- **A CAPTCHA is never solved.** A login step that fails on a page showing a reCAPTCHA, hCaptcha or Turnstile widget ends the run with `auth-challenge-detected`, which names the challenge and stops.
- **Attaching to your own signed-in browser is not built.** Neither is loading a saved sign-in state (`--auth-state`, [#2566](https://github.com/a11ign/a11ign/issues/2566)), which is the route through SSO and MFA and is named here as a way through only once it has merged. It has not.
- **Only what your flows file names is pressed.** `probe-forms` and `probe-navigation` are switched off for a run that logs in, whatever you set.

### 1. The repository must be private

**A run that logs in on a repository that is not private is refused before NVDA is installed** (`auth-refused-public-repository`). The reason is where the output goes: the pull-request comment, the job log, the artifact and the job summary all carry text from behind your login, and on a public repository anyone can read every one of them. Check yours:

```bash
gh repo view OWNER/REPO --json isPrivate --jq .isPrivate     # must print true
```

**On a private repository those same four places are visible to everyone who can read the repository**, so keep the test account's data to things that group may see.

### 2. A test account, and the secrets

Make a **dedicated account** on a staging copy of the app, with **no MFA**. Its username and its password must each be **at least 8 characters and not an ordinary word** (`a11y-audit-7f3c`, not `admin` or `test`): a shorter value is refused (`auth-credential-too-short`), because hiding it from the output would rewrite your page's own words.

Put both values in the repository's secrets. The names are yours; the flows file and the workflow below must use the same two. **Eight characters is enough** (`at least 8`), and a secret's value can never be read back, so `gh secret list --repo OWNER/REPO` tells you a name exists and not what it holds: if you are not sure a secret is right, set it again.

```bash
gh secret set APP_TEST_USER --repo OWNER/REPO         # prompts for the value; setting a name that exists replaces it
gh secret set APP_TEST_PASSWORD --repo OWNER/REPO
# with no terminal to prompt on, pass the value on stdin instead:  printf '%s' "$VALUE" | gh secret set APP_TEST_USER --repo OWNER/REPO
```

### 3. The flows file

Save this as `.github/a11y-flows.yml` (any path inside the repository works; the workflow names it). It says how to sign in, in a closed vocabulary of steps: `goto`, `fill`, `choose`, `check`, `press`, `expect` and `capture`. There is no script step and no sleep.

```yaml
version: 1
origin: https://staging.example.com            # every goto is resolved against it; leaving it fails the run
flows:
  login:
    steps:
      - goto: /login
      - fill: { field: "Email address", from-env: APP_TEST_USER }
      - fill: { field: "Password",      from-env: APP_TEST_PASSWORD }
      - press: "Sign in"
      - expect: { heading: "Dashboard" }       # REQUIRED as the last step of a login flow
```

- **`from-env:` is the only way a login fills a value.** A literal password is refused (`auth-literal-secret`); the variable's name is what the flow holds, and the value arrives from the secret.
- **A control is named by what a screen reader announces, and never by selector.** The match is exact: it is case-sensitive, and runs of spaces count as one, with none at either end. A text field's name is normally its label's words (`Email address`); a button's is its text. Where you are unsure, copy the name from your browser's accessibility inspector (in Chrome or Edge, developer tools, Accessibility, the *Name* of the field or button), not from the visible text: **a button drawn as an icon plus a word can have a name that begins with a character you cannot see**, and a flow that says only the word will not find it. Write such a character as a YAML escape inside double quotes. On `the-internet.herokuapp.com/login` the button is `"\uF090 Login"`, where `\uF090` is an icon-font glyph. **If you have no browser**, the labels in the page's HTML are the best guess, and they are right for a plain labelled field; they are wrong for a control named by an icon or an `aria-label`. Take the guess, run it, and if the run ends in `unbindable-field` its log names the name it looked for: correct that one and run again. That costs a run (section 5) for each miss, which is the price of not looking in a browser. **A control the flow cannot find by name ends the run with `auth-login-failed` (`unbindable-field`), and that is also a real 4.1.2 failure of your login form:** a screen-reader user cannot address it either.
- **The last step must be an `expect:`, and it decides whether the login worked.** Choose something **only the signed-in page shows**: the heading of the page you land on after signing in, or the *Sign out* button. **A weak one passes for the wrong reason.** To choose it, sign in once yourself in a browser and read the landing page's heading or a button on it. If you cannot sign in by hand, read the landing page's HTML: its heading's visible words are the best guess, and a heading that starts with an icon glyph will not match until the glyph is in the name, so a run ending in `expect-not-met` (`no heading "…" appeared`) means correct it. Then open the login page signed out and confirm what you chose is not on it, nor in the error it shows for a wrong password, nor in a header every page carries. `heading:` and `control:` match a heading or control of exactly that name; `text:` matches any announced text that *contains* yours, which makes it the easiest to get wrong.

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
      - uses: actions/checkout@v4
      - uses: a11ign/a11ign@c77c1ba0f65e94e0cef4fcdb8d3f3c7ac1be87fa
        id: a11ign
        env:                                     # the credential enters HERE, on the step that calls the Action
          APP_TEST_USER: ${{ secrets.APP_TEST_USER }}
          APP_TEST_PASSWORD: ${{ secrets.APP_TEST_PASSWORD }}
        with:
          url: https://staging.example.com/orders   # the page to examine, once signed in: not the login page
          task: Review my recent orders
          flows: .github/a11y-flows.yml
          login-flow: login
      - uses: actions/upload-artifact@v4
        if: always() && steps.a11ign.outputs.result-json != ''
        with:
          name: a11ign-result
          path: |
            ${{ steps.a11ign.outputs.result-json }}
            ${{ steps.a11ign.outputs.summary-md }}
```

- **Pin the Action to a full 40-character commit SHA, as above.** The `v0.1.0` tag the fastest route uses predates the login flow, so it would ignore `flows` and `login-flow` and examine your login page as though it were the product. No later tag exists yet.
- **The secrets go in `env:` on the step that calls the Action**, never in `with:`: an input is interpolated into shell text, and an environment variable is not. Give `flows` and `login-flow` together or neither.
- **A pull request from a fork gets no secrets**, so it ends in `auth-credential-missing`. Run it from a branch of the repository itself.
- **`task` is a label for the report and a hint about what a visitor is doing.** For a run that logs in it does not choose what is pressed; your flows file does.

### 5. Before you start it: what it will cost you

**The run states the number in its log before it does anything: `authenticated run: this run will perform at least N logins`.** N is a minimum. There is one login per capture and one more per capture for the rule layer (axe-core), so a single URL is at least 2, and a capture that has to be repeated logs in again, up to three attempts each. Every login is a real request to a real account, and **repeated logins can trip a lockout or bot detection on your site**: tell whoever runs the staging environment, and use an account that being locked out of costs nothing. A page list whose minimum passes 20 logins is refused before any worker starts, with no override (split the list, or set `axe: false`); a failed login stops the list rather than trying again for every page. The full cost table is in [`docs/github-action.md`](./github-action.md#logging-in-flows-and-login-flow).

### 6. Run it, and find the output

Push the two files on a new branch and open a pull request into your default branch, or into any other branch: `on: pull_request` fires for a pull request into any base, and the file is read from the pull request itself (`git switch -c a11ign-auth`, `git add .github`, `git commit`, `git push -u origin a11ign-auth`, then `gh pr create --fill`). **The workflow runs from the pull request's own branch, so your default branch is not touched to test it.** (A `workflow_dispatch` trigger, by contrast, reads the workflow from the default branch, so it only works once the file has been merged.) Follow the run in the Actions tab, or `gh run watch`; the run can take several seconds to appear after the pull request opens.

**The result lands in four places, and on a private repository every one of them is visible to whoever can read the repository:**

| where | what |
|---|---|
| the pull-request comment | the rendered report, updated in place on each push |
| the job summary | the same report, on the run's page in a browser |
| the `a11ign-result` artifact | the report and the full result (`gh run download <run-id> --repo OWNER/REPO --name a11ign-result`) |
| the job log | the last line is the count (`a11ign: N finding(s)`), and a named fault is printed here |

Every value from your login is replaced with `‹credential›` in the report, the summary and the result file, and the report says how many announcements it changed. A green run is one whose Action step exits 0 and whose job conclusion is `success` (`gh run view <run-id> --repo OWNER/REPO`). **The report has a section, *What this run pressed*, that lists every control pressed by name**: check it holds only what your flows file named.

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
| `auth-login-failed`, reason `left-origin` | the login went to another site | an identity provider: SSO, which this path does not cover |
| `auth-session-lost` | the login worked and the page then asked for showed the login form again | run again; then check the account may hold a session and the URL is reachable when signed in |
| `auth-challenge-detected` | a step failed on a page with a CAPTCHA widget | an account or environment your site exempts from the challenge |
| `auth-refused-judge-backend` | `judge-backend` names a vendor that would receive a transcript of a page behind a login | leave it at its default, `local` |
| `auth-credential-in-artifact` | a value from your login survived redaction in what the run was about to write | **do not use the output**; report it with the variable names and no values |

A run that fails outside these (for example a runner that never becomes ready) is not a fault of the login: re-run the same commit.

## The other route: run it from the repository

**Use this if your app is not on GitHub, or you want to see the output before you commit a workflow file.**
It is the same tool; the difference is where the Windows machine comes from. **`npx a11ign` does not work
yet** — nothing is published — so the package comes from a clone.

```bash
git clone https://github.com/a11ign/a11ign.git
cd a11y-witness
npm install
npm run witness -- https://www.w3.org/WAI --task "Learn about web accessibility"
```

Node 20 or later. `npm install` builds the workspace, so there is no separate build step.

**The last command needs a capture worker and will not invent one.** A screen reader is a Windows desktop
application: there is no Docker image, and no flag substitutes for the machine. Run on a Mac or Linux box
with nothing configured, this is exactly what you get — quoted rather than paraphrased, because it is the
most likely first result and it is not a crash:

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

`npm run doctor` reports what this machine has and what each gap needs. It is read-only — it never starts
or stops anything — so it is safe to run before you have decided anything.

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
read of your page. A "could not read this page" summary, a `WARNING`, or a job that failed instead of
finished is the tell that it was not — check
[the consent banner](#the-consent-banner-is-the-real-risk-and-you-can-check-for-it-in-ten-seconds) first.

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

**On our own corpus of 1,405 conformant records the deterministic rules asserted no failures.** The real-page figure is under re-measurement since 2026-09-06 and this page states none: a refreshed baseline produced four findings on pages an older baseline had passed, and until each is established as an assertion or a referral there is no honest number to give.

<!-- CLAIM:END -->

Both are measurements of pages **we** chose, not a claim about the web — which is exactly the gap your run
helps close. Your page is one we did not choose, which is the whole reason we are asking.

**Is it a conformance certificate?** No. It is evidence about specific criteria on specific pages.
