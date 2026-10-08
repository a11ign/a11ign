# Mechanism 3 spike: attaching to a browser a person already signed into (#4087)

Verdict: attach conflicts: this repository's driver reads a signed-in page through a person's debugging endpoint (measured), but the worker cannot be pointed at that browser, because it owns port 9222, drives whatever answers there with `Page.navigate` (which discards a session held in page memory), and quits or `taskkill`s every browser of its image.

Read at a11ign `a896fb89e`; the worker at `screenreader-worker@291ed35` (its `main`, read through `git show`, never checked out or changed). Part of #4084, outcome 1. ADR 0038 calls this "a spike row first, before any build" (`docs/adr/0038-authenticated-capture.md:186`), and this is that spike. The experiment is `packages/cli/src/auth/attach-spike.mjs`; `packages/cli/src/auth/attach-spike.test.ts` checks the SHAPE of this document and nothing about a browser.

## What was and was not measured

| | |
|---|---|
| **Measured, on this host** | Linux, `Google Chrome for Testing 149.0.7827.55` (Playwright's `chromium-1228`, headless-new), driven by `playwright 1.63.0` and this repository's own `openPlaywrightDriver` (`packages/cli/src/auth/playwright-driver.ts:55`). It would not start until six, then three more, shared libraries were supplied: `apt-get download`, `dpkg-deb -x` into `~/.cache/a11y-spike-libs/root`, `LD_LIBRARY_PATH` (the no-root recipe, no `sudo`). |
| **Read, not run** | Every claim about the worker. The resource ban forbids `worker:*`, and the worker is a Windows service driving Edge and NVDA, which this host is not. Chrome and Edge share Chromium's debugging endpoint, so the endpoint behaviour carries over; the worker's own behaviour is read from its source and is **inferred**, not observed. |
| **A stand-in** | "Signed in by a person" is a mouse click (`Input.dispatchMouseEvent`) sent over a raw CDP socket by a process that is not the one that later attaches. The fixture page keeps the session in a JavaScript variable, the way the outside evaluator's SDK does: no cookie, no storage. It is not a human at a keyboard, an identity provider or MFA. |

## Question 1: can this repository's driver read the signed-in page through the person's endpoint?

Yes. The attached page's heading is read as `Welcome back, Dana`; a fresh context of the same browser and a separately launched Playwright browser, both at the same URL, read `Sign in`. The session exists ONLY in the person's page. The last line is a finding for question 2: the driver's own `navigate(url)` on the attached page took the signed-in page back to `Sign in`.

```
$ LD_LIBRARY_PATH=$HOME/.cache/a11y-spike-libs/root/usr/lib/x86_64-linux-gnu node --import tsx packages/cli/src/auth/attach-spike.mjs q1
person's browser: Chrome/149.0.7827.55   endpoint: http://127.0.0.1:43813   page: http://127.0.0.1:40701/
attached through the endpoint; pages found in the person's own context: 1
attached page, heading read by playwright-driver.ts (axNodes):  ["Welcome back, Dana"]
FALSIFIER, fresh context of the same browser at the same URL:    ["Sign in"]
FALSIFIER, a separately launched Playwright browser, same URL:   ["Sign in"]
after the driver's navigate(url) on the attached page:           ["Sign in"]
```

## Question 2: does anything in the worker's launch, profile or cleanup path kill, reuse or refuse that browser?

Yes, at five sites, all in `screenreader-worker@291ed35`. Each is a line of the source pasted below.

```
$ git show 291ed35:src/browser-session.mjs | grep -n -E 'CDP_PORT = |remote-debugging-port|async function browserAlive|json/version|Page.navigate|async function launchReusable|if \(await browserAlive\(\)\)' | cut -c1-150
47:export const CDP_PORT = 9222;
79:  return [...baseArgs, `--remote-debugging-port=${CDP_PORT}`];
83:export async function browserAlive() {
85:    const response = await fetch(endpoint("/json/version"), { signal: AbortSignal.timeout(2_000) });
445:    socket.send(JSON.stringify({ id: 2, method: "Page.navigate", params: { url } }));
1894:export async function launchReusable({ exe, args, onEvent = () => {} }) {
1900:    if (await browserAlive()) {
```

```
$ git show 291ed35:src/capture-setup.mjs | grep -n -E 'reusableBrowser && await browserAlive|launchReusable\(|navigateExisting\(url\)|windowsQuit\(app.image\)|spawn\("cmd", \["/c", "taskkill"' | cut -c1-150
362:  if (reusableBrowser && await browserAlive()) {
364:      await navigateExisting(url);
384:    reusableBrowser = await launchReusable({
1618:    await withTimeout(windowsQuit(app.image), BROWSER_QUIT_TIMEOUT_MS, "windowsQuit");
1623:    spawn("cmd", ["/c", "taskkill", "/im", app.image, "/f"], { stdio: "ignore" });
```

```
$ git show 291ed35:src/browser-profile.mjs | grep -n -E 'execFileSync\("taskkill"' | cut -c1-150
245:    execFileSync("taskkill", ["/im", image, "/f"], { stdio: "ignore", timeout: 30_000 });
$ git show 291ed35:src/server.mjs | grep -n -E 'killStrayBrowsers\(\{' | cut -c1-150
169:    killStrayBrowsers({ count: strays, image: BROWSER.image }, log);
```

What each site does to a person's browser, inferred from the lines above:

| Site | What it would do |
|---|---|
| `screenreader-worker@291ed35 src/browser-session.mjs:47` and `src/browser-session.mjs:79` | The worker's debugging port is the fixed `9222`, and it is passed on every launch. A person's `--remote-debugging-port=9222` is the SAME port, so the two collide; any other port is a port the worker never looks at. |
| `screenreader-worker@291ed35 src/browser-session.mjs:1894` and `src/browser-session.mjs:1900` | `launchReusable` spawns its own Edge and declares it ready the moment ANYTHING answers `/json/version` on 9222. With the person's browser holding the port, it is ready at once and the worker believes it owns a browser it did not start. The experiment below reproduces the port half on Chromium. |
| `screenreader-worker@291ed35 src/browser-session.mjs:445` | A capture drives the page with `Page.navigate`. On the person's tab that discards a session kept in page memory: the last line of question 1 is the same call through this repository's driver. |
| `screenreader-worker@291ed35 src/capture-setup.mjs:1618` and `src/capture-setup.mjs:1623` | Closing a capture asks every browser of the configured image to quit, then `taskkill /im <image> /f`. It names an IMAGE, not a process id, so the person's Edge goes with the worker's. |
| `screenreader-worker@291ed35 src/browser-profile.mjs:245` and `src/server.mjs:169` | At worker boot, any browser of that image counted by `processCounts` is `taskkill`ed as an orphan. The person's signed-in browser is indistinguishable from one. |

The port collision, run on Chromium: a second browser with its own profile launched with the same port (what `launchReusable` spawns) logs that it could not bind, keeps running, and every request to the port is still answered by the FIRST browser.

```
$ LD_LIBRARY_PATH=$HOME/.cache/a11y-spike-libs/root/usr/lib/x86_64-linux-gnu node --import tsx packages/cli/src/auth/attach-spike.mjs q2
person's browser (profile A) holds port 34407: ws://127.0.0.1:34407/devtools/browser/478cd6fb-b027-4b8d-ad2d-8e64b6b7ecff
a second browser, profile B, launched with the SAME --remote-debugging-port=34407 (what launchReusable spawns):
  second browser still running: true
  second browser's stderr about the port: [1580569:1580681:1008/100301.665416:ERROR:net/socket/socket_posix.cc:175] bind() failed: Address already in use (98)
  endpoint after the second launch: ws://127.0.0.1:34407/devtools/browser/478cd6fb-b027-4b8d-ad2d-8e64b6b7ecff
  endpoint answered by profile A's browser, not B's: true
```

**Not measured, and it matters:** the worker's real measurement is NVDA reading the browser window on the Windows desktop; the DevTools port supplies the census and the navigation. Whether NVDA could read a window the worker did not open is a question about Windows, NVDA and focus that this Linux host cannot answer. This spike does not claim the worker could capture the person's page even with the four sites above removed.

## Question 3: can the worker reach a debugging endpoint on the person's loopback?

Only on the same host, or through a relay the person sets up. The endpoint listens on `127.0.0.1` alone and refuses its own host's LAN address. A plain TCP relay makes it reachable, and the endpoint then accepts a `Host` header that is an IP address or `localhost` and rejects a name. (The script masks the last two octets of this host's LAN address: a committed transcript with a real internal address is a leak.)

