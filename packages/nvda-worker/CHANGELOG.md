# @a11ign/screenreader-worker

## 0.1.0

### Minor Changes

- dcf4386: The first published version of `@a11ign/nvda-worker`. Everything below landed before it: the rename first, then oldest first.
  
  - The product is renamed: formerly a11y-witness, now a11ign. The npm scope, the unscoped CLI package, the
    binary names and every cross-package import specifier change with it (issue #66). Nothing had been
    published under the old name, so this is a rename landing in the tree before the transfer to the
    `a11ign` GitHub organisation, not a migration for existing consumers.
  
  - The hard capture timeout now carries a fault code (`hard-timeout`) instead of an untagged `Error`, so a
    CLI reader gets a plain-language explanation — "the capture ran too long and was abandoned" — instead of
    the generic no-remediation path. The message also names how far a partial capture got (the last recorded
    progress phase, and how many progress marks were recorded) when the worker reported one, so "we ran out
    of time partway through" and "we could not read your page at all" read as the different findings they
    are. Additive on the wire: an older CLI reading a fault code it does not recognise already falls back to
    "no remediation recorded" rather than failing, and an older worker's untagged timeout error is unaffected
    by either side of this change.
  
  - The Windows worker's checkout, its shared `ProgramData` directory and Edge's capture profile are named
    again as they are on the machines. The rename (#66) moved the strings in the tree; it did not move the
    directories on the guests, so the worker's profile resolution and every provisioning script pointed at
    paths that do not exist — and a successful deploy would have created a fresh, unwarmed browser profile
    beside the real one. `A11Y_REPO_PATH`, `A11Y_EDGE_PROFILE` and `A11Y_BROWSER_PROFILE` still override and
    are unaffected.
  
  - The browser profile a capture ran against is now part of the capture cache key and a fleet-consistency
    field. A cold profile and a warm one are different evidence — a fresh user-data-dir shows the browser's
    first-run surface, which the screen reader can record as page content, and a learning profile changes
    what form fields announce. Existing profiles are ADOPTED rather than treated as changed, so no cached
    capture is invalidated by this shipping; only a genuinely new or wiped profile moves the key.
  
  - `/progress`'s `phases` array now echoes every field a diagnostic mark carries (e.g. `structureCensus`'s
    heading/landmark counts), not just `{event, atMs}`. That detail was already being recorded in memory on
    every capture; this endpoint was discarding it at the final response step. Purely additive: existing
    consumers reading `event`/`atMs` see no change, and the response only ever reports what was actually
    observed, never a heuristic verdict computed from it. Does not change `CAPTURE_PROTOCOL_VERSION` (nothing
    about what stored evidence means has changed), but does change `codeVersion()` since `server.mjs` is
    hashed — deploy with `fleet:deploy` before relying on this over HTTP.
  
  - `waitForSpeechQuiet` no longer treats a FAILED read of the speech log the same as a genuinely empty one.
    Previously, `.catch(() => [])` folded a query failure (a timeout or a dead speech channel) into the same
    length it used for a real quiet read — so a channel that stopped answering could report `quiet: true`
    after one settle window, indistinguishable from NVDA genuinely finishing speaking. This is a bug fix on
    the FAILURE path only: a normal capture, where every read succeeds, behaves byte-identically, so no
    cached evidence is affected. Only a capture that hit a genuine speech-channel read failure during a
    settle wait could have been mis-timed before this fix.
  
  - `packages/nvda-worker/src/README.md`'s setup instructions now clone the repository's real, currently-resolving GitHub location rather than the post-transfer product name, which does not exist yet — the same fix applied to the top-level README and getting-started guide (#647). No code change; documentation only.
  
  - The `structureCrossCheck` diagnostic mark's `oracleDistinctNames` field for `graphic` no longer
    counts unnamed images as distinct names. On a page with unnamed graphics it previously reported the
    raw element count (each nameless image counted as its own "name"), inflating the reported gap
    against the sweep by however many unnamed images the page has — measured 61 vs. the real 23 on a
    calendly capture with 38 unnamed graphics. Not a wire-protocol change: no capture field is renamed,
    added, or removed, and no host needs to change how it reads a capture. A consumer reading
    `structureCrossCheck.differsOn` for `graphic` will see a smaller, more accurate number.
  
  - Each structural sweep's `observed` record now says where focus sat when that sweep started. It gives one
    of four answers:
  
    - `focusInFrame: "<frame>"`: focus was inside a nested browsing context (`<iframe>`, `<frame>`,
      `<object>`, `<embed>` or `<fencedframe>`), named by its title, name or id, or else its source's host.
    - `focusInFrame: null`: focus was in the top document.
    - `focusInFrameUnknown: "<why>"`: the page could not say. For example, focus was on a host whose closed
      shadow root page script cannot read.
    - Neither field: the page could not be read.
  
    The page side is a `focusFrame` value on the DOM census that every sweep already reads, so this adds no
    round trip. It follows open shadow roots to the element focused inside them.
  
    This is a diagnostic only. It changes nothing a capture does, and no rule or signal reads it, so
    `CAPTURE_PROTOCOL_VERSION` is unchanged. Captures already on disk have neither field, which reads as not
    recorded.
  
  - A capture now carries `formInputs`: one `{ tag, type, autocomplete }` entry for each form control on the
    page (`input` except `type=hidden`, `select` and `textarea`). The value is read from the DOM at the same
    moment as `media`.
  
    - `autocomplete` is the **attribute** as the author wrote it, or `null` when the control has none. It is
      never the normalised property, which returns `""` for a token the browser does not recognise.
    - `null` for the whole field means the census did not run, and `[]` means the page has no form control.
    - A `formInputCensus` diagnostic mark records `count`, `total` (the list is capped at `FORM_INPUT_CAP`) and
      which document was read.
  
    This is the evidence 1.3.5's rule (`addUnidentifiedInputPurpose`) has been declared against, and it had no
    source until now. `CAPTURE_PROTOCOL_VERSION` moves from 16 to 17, because a new field that a rule and a
    signal read is that constant's trigger. Deploying it needs `--allow-protocol-change` and forces a full
    recapture.
  
    `@a11ign/evidence`'s `CaptureResult` type now names `formInputs` beside `media`, with the same contract.
  
  - Before the sweeps, a capture now returns focus to the top document when focus sits inside a frame that
    nothing of ours put it in. On #951's page, #953 measured that on 6 of 6 collapsed captures: a chat widget's
    frame held focus before the first probe, so every sweep type walked the widget instead of the page.
  
    - **The decision.** It is taken once, from the reading `runProbeSequence` already makes before its first
      step, and only when that step is the sweep. Under `probeOrder: focus-first` the Tab walk runs first, so no
      restore happens.
    - **The restore.** It blurs the focused frame and focuses the window through CDP, and adds nothing to the
      page.
    - **The record.**
      - A `focusRestore` diagnostic mark on every capture, either `attempted: false` with the reason, or
        `attempted: true` with the frame.
      - `observed.headings.focusRestored: { from, left }`, where `left` comes from the first sweep's own
        `focusInFrame`.
    - **The backstop.** Any sweep that starts inside a frame is marked incomplete: `complete: false`, with
      `heldBy` naming the frame.
  
    This is an evidence change, and it shares `CAPTURE_PROTOCOL_VERSION` 17 with #170's `formInputs`.
  
  - The Homepage link on each package's npm page now points at the project's repository rather than at `a11ign.com`, which does not resolve. Clicking it from npm previously went nowhere; it now reaches the source, the README and the issue tracker.
  
  - A capture no longer inherits the previous capture's resolved page URL. The two URLs a capture
    tracks — the one it asked for and the one its navigation landed on — now share a single reset at
    the capture boundary; before, only the first was cleared there and the second was cleared only when
    a navigation happened to run, so a worker serving many captures could carry a stale landing URL
    between them.
  
  - A worker now prefers a provisioning-recorded fact over inference when reporting whether its Edge profile
    was adopted or created fresh. Previously this rested entirely on the presence of Edge's own `Local State`
    file: if Edge stopped writing it, every profile would report as fresh, the cache key would move, and
    nothing would say so. Where no record exists — every profile provisioned before this — behaviour is
    unchanged, so no cached evidence moves. Where the record and Edge's file disagree, the worker logs it
    naming both possible causes rather than picking one.
  
  - **When a probe's activation takes the browser off the page's site, a11ign now ends the examination there.**
    That includes a new window or tab, or a URL on another origin. Nothing observed after that point is reported
    as the page's.
  
    **What a report says about it.** The log line reads `examination ENDED -- left the site at "<control>"`
    before the finding count. The summary leads with the same, and Conformance Requirement 2 names what was not
    examined. The JSON result carries a new top-level `leftSite` naming the control, and where the browser went
    when that is known.
  
    **Controls inside an embedded frame or object are no longer activated.** On the page the docs recommend,
    `https://www.w3.org/WAI`, the probe used to open the W3C's embedded YouTube player. Every sweep after it ran
    on youtube.com, and its one serious finding was reported against w3.org.
  
    **For the published types:** `@a11ign/evidence` exports `leftSite()` and `withinTheSite()`, and
    `CaptureInteraction` gains an optional `leftSite`. A capture made before this is still recognised from its own
    announcements ("Opening new window").
- 50d52e7: **A fleet field can now be COMPARED AND REPORTED without gating a capture, and Node is pinned in git (#2063).**
  `fleetConsistency` gains a third channel beside `MUST_MATCH`: `REPORTED_ONLY` fields are compared exactly
  as the gating ones are and named on the verdict with each guest's value, but they enter neither
  `mismatches` nor `fields.coverage` — the only two things `capture-fleet-guard` reads — so a fleet differing
  on one is `consistent: true` and no run is refused. The return value gains `reportedOnly`: one
  `{field, why, values, reported, asked, state}` per field that has something to say, where `drifted` is the
  guests giving more than one value and `unreported` is some or all of them giving none; a field every guest
  agrees on yields nothing. `describeReportedOnly` renders them. `fleet:status`'s headline over such a fleet
  no longer reads `these workers are interchangeable for capture` — that sentence is replaced rather than
  appended to, and the state is untouched, because a drift that cannot refuse a capture through the guard
  must not refuse it through the operator either.
  
  `nodeVersion` and `displayAdapter` are the first two, by `ceo`'s ruling of 2026-09-23: report it, pin
  provisioning so the fleet converges, and only then may it gate. The fleet was measured that morning running
  v24.19.0 on workers 2-6 and v24.20.0 on 7-11 with every other reported field identical, and
  `fleet:status` called it interchangeable. The worker's `/health` now also reports `displayAdapter` — the
  adapter NAME, which is what decides whether a pinned display mode can be held at all, and a different field
  from the driver version #1567 ruled on. It reads `unknown` on every guest until this worker is deployed,
  which is visible in the report and refuses nothing.
- 035bd3c: **`@a11ign/nvda-worker` is now `@a11ign/screenreader-worker` (#2885, #69, the split's R1).** ADR 0036 named the new name and it was never carried out on the registry. npm cannot rename a package, so this release publishes the new name as a FIRST publish and the old name is deprecated afterwards with a pointer here (an owner action: the trusted publisher cannot deprecate). Every importer in the workspace (`cli`, `lab`, `worker-fleet`, the root manifest) and every non-document file naming the old package now names the new one; the package's directory is still `packages/nvda-worker/` and the `a11ign-nvda-worker` bin is unchanged, both being M1's (#2701). Pinned by `package-rename-nvda-worker.test.ts`.

### Patch Changes

- eaa8ae3: **A login that stops at a CAPTCHA now ends in a named fault, `auth-challenge-detected`, instead of an unexplained `expect-not-met` (#2564).** It NAMES the challenge and never answers one: nothing clicks a widget, waits it out or works round it, and solving a CAPTCHA is refused by design. Both interpreters (the CLI's, and the worker's `auth-flow.mjs`) check only where a login or `flow:` step has ALREADY failed, a control that cannot be found or an `expect:` not met: if the page that failed it renders an iframe served from a reCAPTCHA, hCaptcha or Cloudflare Turnstile host (the hosts each vendor's Content-Security-Policy page documents), the failure is reclassified, with the step's own reason kept in the sentence. It never turns a success into a failure, so a dashboard carrying a reCAPTCHA v3 badge or an invisible Turnstile still passes its `expect:`. The read is a new fixed page-side call on both drivers (`frameSources()`, the `src` of the iframes the main document renders); the accessibility tree could not answer it, since an `Iframe` node carries only a `title` that no vendor documents. It is a fault and not a fourth `auth-login-failed` reason. `AUTH_FAULTS` goes from eleven to twelve, with a `FAULT_REMEDIATION` entry naming the dedicated-test-account route, and a worker `FAULT` code. **Not done:** the requested page after the login and the capture proper (no hook, and not ordered), a vendor other than the three, a widget in a shadow root or a nested frame, a frame that is not rendered, and a reCAPTCHA v3 badge cannot be told from the v2 checkbox, so a page that also failed for an unrelated reason is reported as the challenge.
- 4dd7dcc: **A run shown the login wall after a successful login now ends in a named fault, `auth-session-lost`, instead of being captured as a broken page (#2563).** Both interpreters (the CLI's, and the worker's `auth-flow.mjs`) read the accessibility tree of the page the run landed on, after the requested page loads and before `authApplied` is marked; if EVERY control the login flow fills is on it (found by accessible name, `within:` honoured), the run was shown the login form, whether by a same-origin redirect (which used to end as the generic `wrong-page`) or in place (which used to be captured as the page). The signal is the form, not the flow's `expect:`, which holds on the dashboard and on no other page. A page carrying one control named like one login field (a change-password page) is not the wall, and a login that fills nothing never trips it. It is a fault and not a fourth `auth-login-failed` reason: the login succeeded. `AUTH_FAULTS` goes from ten to eleven, with a `FAULT_REMEDIATION` entry and a worker `FAULT` code. **Not done:** the main frame's tree only (a login form in an iframe is not seen), one read (a wall rendered later is not seen), and one-session-per-account invalidation of the rule layer's login is not measured.
- 5c4020b: A form, task-button, toggle or route activation's recorded `after` no longer includes the pressed control's own re-announcement (its name, role or a bare container such as "search landmark"), so two identical captures of one page record the same page speech (#1467).
- 84eedd3: **The worker can log in to the page it captures, and no request can ask it to yet (#2359, PR 4 of 7).** A capture request may now carry `auth`: a login flow and an optional flow to replay to a capture point, whose secrets are environment-variable NAMES the worker reads from its own environment. The worker checks the request again on arrival (closed vocabulary, origin pinned, a login takes `fromEnv` only and ends in an `expect`), refuses an auth request from a peer that is not on the machine with `403 auth-refused-remote-worker`, finds a missing variable before it launches a browser, signs in over the browser protocol's text insertion before the transcript begins, answers `authApplied: true` only after the sign-in ran to its end, and destroys the session after the capture (cookies, cache and storage for the origin, then the browser). An authenticated request never reuses the browser, and its stored response is held for one delivery, and for at most five minutes if nobody collects it. A request with no `auth` behaves exactly as before.
- 7055253: **Importing `@a11ign/nvda-worker` no longer crashes on a host with no screen reader (#1772).** `capture-setup.mjs` and `capture-probes.mjs` used to `import … from "@guidepup/guidepup"` at the top of the file; that package constructs a module-level `ScreenReader` singleton at import time and throws `No available supported screen readers` unless it resolves macOS VoiceOver or Windows NVDA — so merely importing this package by name crashed `capture:check`/`identity:rate` at import even in `--worker` HTTP mode, which never drives NVDA locally at all. Both files now reach `@guidepup/guidepup` through a dynamic `await import()` inside the function that actually drives NVDA, so the crash stays at first real use rather than at import.
- 66a48a3: **`CAPTURE_PROTOCOL_VERSION` moves 18 -> 19**, one bump carrying four meaning changes at once rather than
  paying a recapture per change: #1506's focus-reveal crediting fix, #1561's window-width pin (joining
  `environmentKey` and `MUST_MATCH`), #1575's skipped-focus channels in a live excursion's `observed` block,
  and #1549's visibility-aware DOM heading count -- plus #1467's formChanges own-context fragment strip,
  which was on main and capture-side (not a no-op reading strip) when this row was claimed. No capture is
  dispatched at code including #1506 until this bump is on main and deployed (#914). The cost is one full
  recapture, paid once for all five reasons.
- 8535de1: **Every capture's `environment` now records the CSS viewport the page was read at: `innerWidth`, `innerHeight`
  and `devicePixelRatio`.** They are read from the page after it settles and before any probe runs.
  
  **Why.** Captures launch the browser maximized with no window size, so the width is whatever each worker's display
  is. Responsive pages show different content either side of a breakpoint. Two captures of one page yielded different
  findings at different widths, and nothing recorded which width produced which evidence (#1513).
  
  **What changes.**
  - The fields are absent when the width was not measured, whether by an older worker or a read that failed. They are
    never zero.
  - A capture retried after a recoverable fault records the retry's read.
  - `/health` is unchanged.
  - The published `CaptureResult.environment` type declares all three as optional.
  
  **What does not.** The width is not part of the capture cache key, and it is not a fleet-consistency field. The
  capture protocol is unchanged, and so is the browser's command line. Pinning the window size is separate work.
- 63704c7: **The capture window is pinned to 1024x768, and the width it was pinned to is part of the capture cache
  key (#1561).** Captures launched the browser with `--start-maximized` and no window size, so the CSS width
  the page under test was read at was a property of whichever box ran the capture. Responsive pages show
  different content either side of a breakpoint: two captures of `caselaw` matched a `<768px` layout and a
  `>=992px` layout and yielded different findings (#1043), and weather.metoffice.gov.uk's CSS hides its `h1`
  below 1280px (#1522). #1513 made the width visible by recording it; this makes it the same on every guest.
  
  **What changes.**
  - Every browser now launches with `--window-size=1024,768` instead of `--start-maximized`. The two are not
    combined: Chromium's resolution of one against the other under `--app` is undocumented and was never
    measured on this fleet, and an unsettled precedence is the variable this removes.
  - `/health`'s `environment` and every `CaptureResult.environment` carry `windowSize`, the size the worker
    asks the browser for, as `"<width>x<height>"`.
  - `environmentKey` hashes `windowSize`, so a pinned capture and a maximized one cannot share a cache entry.
    An absent value reads as `"maximized"`, which is what every capture taken before this is.
  - `fleet-consistency`'s `MUST_MATCH` compares it, so a half-deployed fleet reads INCONSISTENT instead of
    blending two populations. `captureProtocol` cannot do that job here: a guest still on the pre-pin worker
    code reports the same protocol as a pinned one.
  
  **The value is 1024x768 because that is what the fleet's displays hold.** Provisioning sets one display
  mode on all ten guests (#1567) and all ten report `displayMode: 1024x768`. A Windows browser window is
  clamped to the display work area, so asking for more than the desktop holds yields the desktop; a wider pin
  is a fleet change first, not a flag change.
  
  **The cost: every cached capture misses once.** Adding a field to the cache key re-keys the whole corpus,
  and that is the intended effect rather than a side effect — evidence taken at an unpinned width is not
  evidence taken at a pinned one. There is no CDP emulation here: whether
  `Emulation.setDeviceMetricsOverride` changes what UIA or IAccessible2 report has never been measured, and
  NVDA reads the accessibility tree.
  
  **What does not change.** `CAPTURE_PROTOCOL_VERSION` is untouched — the bump that carries this meaning
  change is #1573's 18->19, which names this row. `innerWidth`/`innerHeight`/`devicePixelRatio` (#1513) stay
  recorded and unkeyed: they are what the page was actually read at, which is the outcome of the request
  rather than something a cache lookup can know in advance. `displayMode` (#1953) stays unkeyed too.
- 2af1cf0: **The authenticated-capture driver waits for Edge's DevTools port instead of asking once (#2475).** `openCdpDriver` asked `/json/list` a single time right after `openPage` spawned Edge, and Edge listens about half a second later, so every authenticated capture on a real worker failed with `connect ECONNREFUSED 127.0.0.1:9222` before the login began (12 of 12 on `a11y-worker-3`, #2399). It now retries a REFUSED connection until the port answers, bounded by the same 60 s the reusable launch gives it (`CDP_READY_TIMEOUT_MS`, now exported from `browser-session.mjs`), and refuses with `CDP: the DevTools port <n> did not open within <ms> ms`. Any other failure, and any HTTP status, still surfaces at once.
- 7463670: **The DOM census no longer counts headings the page does not render.** A capture's census `heading` count used to include every `h1`–`h6` and `role="heading"` element not marked `aria-hidden`. That included an `h1` styled `display: none` below a breakpoint, and headings inside closed menu panels. On `weather.metoffice.gov.uk`'s warnings page the census read 40 headings while the accessibility tree and NVDA's heading sweep read 0. That reads as "forty headings the tree cannot see", when a visitor meets none of them.
  
  The count now includes only headings the browser reports as rendered: `checkVisibility()`, and not inside an `[inert]` subtree. This is the same test the census already applies to tab stops. The headings it leaves out are counted beside it as `headingHidden`, so a capture says how many were set aside rather than dropping them silently. A browser without `checkVisibility` counts its headings as before (#1549).
- 97f964e: **`displayAdapter`'s operator-facing text now says what is true, dates every hardware reading, and is pinned (#2211).** #2246 had already replaced "no deployed worker reports it yet" in `fleet-consistency`'s exemption, but pinned only the field's behaviour and none of its text, so the correction held at one commit with nothing keeping it there. The exemption now dates the 640x480 fallback (2026-09-22, #1955) and the `UHD`/`HD` reading (2026-09-23); the worker's own `displayAdapter` comment no longer says the fleet reads the field as `unknown` "until this code is deployed" (deployed 2026-09-23T18:02Z) and dates its 640x480 clause. Three tests in `fleet-consistency.test.ts` hold this: neither text may claim the field is unreported, the exemption must state that 10 of 10 guests report it, and each hardware reading must sit beside a date. Each carries a positive control that the old sentence is caught. Comment-only in `server.mjs`: no behaviour, `CAPTURE_PROTOCOL_VERSION`, `provisionRevision` or `environmentKey` moved.
- 11fab84: **The worker reports the screen it captures on, and `MUST_MATCH` compares it (#1953).** `fleet:status`
  printed "fleet CONSISTENT across 10 of 10 -- these workers are interchangeable for capture" at
  2026-09-22T18:21Z over a fleet running 1024x768 on five guests and 640x480 on the other five. That was a
  uniformity claim over a property nothing checked: `MUST_MATCH` had nine fields and none was the display,
  and it could not have had one -- `/health`'s `environment` reported the browser, the screen reader, the
  OS, the architecture, the protocol, the profile, the settings and the provision stamp, and nothing about
  the screen. `provisionRevision` does not cover it: the provisioning script writes that stamp itself, so
  it records which provisioning RAN rather than what it achieved, and a guest whose display-driver install
  failed still gets the new stamp.
  
  `displayMode` is read from the worker's own process (`SystemInformation.PrimaryMonitorSize`, which is
  `GetSystemMetrics(SM_CXSCREEN/SM_CYSCREEN)`), because that is the only place it can be read honestly: a
  display call over the fleet's SSH path lands in session 0, which has no interactive window station and
  answers for no desktop (#1955), while the `a11ysrv` task runs with `logon_type: interactive_token`. It is
  not memoised -- the display changes under a running worker, and noticing that is the point.
  
  **NOT a capture-cache-key input, deliberately.** `environmentKey` is an allowlist and this field is not on
  it, so **no cached capture is invalidated and no recapture is owed**. Whether the display belongs in the
  key is a question this raises and does not answer; #1561 pins the capture WINDOW and carries its own
  protocol bump for that reason.
- 8545734: **The focus-event log now records what already held focus (#2587, #2550 half 2), and `CAPTURE_PROTOCOL_VERSION` is 22.** A protocol-21 log opens on whatever the page does next, so a control that held focus first (a cookie-consent widget, on 8 of 100 protocol-21 real pages) shows as a bare `focusout` that 2.4.7's rule can only call `unpairable`. The install now pushes `document.activeElement` as the first entry, `type: "focusin"` with `initial: true`; focus on the body pushes nothing. `focusLossVerdict` reads no hold time off an `initial` entry, since its `atMs` is the install moment: its `focusout` is `clear` when focus lands on a different control inside the window and `unpairable` otherwise, and a witnessed pair asserts exactly as before. The `i === 0` carve-out stays for captures at protocol 21 and below. Deploying needs `--allow-protocol-change` and a recapture, which this change does not perform.
- d176f14: **The focus-reveal probe (1.4.13) now separates a reveal caused by focus from content that arrived on its own.**
  
  **How it separates them.** Each tab stop reads the accessibility-tree census immediately before its Tab, and focus is
  credited only with what grew since that read. A late script or an on-scroll element that adds content while the walk
  runs is no longer credited to whichever control happened to hold focus.
  
  **What the verdict records.**
  - **`revealedNames`:** the names that appeared.
  - **`timeSeparated`:** whether a control read was available. It is `false` for a caller that passes none, which keeps
    the old single-baseline comparison.
  
  **What it changes.** For content that arrived on its own, `interaction.focusReveal.revealed` now reads `false` where it
  read `true`. That is a change to what the evidence means. The capture-protocol bump that keeps older cached captures
  apart ships separately (#1573), and no capture runs at this code until that bump is deployed (#1506).
- e2eef75: A worker whose desktop foreground is held by a notification toast, Windows search, or the Start menu (so a
  launching Edge could never take focus) no longer sits wedged indefinitely: `prepareDesktop` now clears the
  holder before a capture, the same way it already clears a blocking dialog, instead of only recording that
  it found one (#1733). A foreground holder it cannot clear still degrades to "did nothing" and the capture
  proceeds regardless — the same rule the dialog path already followed.
- 3480015: **An unnamed graphic in the tree census now says which element it is.** Each `graphicUnnamedDetail` entry carries the AX node's `backendDOMNodeId` (`null` on generated content) and an `element` read from Chromium's DOM domain, in the DOM census's own form, such as `img logo.png .brand`. So a 1.1.1 census referral names the node it came from (#1507).
  
  The DOM census's `unnamedGraphics` selector is unchanged. Its comment now records the graphic shapes it does not select, and why it was not widened.
- 6e9886e: **`/health` no longer runs `powershell.exe`, so the worker no longer goes deaf for 0.6 s (2.9 s on three boxes) every fifth second (#2673).** The environment block `/health` serves rebuilt behind a 5 s cache, and the rebuild ran `displayMode()` and `displayAdapter()` as two SYNCHRONOUS PowerShell calls, which block Node's event loop for their whole duration: on every route, not just `/health`. The two facts are now sampled by a timer (`display-sample.mjs`) with ASYNCHRONOUS PowerShell, so they are still re-read under a running worker and a change stays visible, and a request only reads the last sample. **The sample carries its age:** `environment.displaySampledMsAgo`, computed at read time (`null` before the first sample lands, when both fields read `"unknown"`). `displayMode` and `displayAdapter` keep their meaning and their `"unknown"` fallback; `/health`'s other fields and the capture cache key are unchanged. It is worker code, so it reaches the boxes with `fleet:deploy`.
- b2c65a8: **`/health` no longer runs `powershell.exe` for `windowsVersion`, `screenReaderVersion` or `browserVersion` either (#2684) -- the #2673 stall again, for the three reads #2678 left.** `runtimeEnvironment`'s 5 s rebuild called `bootConstant`/`fileProductVersion` for these three straight from `/health`'s request path, and neither memoises a failure: a version that had not yet been read, or a binary that had changed on disk, re-ran `powershell.exe` SYNCHRONOUSLY on every rebuild for as long as it could not answer, blocking Node's event loop for the whole call on every route. The three facts are now sampled by a timer (`createVersionSampler`, `file-version.mjs`) with ASYNCHRONOUS PowerShell, so they are still re-read under a running worker and a change stays visible, and a request only reads the last sample. **The sample carries its age:** `environment.versionsSampledMsAgo`, computed at read time. The version-changed warning, the fields' meaning and their `"unknown"` fallback are unchanged; the capture cache key is unchanged. It is worker code, so it reaches the boxes with `fleet:deploy`.
  
  `@a11ign/worker-fleet`'s `fleet-consistency.test.ts` is a no-op for a consumer: its own `workerReportedFieldsSource` helper, which scans `nvda-worker`'s source for the field names `/health` sends, now also reads `file-version.mjs`'s `current()` block, since the three fields above moved out of the block it already read.
- 51640ea: **You can now load a saved sign-in instead of performing one (#2632, #2566, ADR 0038 amendment 7).** `--auth-state <file>` (the Action's `auth-state:`, beside `flows` and `login-flow`) loads a Playwright storage state you saved by signing in by hand, in place of the login: the cookies and `localStorage` for the run's own origin go in through the same browser-protocol calls in the screen reader's browser and in the rule layer's, the login flow's final `expect:` is asked of the page the run requested, and a state that no longer holds ends the run with `auth-state-expired` and captures nothing. A single-sign-on session that has expired ends the same way, and a CAPTCHA on the page is still `auth-challenge-detected`. The worker is sent a path and nothing else and reads the file itself; every value the state loaded is hidden from what the run writes and prints, and values under 8 characters and values you gave the run yourself are counted and said, not hidden. The tool never writes the file. `sessionStorage` is not in a state file and IndexedDB is not loaded, so a site that keeps its session there cannot be carried. Not yet measured against a real site. See SECURITY.md and docs/github-action.md, "Logging in with a saved state".
- 81ca765: **A capture that did not probe navigation no longer records that navigation is opt-in.** When the navigation probe was off, `observed.routeChange.why` read "probeNavigation is opt-in", but navigation is ON by default in the CLI and the Action. It now reads that navigation is ON by default and this capture turned it off (`--no-probe-navigation`, or the Action's `probe-navigation: false`). `observed.routeChange.asked` is unchanged. The GitHub Action gains a `probe-navigation` input, default `true`, so a workflow can turn the probe off on a page it does not own (#1392).
- f22ae6e: Documentation-only: example commands and test fixtures now point at `a11ign/a11ign` instead of the pre-transfer `DanBeckDev/a11y-witness`, so copying them resolves to the repository's current location.
  
  - `packages/cli/README.md`'s example workflow's `uses:` line.
  - `packages/nvda-worker/src/README.md`'s `git clone` step.
  - `packages/judge/src/documented-criteria.test.ts`'s fixtures and comments, which assert the README's own snippet.
  
  No code, wire protocol, or capture behaviour changed.
- 56a3b75: The route-change probe retries a failed focus read once after following a link, and records why it could not read instead of a bare null.
- dc52dc0: `routeChange.navigated` is now derived from NVDA's own document-change announcement instead of always reading `true` on a successful activation, so a control that activates but never moves the document reads `false`.
- c66ee39: **A capture that left the site before its focus pass now records `focusReveal` and `focusEvents` as not run.** Before, `observed` named only `focusOrder` and the four opt-in focus probes, so those two channels had no record and did not read as "not examined" (#1575).
  
  The worker's skipped-focus channels are now the focus step's channels. A test pins them equal, as text, to `@a11ign/evidence`'s `FOCUS_STEP`.
- 6345c3f: **`@a11ign/nvda-worker` exports `./auth-flow` and `./windows-trim`, and its tests no longer reach into sibling packages by path (#2612, child 1 of #69).** The two modules were read by relative path from tests that compare them with `cli`'s `flows.ts` and `worker-fleet`'s `build-lean-worker-image.ps1`; those parity assertions moved to `lab` and `worker-fleet`, which read the worker by package name. No runtime behaviour changes.
- b53527b: **`CAPTURE_PROTOCOL_VERSION` moves 19 -> 20.** `interaction.formChanges[].after` intermittently recorded
  NVDA's `"unknown"` placeholder for a document whose title had not resolved yet, on a submit that
  navigated -- measured at 11/32 (34.4%) across the four populations it was seen on. `activateAndCaptureDelta`
  now retries once more when the delta reads as that placeholder (`waitPastUnresolvedTitle`), and records a
  new `afterUnresolved: true` field on the entry whenever `after` still reads as the placeholder once that
  retry has run, so a race the retry misses is marked as not-yet-readable rather than mistaken for a real
  announcement. Both changes move what a capture's evidence means, so no capture is dispatched at this code
  until the bump is on main and deployed; the confirming repeat-capture round is `orchestrator`'s, per
  product-manager's 2026-09-20 re-laning ruling on #1105.
  
  **`@a11ign/evidence`'s published `CaptureInteraction["formChanges"]` now declares `afterUnresolved?: boolean`**,
  the new field above -- present only when set, absent on every capture taken before this bump.
- 3a8ee20: **A form submit is now recognised by what it did, not only by what the button is called (#1918).** The worker named an activation `kind: "submit"` only when the button's announced name matched a submit word, so a real `<button type="submit">` named for its task ("Apply for a berth", "Renew the licence") was recorded as `taskButton`. Every check for 3.3.1 then treated it as not a submit. On the held-out acceptance set, that hid 3 of the 14 silent-validation-error pages in each repeat.
  
  Each button activation now carries `formChanges[].submitted`: `true` when it dispatched a form `submit` event, and `false` when a listener on the page saw none. The field is absent when that could not be measured, including on every capture made before `CAPTURE_PROTOCOL_VERSION` 21. The new `isSubmitActivation` (`@a11ign/evidence`) accepts `kind: "submit"` or a measured `submitted: true`. It is now what 3.3.1's applicability (`@a11ign/judge`), the 3.3.3 remedy rule, the navigation heuristic and the scorer's `validation_error_missing` feature (`@a11ign/scorer`) all read. A task button that submitted nothing, such as a filter, is still not a submit.
- c9d0609: **`walkToReveal` is exported and its page reads come through an `io` seam (#2121).** The 1.4.13 focus-reveal walk could only ever be exercised by a real fleet capture, and every capture this project has taken returned from tab stop 0 or stop 1 — so stops 2–7 of its `FOCUS_REVEAL_STOPS = 8` loop, including the bail-out when the focus read comes back empty and the break when the probe's deadline passes, had never executed anywhere. `walkToReveal({ interaction, deadline, io })` now takes its Tab press, structural census, focus read and clock from `io`, which defaults to the module bindings it has always used, so the fleet path is the same four calls in the same order. Callers that do not pass `io` see no change.
- 982b71a: **A worker held by a stray foreground dialog (`ShellExperienceHost`, a notification toast) now clears itself in the background instead of needing a console login or a reboot.** Before, the self-heal added by #1733 only ran at the start of a capture, and a held worker reports `not ready` -- so a capture, and the self-heal it carries, was never dispatched to it. Three real incidents (`a11y-worker-4`, `a11y-worker-10`, `a11y-worker-3`) each ended only in a manual console clear or a reboot.
  
  A slow background timer, off `/health`'s own request path, now retries the same bounded clear (`dismissForegroundBlocker`) whenever the last sample already shows a blocker cached, rate-limited so a worker genuinely held by something the clear cannot dismiss does not spin PowerShell forever (#1815).
