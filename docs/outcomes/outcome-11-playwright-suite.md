# Outcome 11: running a11ign inside an adopter's existing Playwright suite

Row #4532, for #4084 outcome 11. The evaluator wants a fixture or plugin that assesses the page the adopter's own test
has already signed into, reusing the suite's session, so that "it tests one URL, not a flow" and "our login is not a
scripted form" stop being blockers.

**Decision: build ONE thin TypeScript fixture now (one pull request), and a Python twin after it. The fixture hands a11ign
the page's URL and a storage-state file, never a DOM or an accessibility tree, and it works only where the suite and the
screen-reader worker are the same Windows machine. It does NOT serve the evaluator's own app if that app keeps its session in
page memory, and the document says so first so that nobody files the build expecting it to.** The row to file is under
`## First row`.

**Taken at** `a11ign` `b260eb84b` (`origin/main`, 2026-10-09). The worker repository was not read: everything said about the
worker comes from this repository's ADR 0038, the spike `docs/auth-attach-spike.md` (read there at `screenreader-worker@291ed35`)
and the CLI's own wire code. Every figure is marked MEASURED (a command printed it, named beside it), READ (copied from a
document that names its own runs) or INFERRED (arithmetic or a choice, with its basis). No fixture was built or run on a
Windows worker for this document, so nothing below says the end to end path works; it says where each piece stops.

## What it covers

What exists today, read from the source. The one-line version: **the hand-off a Playwright suite can make already has a
consumer in the CLI (`--auth-state`), the CLI refuses it everywhere except beside a local worker, and there is no consumer for
a DOM or an accessibility tree because the worker is asked for a URL and navigates to it itself.**

| what a `test` holds | can a11ign take it today? | what decides it |
|---|---|---|
| **the page's URL** (`page.url()`) | **Yes**, as the positional URL | the request body carries `url` and nothing about the page's contents: `packages/cli/src/cli.ts:1564` (`body: { url, task, probe…, auth }`); the worker then navigates to it itself (`Page.navigate`, `screenreader-worker@291ed35 src/browser-session.mjs:445`, read in `docs/auth-attach-spike.md:66`) |
| **its cookies and `localStorage`**, as `context.storageState({ path })` (TypeScript) or `context.storage_state(path=...)` (Python), one file format | **Yes, `--auth-state <file>`**, beside `--flows` and `--login-flow` | the CLI reads Playwright's own shape: `packages/cli/src/auth/state-file.ts:52-55` (`stateShapeProblem`: `cookies[]` and `origins[].localStorage[]`); flag at `packages/cli/src/cli.ts:283`; loaded in BOTH layers over the browser protocol (`interpreter.ts:59`, `playwright-driver.ts:94`) |
| **its `sessionStorage`, IndexedDB, or a token held in a JavaScript variable** | **No**, and the run says so by ending `auth-state-expired` | not in the file or not loaded: `docs/github-action.md:595` (`sessionStorage` "is not persisted", IndexedDB "is in it only if you asked for it and is not loaded here"); the spike's stand-in page "keeps the session in a JavaScript variable, the way the outside evaluator's SDK does: no cookie, no storage" (`docs/auth-attach-spike.md:13`) |
| **the DOM** (`page.content()`) or **the accessibility tree** (`ariaSnapshot()`, CDP `getFullAXTree`) | **No, and not worth building** | no field in the request carries one (`cli.ts:1564` above), and the capture is NVDA reading a live browser window, so a snapshot is a different product (no script, no focus, no live region) and could not be what NVDA announces. The rule layer takes the URL as well and re-navigates it (ADR 0038, fact 2) |
| **its own axe run** (`@axe-core/playwright`, `axe.run()`) | **Yes, as `--axe-results <file>`** | `packages/cli/src/cli.ts:314`; `packages/cli/src/scan/axe-results.ts:1-20` accepts `{ violations: [...] }` "axe.run() / @axe-core/playwright" and rejects anything else loudly. It covers the page the test is ON, in-memory session included, and it is axe-core's reading alone |
| **its signed-in browser itself** (CDP attach) | **No: ruled a conflict** | `docs/auth-attach-spike.md:3`; ADR 0038 Constraint 3 scopes it "CLI-only, loopback-only, and not unattended" (`docs/adr/0038-authenticated-capture.md:186`) |

**Can the screen-reader capture use the state? Only where the worker can read the file.** Three facts, each from the code:

1. **The wire carries a PATH on the worker's own machine and never the file** (ADR 0038, Constraint 1 and amendment 7 choice 5;
   `packages/cli/src/auth/resolve.ts:169-172` builds `{ path }`). So the suite and the worker must share a filesystem.
