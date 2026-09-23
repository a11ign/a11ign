---
"@a11ign/nvda-worker": patch
"@a11ign/worker-fleet": patch
"@a11ign/evidence": patch
---

**The capture window is pinned to 1024x768, and the width it was pinned to is part of the capture cache
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
