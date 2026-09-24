# What one capture costs, on the fleet and on the Action

Measured 2026-09-24 for #2271, so the multi-page cap in #2262 (ruling b) has a basis that is a reading and not
a guess. **Every figure below is a reading at a moment**: re-derive it before quoting it, and do not quote a
figure whose run you cannot name. Where a number was CHOSEN rather than measured, the line says so.

```
Protocol: 21 (CAPTURE_PROTOCOL_VERSION; /health captureProtocol on all 10 workers, read 2026-09-24T08:22Z)
Fleet revision: ce5ba647396883b4 -- the worker source at 50d52e750 (bca587d93 hashes identically), provisionRevision b34a5c2eaf541d01, NVDA 2026.1.1, Edge 152.0.4191.66, 10 of 10 ready and CONSISTENT
Runner: windows-2022 (GitHub-hosted, standard 2-core, Windows Server 2022 Datacenter 10.0.20348, 16,379 MB as /health reports it), a11ign/a11ign (public), repository head a9eed193e / 1be331395 / 0e48528ef -- none of them changes action.yml, the worker or the CLI
```

Those three lines are what was measured. The greps in the row's Acceptance find them; they do not say the
numbers are right, which is why every figure names its run.

## Fleet

**What one capture occupies a worker for, at the protocol the workers serve now.** The figure is the last
`diagnostics[].atMs` of the capture's own record (what `npm run fleet:hours` sums), in seconds. The CLI's
wall-clock, which is what a person waits for, is 4-5 s longer (the CLI's own start and the judging call).

Two commands, both with `--no-axe` (axe is the client's layer, not a worker cost) and both with the page's
own task string from #311: **A** adds `--probe-forms`, the Action's default; **B** is #311's bare command.
Each capture went to one worker at a time, ten workers in parallel, jobs interleaved across pages.

| page and shape | command | n | median | min | max | CLI wall, median |
|---|---|---|---|---|---|---|
| `https://www.hubspot.com/` image-heavy marketing | B | 3 | 307.5 | 302.9 | 308.1 | 311.5 |
| same | A | 5 | 311.9 | 304.5 | 315.7 | 316.5 |
| `https://calendly.com/` client-rendered SPA | B | 3 | 424.7 | 424.2 | 425.4 | 429.5 |
| same | A | 5 | **138.4** | 131.3 | 145.6 | 143.1 |
| `https://www.ikea.com/de/de/` heavy DOM | B | 3 | 453.8 | 452.1 | 455.7 | 458.9 |
| same | A | 5 | 456.6 | 454.9 | 459.8 | 461.3 |
| `https://example.com/` (floor) | A | 3 | 104.6 | 104.0 | 110.2 | 109.7 |
| W3C `bad/after/survey.html` | A | 3 | 336.7 | 331.7 | 340.4 | 340.4 |
| W3C `bad/before/home.html` | A | 3 | 188.1 | 186.5 | 188.8 | 192.3 |

**Reading it.**

- **Within a cell the spread is small: max is within 4% of min for hubspot, ikea and the two W3C pages** (1.1% to 3.7%); the two cells whose runs left the site are wider (example.com 6%, calendly A 11%). n of 3 to 5 is a spread of runs on **ten different boxes**, on one day, at one build. It is not a spread across days, builds or hours; those were not measured.
- **Between pages it is 4.4 times: 105 s to 460 s.** The page decides the cost, and a page's size does not predict it (hubspot, an image-heavy page with 46-54 announcements, took 303-316 s; calendly bare, 148 announcements, took 425 s).
- **A capture that leaves the site is short, and that is not a cheaper page.** With `--probe-forms` every calendly run (5 of 5) pressed "Continue with Google, button" during the sweep and left the site at 131-146 s, so 14 of the record's 18 `observed` probes read `asked: false`; every example.com run (3 of 3) left through its "Learn more" link at 104-110 s (the route-change probe; 4 of 16 unasked). The same calendly page under B took 425 s and left 6 of 18 unasked; hubspot left 4. **The cap cannot be in seconds per URL, because the same URL costs 138 s or 425 s according to a button.** Plan on the full figure.
- **Against #311's three (hubspot 296 s, calendly 300 s, ikea 477 s; CLI wall-clock, n=1, protocol 18 or earlier, 2026-09-09):** B now reads hubspot 311.5 s (+5%), calendly 429.5 s (+43%), ikea 458.9 s (-4%). Calendly moved and nothing here says why; a p20 capture of the same three on 2026-09-22 (`runs/witness/2026-09-22T09-37-27-415Z-www-hubspot-com.json` and the two after it, workerCode `64b751f8b7f590eb`, n=1 each) read 310.3, 425.4 and 458.6 s, so the change predates protocol 21 (n=1 each, and the record does not store the flags it was run with).
- **The fleet is parallel and the cost is worker time:** 33 captures occupied 9,970 s = 166 worker-minutes; the first 27 finished in 17.9 minutes of wall-clock across 10 workers.
- **Exit code 1 on every CLI row is the LOCAL SCORER failing, not a capture failing:** this host has no `numpy` (`No module named 'numpy'`), so judging exited 1 after the capture record had been written. All 33 records exist. The judging time is therefore not in the fleet columns; the Action section has it (4-5 s).

## Action

**Five runs of `action-smoke.yml`, dispatched by hand on `main`:** two captures in one `windows-2022` job
(`uses: ./` twice, W3C `survey.html` then `home.html`, `judge-backend: local`, axe on, probe-forms on: the
Action's defaults). One job per run. Timings are the run's own log timestamps (`gh run view <id> --log`) and
the job's `started_at`/`completed_at` from the jobs API. GitHub's jobs API lists a composite action's steps
as ONE step, so the decomposition below is read from the `##[group]` boundaries in the log.

| run | head | caches | job wall | outcome |
|---|---|---|---|---|
| [35974978472](https://github.com/a11ign/a11ign/actions/runs/35974978472) | a9eed193e | none existed | 321 s | **failed before any capture** |
| [35975577476](https://github.com/a11ign/a11ign/actions/runs/35975577476) | 1be331395 | cold (not found) | 701 s | success |
| [35975580437](https://github.com/a11ign/a11ign/actions/runs/35975580437) | 1be331395 | cold (not found) | 680 s | success |
| [35976874484](https://github.com/a11ign/a11ign/actions/runs/35976874484) | 0e48528ef | warm (restored) | 668 s | success |
| [35976877072](https://github.com/a11ign/a11ign/actions/runs/35976877072) | 0e48528ef | warm (restored) | 658 s | success |

**One of five runs failed and it was the runner, not the page.** Run 35974978472's worker never became ready
in 3 minutes: `/health` read `noBlockingDialog: false`, a "System Properties" dialog reporting that Windows had
created a temporary paging file, sitting on the desktop. No report, no artifact, and the job was still billed
(321 s, 6 minutes). n of 1 failure is not a rate; it is the failure the `timeout-minutes` note in
[`github-action.md`](./github-action.md) is about, seen once.

**Decomposed, seconds, the four successful runs** (cold / cold / warm / warm):

| piece | when it is paid | 35975577476 | 35975580437 | 35976874484 | 35976877072 |
|---|---|---|---|---|---|
| job start and checkout | once per job | 9.8 | 8.2 | 7.3 | 6.9 |
| setup (npm ci, guidepup, pip, Edge policy, lock timeout), first `uses:` | once per job | 98.4 | 92.8 | 81.3 | 77.5 |
| setup, second `uses:` | **every further `uses:`** | 15.7 | 20.4 | 27.3 | 24.8 |
| worker start until `ready`, first / second | per `uses:` | 14.1 / 2.3 | 10.4 / 3.0 | 9.0 / 2.9 | 8.9 / 2.9 |
| capture, survey.html (first) | per capture | 371.1 | 339.7 | 341.1 | 339.9 |
| capture, home.html (second) | per capture | 170.8 | 177.6 | 180.3 | 179.8 |
| local judging, per capture | per capture | 3.9 / 2.7 | 4.6 / 4.1 | 4.6 / 3.9 | 4.7 / 4.0 |
| report and assertions, per capture | per capture | 1.3 / 1.3 | 1.7 / 1.6 | 1.8 / 1.7 | 1.7 / 1.7 |
| tail (post steps, cache save, cleanup) | once per job | 6.7 | 12.5 | 3.4 | 3.3 |
| **job wall (jobs API)** | | **701** | **680** | **668** | **658** |

**Reading it.**

- **The capture is 76-79% of the job; setup is 15-17% of it, of which the once-per-job first setup is 12-14%.** The setup is paid in full only by the first `uses:`. The second re-runs every setup step and finds it done (15.7-27.3 s), because `action.yml` is a composite action with no memory between uses. So **a URL list built as N `uses:` steps costs about 25 s of setup plus the capture for every page after the first, not another 80-100 s**, and the cap is in captures, not in setup. That is the input the count-first line needs: minutes are about `1.5 + N x (capture + 35 s) / 60`.
- **The cache saves 12-21 s, not minutes:** first-use setup 92.8 and 98.4 s cold against 77.5 and 81.3 s warm (n=2 each). The NVDA cache is 197 MB and the pip cache 46 MB. Do not put a cache in the cost.
- **The runner's capture time matches the fleet's within 10% on the same page:** survey.html 340-371 s on the runner against 331.7-340.4 s on the fleet; home.html 170.8-180.3 s against 186.5-188.8 s. So a fleet figure per page transfers to the Action, and the other way round. (Different machines: the runner is a Hyper-V guest on Windows Server 2022, the fleet is Windows 11 on bare metal.)
- **A fitted model, and how good it is:** `job seconds = 120 + N x (capture + 7) + (N - 1) x 28`, fitted on these four runs at N = 2, reads +0.4%, -0.1%, +2.3%, +3.6% against the four measured walls. **N = 2 is all it was fitted on**; the rest of this page's use of it at N = 5, 25 and 50 is an extrapolation and says so.

**What GitHub bills (fetched 2026-09-24 from GitHub's own pages, not from memory):**

- [About billing for GitHub Actions](https://docs.github.com/en/billing/managing-billing-for-your-products/managing-billing-for-github-actions/about-billing-for-github-actions): "GitHub Actions usage is free for self-hosted runners and for public repositories that use standard GitHub-hosted runners." So THIS project pays nothing for these runs; **the person who adds the Action to a private repository pays**.
- [Actions runner pricing](https://docs.github.com/en/billing/reference/actions-runner-pricing): Windows 2-core (x64) **$0.010** per minute, Linux 2-core (x64) $0.006, macOS 3 or 4-core $0.062. "GitHub rounds the minutes and partial minutes each job uses up to the nearest whole minute."
- **There is no minute multiplier on either page, so this page does not state one.** The only sentence about the difference is "jobs that run on Windows and macOS runners hosted by GitHub cost more to run than jobs on Linux runners", and it is expressed as a price. Included minutes per plan (Free 2,000, Pro and Team 3,000, Enterprise Cloud 50,000) are stated without saying whether a Windows minute draws them down faster; **whether it does was not found and is not assumed.** (The ratio $0.010 / $0.006 is 1.67, and that is arithmetic on two prices, not GitHub's stated multiplier.) Neither page carries a date.
- So a two-capture job of 11-12 minutes bills 11 to 12 whole minutes: 701, 680 and 668 s bill 12, and 658 s bills 11, **$0.11-$0.12 on a private repository**, and the failed run billed 6.

## Cap basis

**The cap is a runner-minute number on the Action and a capture count on the fleet, and this section states both; the row that builds the cap reads its figures here.** A number in this section is MEASURED unless it carries CHOSEN.

Inputs, each with where it came from:

| input | value | from |
|---|---|---|
| worst single capture observed | **460 s** (459.8, ikea, command A) | Fleet table, max |
| a typical capture | **340 s** | CHOSEN: between hubspot 312 / W3C survey 337 and ikea 457; not a median of anything |
| one-off cost of a job | **120 s** | Action table: start 7-10 + first setup 77-98 + ready 9-14 + tail 3-13, rounded to what the fit needs |
| each further page in the same job | **28 s + 7 s** | Action table: second setup 16-27 + ready 2-3, and judging + report about 7 |

Extrapolated with the fitted model (N = 5, 25 and 50 are extrapolations, the fit is N = 2):

| N captures | worker time on the fleet, one box | Action job, typical 340 s | Action job, worst 460 s | private-repo price at $0.010, worst |
|---|---|---|---|---|
| 1 | 7.7 min at worst | 8 min | 10 min | $0.10 |
| **5** | 28-38 min | 33 min | **43 min** | $0.43 |
| 10 | 57-77 min | 65 min | 85 min | $0.85 |
| **25** | 142-192 min | 158 min | **208 min** | $2.08 |
| 50 | 283-383 min | 315 min | 415 min | $4.15 |

**Default cap: 5 captures, and 45 runner-minutes.** The 5 is `ceo`'s lower bound and Lighthouse CI's documented default (CHOSEN, not derived); what the measurement adds is that 5 pages is already **43 runner-minutes at the worst page observed**, so 45 minutes is the figure that lets a default run of five of the heaviest page finish, and it is CHOSEN as that round-up. On the fleet it is 38 minutes of one box's time at the worst page, or about 8 minutes across five boxes.

**Ceiling: 25 captures, and 210 runner-minutes.** CHOSEN as 25 rather than 50 for a reason the measurement supplies: 25 pages at the worst observed is 208 minutes, **10.4% of a Free plan's 2,000 included minutes in one run** (if a Windows minute draws them one for one, which the billing pages do not say), and 50 would be 20.7% of it. On the fleet 25 is 192 minutes of one box, or 19 minutes across ten, which is the scarce-resource side of the same figure.

**Two things the cap has to know that a count of URLs does not:**

1. **`timeout-minutes: 20` in the documented workflow ([`github-action.md`](./github-action.md)) fits two captures and no more:** at 340 s the model gives 20.3 minutes for three; at 460 s, 26.3. A URL list with the documented timeout fails its third page, and the failure leaves no log and no artifact (the note in that file). Any count-first line has to print the timeout the run needs (`ceil(1.5 + 8.25 x N)` at worst) beside the count.
2. **A capture that leaves the site is cheap, so the count-first estimate is an upper bound and says so.** 138 s and 425 s are both the same calendly URL; an estimate built from the typical figure overstates a run whose probes navigate away and understates none of the pages measured.

## What this does not show

- **One day, one build, one runner image, ten fleet boxes.** Not variance over days, builds, hours or Edge versions.
- **The Action ran W3C's two pages** because that is what `action-smoke.yml` runs. The three #311 pages were not run on a runner, so the runner-against-fleet match above is for two pages, not five.
- **No Action run captured more than two pages,** so N = 5 and beyond are the model, not a reading. A five-page run is the check that would replace the extrapolation.
- **The fleet figures leave out axe and the judge; the Action figures include both.** That they agree within 10% says the two are small against the capture, not that they are zero (judging alone is 3-5 s per capture).
- **No provisioning, reboot, recovery or idle time on the fleet,** as `fleet:hours` states about itself.
- **The failed run is one of five,** so 20% is a count and not a rate.
- **Runs 35975577476 and 35975580437 started within two seconds of each other, as did 35976874484 and 35976877072,** on separate runners; no interaction is expected and none was measured.

## Every capture, so the next reader can replay it

Records are under `runs/capture-cost-2271/<command>-<page>-<n>/witness/` on the agents host (gitignored, so a
path is not a link); the driver's `runs/capture-cost-2271/_batch/jobs.jsonl` and `_batch-w3/jobs.jsonl` name
each capture's box, start and CLI wall-clock. `occupancy` is the record's last `diagnostics[].atMs`. Both
batches ran on 2026-09-24 between 08:27Z and 09:02Z, all 33 at `captureProtocol` 21 and workerCode `ce5ba647396883b4`.

| capture | box | started (UTC) | occupancy s | CLI wall s | announcements | note |
|---|---|---|---|---|---|---|
| A-calendly-1 | .59 | 08:27:00 | 138.4 | 143.1 | 148 | left the site at 138 s |
| A-calendly-2 | .80 | 08:27:00 | 145.6 | 150.0 | 148 | left the site at 146 s |
| A-calendly-3 | .107 | 08:32:11 | 140.8 | 144.4 | 148 | left the site at 141 s |
| A-calendly-4 | .175 | 08:34:45 | 131.3 | 135.3 | 148 | left the site at 131 s |
| A-calendly-5 | .175 | 08:37:00 | 131.9 | 134.9 | 148 | left the site at 132 s |
| A-example-1 | .224 | 08:27:00 | 110.2 | 115.4 | 4 | left the site at 110 s |
| A-example-2 | .224 | 08:28:56 | 104.6 | 109.7 | 4 | left the site at 105 s |
| A-example-3 | .21 | 08:34:10 | 104.0 | 108.4 | 4 | left the site at 104 s |
| A-hubspot-1 | .107 | 08:27:00 | 306.0 | 310.8 | 54 |  |
| A-hubspot-2 | .217 | 08:27:00 | 311.9 | 316.5 | 52 |  |
| A-hubspot-3 | .90 | 08:32:07 | 304.5 | 308.3 | 54 |  |
| A-hubspot-4 | .74 | 08:34:44 | 315.7 | 320.7 | 51 |  |
| A-hubspot-5 | .80 | 08:36:40 | 312.8 | 316.5 | 46 |  |
| A-ikea-1 | .175 | 08:27:00 | 459.8 | 464.9 | 136 |  |
| A-ikea-2 | .74 | 08:27:00 | 458.8 | 464.0 | 136 |  |
| A-ikea-3 | .217 | 08:32:17 | 455.5 | 460.9 | 136 |  |
| A-ikea-4 | .21 | 08:35:58 | 456.6 | 461.3 | 136 |  |
| A-ikea-5 | .90 | 08:37:16 | 454.9 | 459.7 | 136 |  |
| A-w3home-1 | .59 | 08:56:05 | 188.1 | 192.3 | 85 |  |
| A-w3home-2 | .224 | 08:56:05 | 186.5 | 190.9 | 85 |  |
| A-w3home-3 | .21 | 08:56:05 | 188.8 | 193.3 | 85 |  |
| A-w3survey-1 | .107 | 08:56:05 | 340.4 | 344.7 | 89 |  |
| A-w3survey-2 | .175 | 08:56:05 | 331.7 | 336.0 | 89 |  |
| A-w3survey-3 | .90 | 08:56:05 | 336.7 | 340.4 | 89 |  |
| B-calendly-1 | .21 | 08:27:00 | 425.4 | 429.5 | 148 |  |
| B-calendly-2 | .80 | 08:29:30 | 424.7 | 429.7 | 148 |  |
| B-calendly-3 | .107 | 08:34:36 | 424.2 | 427.7 | 148 |  |
| B-hubspot-1 | .90 | 08:27:00 | 302.9 | 306.9 | 52 |  |
| B-hubspot-2 | .59 | 08:29:23 | 307.5 | 311.5 | 51 |  |
| B-hubspot-3 | .59 | 08:34:35 | 308.1 | 312.5 | 52 |  |
| B-ikea-1 | .146 | 08:27:00 | 455.7 | 460.6 | 136 |  |
| B-ikea-2 | .224 | 08:30:45 | 453.8 | 458.9 | 136 |  |
| B-ikea-3 | .146 | 08:34:41 | 452.1 | 457.5 | 136 |  |

Replay one: `npm run witness -- <url> --task "<task>" --worker http://<box>:8765 --json --no-axe [--probe-forms]`
from a checkout that can reach the fleet (`eval "$(npm run --silent fleet:env)"`); the Action rows replay with
`gh workflow run action-smoke.yml --ref main` and `gh run view <id> --log`, whose `##[group]` lines carry the
timestamps the decomposition reads.