2. **A remote worker refuses any authenticated run before the body is built**: `refuseAuthOnRemoteWorker`
   (`packages/cli/src/auth/refusals.ts:88`, called at `cli.ts:1557`), `auth-refused-remote-worker`. Loopback is the only
   accepted address (`refusals.ts:61`, `isRemoteWorker`).
3. **A Linux suite's page is therefore not the worker's page**, and nothing in a Linux job can put its state in front of a
   Windows worker except a step the adopter writes: the documented route is "decode the saved state from a secret into
   `$RUNNER_TEMP`" in the job that runs a11ign (`docs/github-action.md:547-575`). That job is the Windows one, a private
   repository's only (ADR 0038 amendment 3, `auth-refused-public-repository`).

So the supported topology is exactly this: **the Playwright suite and a11ign on one Windows machine, or two jobs where the
second is the Windows job and receives the state file as a secret.** A suite that runs only on Linux contributes the state
file and, separately, an axe result; it contributes no screen-reader reading, and the fixture must not pretend otherwise.

**What the fixture has to write that the adopter has not got.** `--auth-state` is refused without `--flows` and
`--login-flow` (`resolve.ts:145-148`), because the login flow's final `expect:` is what decides the state is still good. A
suite has no such file. The fixture can generate a one-step flow, and that parses: **MEASURED** by copying `flows.ts` at
`b260eb84b` to a scratch directory and running `parseFlowsFile` then `resolveLoginFlow` over

```yaml
version: 1
origin: https://app.example.test
flows:
  signed-in:
    steps:
      - expect: { control: "Sign out" }
```

which printed `{"name":"signed-in","steps":[{"expect":{"kind":"control","name":"Sign out","timeoutSeconds":10}}]}` (command:
`./node_modules/.bin/tsx probe.ts`, scratch directory, `flows.ts` byte-identical to `packages/cli/src/auth/flows.ts` at that
commit). Two consequences the fixture's caller must be told:

- **The `expect:` has to be named by the adopter** (a control every signed-in page carries; `docs/github-action.md:592-594`
  says the same). The fixture cannot guess it, so it takes it as a required argument and has no default.
- **A flow that fills nothing switches `auth-session-lost` off**: `landedOnLoginForm` returns false when "a login that fills
  nothing has no form to recognise" (`packages/cli/src/auth/interpreter.ts:266-269`). The `expect:` is then the only signal
  that the state held, which is the ruled signal (amendment 7, choice 1) and no worse for a state run, but it is one defence
  where a form login has two.

**Where the evaluator's own case lands.** The spike's verdict names it: "Auth0 Universal Login, tokens in page memory"
(`docs/auth-attach-spike.md:115`). A storage state cannot carry a token that lives in a variable, so the fixture ends that
run in `auth-state-expired` with the remedy the fault already carries, which is an honest failure and not a false clean
(ADR 0020). The route for that app is row 3 of the spike (a scripted login with a test account, with `idp-origins:` declared,
`packages/cli/src/auth/flows.ts:362`), and not this outcome. **Whether a given adopter's app persists its session is the
first thing the fixture's first user finds out, and it is what the falsifier below watches.**

## What it would cost

**Pull requests and fleet minutes.** All INFERRED from the shape of the code above and from two comparable merged pull
requests; the fixture needs no capture to test, so none of it needs the fleet.