```
$ LD_LIBRARY_PATH=$HOME/.cache/a11y-spike-libs/root/usr/lib/x86_64-linux-gnu node --import tsx packages/cli/src/auth/attach-spike.mjs q3
this host's non-loopback IPv4: 192.168.x.x
listening sockets for the debugging port:
LISTEN 0      10                       127.0.0.1:46789      0.0.0.0:*
from this host, via its own LAN address 192.168.x.x:46789  -> error ECONNREFUSED
a plain TCP relay 0.0.0.0:43659 -> 127.0.0.1:46789 (what an SSH -R or a port proxy amounts to):
  Host: 192.168.x.x:43659            -> HTTP 200 { "Browser": "Chrome/149.0.7827.55", "Protocol-Version": "1.3", 
  Host: person-laptop.example   -> HTTP 500 Host header is specified and is not an IP address or localhost.
  Host: localhost:43659        -> HTTP 200 { "Browser": "Chrome/149.0.7827.55", "Protocol-Version": "1.3", 
```

So the host a capture runs on decides it. **The CLI (this repository, a person's own machine): yes**, loopback is loopback, and question 1 is the proof. **The worker on a fleet box: no, not by default.** The person's browser is on a different machine and the endpoint will not leave its loopback. A relay can carry it, at the price of exposing a port that controls the whole browser, signed-in session included, to everything that can reach the relay. That is a security decision for `ceo`, not a spike result, and ADR 0038 already scopes mechanism 3 to "CLI-only, loopback-only" (`docs/adr/0038-authenticated-capture.md:186`).

## The smallest change, and what row 3 can and cannot do

**There is no single smallest change.** Removing the conflict needs an "attached" mode in the worker that does four things at once: never spawns (`browser-session.mjs:1894`), never quits or kills (`capture-setup.mjs:1618`, `:1623`, `browser-profile.mjs:245`, `server.mjs:169`), never navigates (`browser-session.mjs:445`), and takes its port from the caller rather than `9222` (`browser-session.mjs:47`). Any three of the four still lose the session or the browser. That is a build row in `screenreader-worker`, and on question 3's ground the worker only gets there on the person's own machine. An experimental branch was not made; no change to the worker is proposed here.

The CLI path, by contrast, needs no worker change: its flag, `--auth-attach`, is still absent (`packages/cli/src/fault-remediation.ts:85` advises it and nothing parses it), and the driver already does the reading.

**Row 3, the declared-IdP-origin allowance** (let a login flow cross to a named identity-provider origin and back), against this:

| | Row 3 | Attach |
|---|---|---|
| Unattended, CI, fleet | **Can** | **Cannot** (a person must be present and on the same host) |
| MFA, passkeys, captcha, bot checks at the IdP | **Cannot** (a scripted flow has no second factor) | **Can** (a person does it) |
| Credentials | held by the flow, in env | never leave the person's browser |
| Evaluator's case (Auth0 Universal Login, tokens in page memory) | **Can**, if the IdP form is scriptable with a test account | **Can**, for the person's own session |

The next row is therefore row 3, as the issue says, not a retry of this.