| step | pull requests | fleet worker-minutes | Windows runner minutes |
|---|---|---|---|
| TypeScript fixture + example file + its test (`## First row`) | **1** | **0**: the test uses a fake `a11ign` executable that records its argv and the files it was handed, as `packages/cli/src/action/nightly-example.test.ts` reads an example without running it | 0 |
| Python fixture (pytest, `pytest-playwright`'s `context`): the same contract, written second | **1** | 0 | 0 |
| one real rehearsal of the first row's fixture on `windows-2022`, a hand-run (orchestrator's, not an engineer's): one passing state, and one expired state as the positive control | 0 (it is a run) | 0 (a runner, not the fleet) | **16 to 20**: 2 runs × 8 to 10 minutes, READ from `docs/capture-cost.md:115` (row "1 capture", typical 340 s model 8 min, worst 460 s 10 min; the page was last changed at `d1ede034a`) |
| the two-job hand-off for a Linux-only suite (state as an artifact or a secret, a11ign in the Windows job): documentation only, with the secret's masking already written | 1 (docs; may be folded into the Python pull request) | 0 | 0 |
| a published `@a11ign/playwright` package | **not recommended**, see below | | |

**Basis for "one pull request each".** Two merged pull requests of a comparable shape, MEASURED with
`gh api repos/a11ign/a11ign/pulls/<n> --jq '"+\(.additions)/-\(.deletions) files=\(.changed_files) created=\(.created_at) merged=\(.merged_at)"'`
on 2026-10-09: **#2631** (the `--auth-state` containment, the ADR's own amendment) **+422/-4, 6 files, opened 08:01:21Z and
merged 08:19:23Z (18 minutes)**; **#4645** (`--compare-axe`, a new CLI mode with its test and docs) **+322/-1, 5 files,
12 minutes 51 seconds**. Those intervals are review-and-merge latency and say nothing about authoring time, as ADR 0038's
estimate also says of its own figure. A fixture of about 80 lines, its test of about 150 and an example's comments is
**inside that range, INFERRED, not measured**. The Python twin is smaller (the contract is already decided and the file
formats are identical), with one extra cost named next.

**The Python leg's one real cost.** `requirements-ci.txt` pins "the SUBSET the Python test suite needs" and
`python-ci-requirements.test.ts` pins it against the lab's `packages/scorer/requirements.txt`; Playwright for Python is in
neither (MEASURED: `git grep -n -i playwright -- '*requirements*.txt'` printed nothing at `b260eb84b`). So the Python fixture's test
must be written against a **duck-typed context** (an object with `storage_state(path=...)` and a `pages` list) and not import
Playwright, or the row grows a dependency decision in a file two tests pin. That is a design constraint on the row, not a
reason to refuse it.

**Why one fixture contract and not two fixtures.** The CLI is a `bin`, "not a library" (`packages/cli/src/index.ts:3-7`: the
public surface is the renderer alone and exporting a second orchestration would be "two APIs to keep honest"). Both fixtures
therefore do the same four things in their own language: write the state file with the suite's own call, write the one-step
flow, run `a11ign <page url> --flows … --login-flow signed-in --auth-state … --json` without a shell, and delete the state
file after. **That is why Python costs about half of TypeScript and not the same again**, and why a published package for
either is not on the list: it would be a release surface (`RELEASE.md`) and a peer-dependency range on `@playwright/test`
for a slice nobody outside has yet depended on. **What would change this:** a second adopter copying the example file
unchanged, which is the evidence that a package would be used.

**Why the DOM and accessibility-tree hand-off is not on the list, and what would change that.** It needs a worker mode that
serves a snapshot to NVDA (a new capture product with no script and no live regions), and the one layer that could take an
accessibility tree without NVDA is the rule layer, which already takes axe's own output through `--axe-results`. **What would
change this:** a rule that asserts from the tree alone, as the PDF layer's Figure-without-alt check does, which is the same
condition outcome 10 sets for a Linux census (`docs/outcomes/outcome-10-linux-path.md`, "Why the census is not on the list").

**Is it worth doing at all?** Yes, narrowly. For an adopter whose Playwright suite signs in by a route that is not a
scriptable form (an API token injected in `global-setup`, a stored SSO session) and whose app keeps that session in cookies
or `localStorage`, this is the only route that exists in this repository today, and it costs one pull request to test. For
the evaluator's app as the spike describes it, **it is not the answer and will print a refusal**; if that is the only app the
chairman wants served, do not build this and prioritise the test-account login row. The fixture's own value is to separate
those two populations cheaply, which is a smaller claim than "runs inside your suite" and the document does not make the
larger one.

## First row

One row, small enough for one pull request. `product-manager` files it from this section.

**Title:** `A Playwright fixture hands a11ign the page's URL and the suite's storage state, and refuses where the state cannot be used (#4084 outcome 11)`

**Region**

```
examples/playwright/a11ign-fixture.ts
packages/cli/src/action/playwright-fixture-example.test.ts
```

**Change.** Add `examples/playwright/a11ign-fixture.ts`, an example file to copy (not a package, and not exported from
`packages/cli/src/index.ts`), exporting a `test` extended with an `a11ign` fixture. Calling
`await a11ign({ signedInControl: "Sign out" })` on the page the test is on does exactly this, and nothing else:

1. throws before doing anything if `signedInControl` is missing or empty (there is no default: the `expect:` is the
   adopter's to name, and a guessed one would read a wall as a page);
2. writes `context.storageState({ path })` to the test's own output directory with mode `0600`, and **never requests
   IndexedDB** (the tool does not load it);
3. writes a flows file whose `origin:` is `new URL(page.url()).origin` and whose one flow, `signed-in`, is the single step
   `expect: { control: <signedInControl> }`;
4. runs `a11ign <page.url()> --flows <file> --login-flow signed-in --auth-state <state> --json` with `execFile` (no shell),
   the worker taken from `A11Y_WORKER` as the CLI takes it, and returns the parsed `--json`;
5. **deletes the state file and the flows file in a `finally`**, on a pass, a refusal and a throw, because the state is a
   credential and the tool itself "writes no state file" (ADR 0038, Constraint 2);
6. on a non-zero exit throws an error carrying the CLI's stderr verbatim and the exit code, so `auth-refused-remote-worker`
   (exit 2), `auth-state-expired` and `auth-state-refused-by-rule-layer` arrive as themselves and are never turned into a pass.

The file's header comment states, in its own words, the three limits of `## What it covers`: the suite and the worker must be
one Windows machine; a session held in page memory, `sessionStorage` or IndexedDB ends `auth-state-expired`; and the state
file is a credential that belongs in a private repository only. It does not touch `action.yml`, the CLI, the worker or the
docs.

**Acceptance**

```bash
bash -c 'pnpm exec tsx --test packages/cli/src/action/playwright-fixture-example.test.ts'
```

The test runs the example's fixture against a fake `a11ign` executable (a Node script on `PATH` that writes its argv and the
contents of every file it was handed to a recording file, then exits with a code the test sets), so no browser, worker or
Windows machine is needed. It must show, each as its own assertion:

- the argv is exactly `[<url>, --flows, <file>, --login-flow, signed-in, --auth-state, <file>, --json]`, and the process was
  started with no shell (the call is `execFile`, asserted from the source and from the recorded `argv0`);
- the state file the fake received parses with this repository's `parseStorageState`
  (`packages/cli/src/auth/state-file.ts:68`), and the flows file parses with `parseFlowsFile` then `resolveLoginFlow`, with
  `origin` equal to the page URL's origin: **both files are checked by the real parsers, not by a copy of their shape**;
- **the state file does not exist afterwards**, in the passing case and in the case where the fake exits `2` (the credential
  is not left behind);
- an exit `2` with stderr `auth-refused-remote-worker …` rejects with that stderr and `2` in the error, and an empty
  `signedInControl` rejects before the fake runs at all (the recording file is absent);
- the example file's text contains none of `--password`, `--token`, `--cookie`, `--header`, so the tool's own rule that no
  secret travels on argv (ADR 0038, Constraint 2) holds for the example as well;
- **mutation, both directions:** delete the `finally` so the state file survives and the deletion assertion fails (and no
  other test breaks); make the empty-`signedInControl` refusal fire always and the passing case fails; each restored from a
  `cp` copy and `diff`ed byte-identical.

Where `playwright` is launchable, the test also builds the state with a real `browser.newContext()` plus `addCookies`, so the
file is Playwright's own bytes; where it is not, the skip names its reason and the duck-typed case still runs, and the test
asserts that the real-browser case ran at least once in the ordinary case (a skip that always fires is a check that never
runs).

**Done-when.**

1. The pull request merges and `pnpm run verify` is green at its head.
2. `product-manager` files the Python twin (same contract, duck-typed context, no Playwright import in the repository's
   Python tests) from `## What it would cost` on this row's merge, and `orchestrator` is asked for the one rehearsal on
   `windows-2022` (a passing state and an expired state, 16 to 20 runner minutes), not an engineer.
3. **What would stop the sequence:** the rehearsal's first real app ends `auth-state-expired` with its session in page memory.
   That is the outcome's falsifier, and the next row is then the test-account login (the spike's row 3), not the Python twin.

**Tier:** Sonnet. **Fleet:** No (the row builds and tests on Linux; the rehearsal is `orchestrator`'s).

## What would falsify this

- **The adopter's app keeps its session in memory.** Then storage state hands over nothing and this outcome's population is
  smaller than "suites with a non-form login". The first rehearsal reads it; the evaluator's SDK is the known case.
- **The adopter's suite is Linux-only and will not run a Windows job.** Then the fixture contributes a state file nobody can
  load and an axe result, and the screen-reader reading still comes from a separate Windows job: the topology above, not a
  bug, but it is not "runs inside your suite".
- **A site binds its session to the browser that made it** (the case amendment 8 measured on the-internet.herokuapp.com): a
  state a Playwright Chromium made may be refused by the worker's Edge as `auth-state-refused-by-rule-layer` or
  `auth-state-expired`. The fixture cannot repair it and the faults already say which layer refused.
