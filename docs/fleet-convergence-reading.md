# Fleet convergence reading: one Windows build, one display mode, and the split-capture count (#4449, part (d) of #4405)

The live proof and, a month on, the follow-up reading of [`fleet-convergence-baseline.md`](./fleet-convergence-baseline.md).
Read 2026-10-10 by `orchestrator` from the driving host and the control plane, with the fleet awake and nothing
capturing. Boxes are named by inventory name or number; no address is written here.

## The answer today: NOT one build, and NOT one browser; the display mode converged

| the claim | before the window | after it |
|---|---|---|
| one display mode | **2** (1024x768 on workers 2-6 and 12-16, 640x480 on workers 7-11) | **1** (1024x768 on all 15) |
| one Windows image (`windowsVersion`) | **2** (10.0.22631 on 10 boxes, 10.0.26100 on 5) | **2**, unchanged |
| one Windows build (`windowsBuild`) | **not reported by any of 15** | **3** (`22631.6199` on 6 boxes, `22631.2861` on 4, `26100.9457` on 5) |
| one browser (`browserVersion`) | differed (the verdict named it; the values were not kept) | **2** (152.0.4191.66 on 12 boxes, 154.0.4258.62 on 3: workers 7, 8, 9) |
| one `provisionRevision` | 1 | **2** (see [the split I made](#the-provisionrevision-split-this-window-made)) |
| one `workerCode` / `captureProtocol` | 1 (`b016ce2d1a9cedf4`, protocol 22) | 1 (`25bb45d9b38d7a62`, protocol 24) |

`fleet:status` says it itself: `fleet INCONSISTENT across 15 of 15`, so a corpus run must not start.
**Done-when 1 is not met**, and the reasons are below.

## The apparatus findings

1. **The patch window installs nothing, on every box.** `fleet:patch --apply`, one box first and then all 15, printed
   `found 0, installed 0, failed 0, reboot not required` for each of the 15. That includes four boxes on `22631.2861`,
   a lower build than the `22631.6199` of six of their neighbours on the same image. So the window as written did not
   move a build, and "found 0" next to a lag on the same image is the reading to explain; I have not read why (the
   Windows Update source the guests use, and what the module's category filter selects, are the places to look). The play's last task read it back honestly and failed:
   `The fleet is on 3 Windows builds`.
2. **Two Windows images cannot be patched into one.** `22631` (23H2) and `26100` (24H2) are different feature releases; a
   quality-update window does not move a box between them. One build needs the five 24H2 boxes (workers 7-11) reimaged to
   23H2, or the ten others moved to 24H2, and that is not this row's to choose.
3. **The display mode did converge, and not by the patch.** The first provision read workers 7-11's display adapter as
   `CM_PROB_FAILED_POST_START` (Microsoft driver); by the first `/health` read after it, all five reported the Intel UHD 630 at
   1024x768. The deploy's reboot and the provision both ran before that read, and I did not separate them. My earlier
   prediction on #4449 that workers 7-11 would stay at 640x480 was wrong.
4. **`fleet:patch --limit=<one box>` exits 5 with `REACHED NO HOSTS` although the play ran** (`ok=12`, the build read back).
   The wrapper's heuristic misreads a limited run; the recap is the truth.
5. **Three boxes will not take the Edge rollback, and that stops the role for them.** Workers 7, 8, 9 and 11
   self-updated to Edge 154.0.4258.62, past the pin (`worker_edge_version` 152.0.4191.66), and the role refused the
   downgrade. With `--allow-edge-downgrade` worker 11 went to 152.0.4191.66. Workers 7, 8 and 9 did not: the
   cached MSI on each has the pinned SHA-256 (`5bcf8cd5…18df`, 259088384 bytes), Windows Installer logs
   `installed the product`, and yet `Application\` holds `152.0.4191.62` and `154.0.4258.62` and no `152.0.4191.66`, so
   the next task (`--rename-chrome-exe`) fails with `no installer at …\152.0.4191.66\Installer\setup.exe`. Worker 11 holds
   `152.0.4191.66` and `154.0.4258.62`. Why the same MSI lays down `.62` on three boxes is not read.
6. **Two provision runs minutes apart were played from different commits.** `fleet:provision` fast-forwards the control
   plane's checkout to `main` first, and it moved during the window (`135374713`, then `4bcf8996e`).

## The pasted readings

`fleet:status` before the window (15 of 15 serving, nothing capturing; addresses replaced by the inventory name):

| worker | windowsVersion | displayMode | displayAdapter | windowsBuild |
|---|---|---|---|---|
| 2, 3, 4, 6 | 10.0.22631 | 1024x768 | Intel UHD Graphics 630 | not reported |
| 5 | 10.0.22631 | 1024x768 | Intel HD Graphics 630 | not reported |
| 7, 8, 9, 10, 11 | 10.0.26100 | **640x480** | **Microsoft Basic Display Adapter** | not reported |
| 12-16 | 10.0.22631 | 1024x768 | Intel UHD Graphics 630 | not reported |

The same command after deploy, provision (x2), the 12-box provision and the patch window, as each box's `/health`
`environment` reports it (`workerCode` `25bb45d9b38d7a62`, protocol 24 on every row):

| worker | windowsVersion | windowsBuild | displayMode | adapter | browserVersion | provisionRevision |
|---|---|---|---|---|---|---|
| 2 | 10.0.22631 | 22631.6199 | 1024x768 | UHD 630 | 152.0.4191.66 | efbdc65856ce4991 |
| 3 | 10.0.22631 | 22631.6199 | 1024x768 | UHD 630 | 152.0.4191.66 | efbdc65856ce4991 |
| 4 | 10.0.22631 | 22631.6199 | 1024x768 | UHD 630 | 152.0.4191.66 | efbdc65856ce4991 |
| 5 | 10.0.22631 | 22631.6199 | 1024x768 | HD 630 | 152.0.4191.66 | efbdc65856ce4991 |
| 6 | 10.0.22631 | 22631.2861 | 1024x768 | UHD 630 | 152.0.4191.66 | efbdc65856ce4991 |
| 7 | 10.0.26100 | 26100.9457 | 1024x768 | UHD 630 | **154.0.4258.62** | 39f66503fb35f022 |
| 8 | 10.0.26100 | 26100.9457 | 1024x768 | UHD 630 | **154.0.4258.62** | 39f66503fb35f022 |
| 9 | 10.0.26100 | 26100.9457 | 1024x768 | UHD 630 | **154.0.4258.62** | 39f66503fb35f022 |
| 10 | 10.0.26100 | 26100.9457 | 1024x768 | UHD 630 | 152.0.4191.66 | efbdc65856ce4991 |
| 11 | 10.0.26100 | 26100.9457 | 1024x768 | UHD 630 | 152.0.4191.66 | efbdc65856ce4991 |
| 12 | 10.0.22631 | 22631.2861 | 1024x768 | UHD 630 | 152.0.4191.66 | efbdc65856ce4991 |
| 13 | 10.0.22631 | 22631.2861 | 1024x768 | UHD 630 | 152.0.4191.66 | efbdc65856ce4991 |
| 14 | 10.0.22631 | 22631.6199 | 1024x768 | UHD 630 | 152.0.4191.66 | efbdc65856ce4991 |
| 15 | 10.0.22631 | 22631.2861 | 1024x768 | UHD 630 | 152.0.4191.66 | efbdc65856ce4991 |
| 16 | 10.0.22631 | 22631.6199 | 1024x768 | UHD 630 | 152.0.4191.66 | efbdc65856ce4991 |

Source: `curl -s http://<worker>:8765/health | jq .environment` for each inventory host, 2026-10-10T04:30Z; `pnpm run
fleet:status` prints the same fields as the consistency verdict and, unlike this table, names only the differing ones.

### Done-when 3: the `a11y-display-mode-logon` task, read on every box

Read with a `win_powershell` task over the inventory (`Get-ScheduledTask` + `Get-ScheduledTaskInfo`), 2026-10-10:

| boxes | task | `LastTaskResult` |
|---|---|---|
| workers 2-6, 10-16 (12 boxes) | registered, `Ready` | `267011` (`SCHED_S_TASK_HAS_NOT_RUN`: it has not run yet; its trigger is a logon, and no box has logged on since it was registered) |
| workers 7, 8, 9 | **ABSENT** | none: the role stopped at the Edge step before `tasks.yml` on these three |

So the task is registered on 12 of 15 and **its read-back verdict is not yet available on any**: the first logon (a reboot)
produces it. This item stays open until that last result is read.

### Done-when 4: the quality-update deferral, read on every box

`HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate`: `DeferQualityUpdates` = 1 and
`DeferQualityUpdatesPeriodInDays` = 30 on **all 15** boxes after the window (the patch play lifts the deferral, installs,
and restores it in an `always:`, and read it back). **Done-when 4 is met.**

## The `provisionRevision` split this window made

`provisionRevision` is a MUST_MATCH cache key. After the first whole-fleet provision it read `39f66503fb35f022` on all 15.
The control plane's checkout then moved (finding 6), and the 12-box provision that completed the role (workers 2-6 and
10-16) stamped `efbdc65856ce4991`; I did not diff which hashed file changed between the two commits.
Workers 7, 8 and 9 stayed at the old stamp because their role run cannot get past the Edge step. **I chose to complete the
role on the 12 rather than leave them without the logon task and the later steps, and that left the fleet on two
stamps.** Re-provisioning the whole fleet together is what the tool says to do, and it needs workers 7, 8 and 9 past the
Edge rename first.

## Done-when status

| # | claim | state |
|---|---|---|
| 1 | one build and one display mode across the reachable boxes | **display mode: yes. build: no** (3 builds, 2 images; the window installs nothing) |
| 2 | the before/after pair from the baseline row's commands | **before: below. after: a month on** |
| 3 | the display-mode logon task registered on every reachable box, with its last result | **12 of 15 registered, none has run yet** |
| 4 | the deferral read back on every reachable box | **met, 15 of 15** |

## The split-capture count: the before number, taken today with the baseline's own command

The command named in [`fleet-convergence-baseline.md`](./fleet-convergence-baseline.md) (its "24 h counter rises" row),
run unchanged in `~/repos/a11y-witness` on 2026-10-10:

```
python3 -I -c "import json;d=json.load(open('runs/fleet-captures-state.json'));print({w[-2:]:len(v['rises']) for w,v in d['workers'].items()})"
```

Result: 11 of 15 boxes had a counter rise in the last 24 hours and **4 had none: workers 7, 8, 9 and 11**, the same four the
baseline recorded on 2026-10-09 and the four the #4405 report names. (The command's own limits stand: it cannot say *why*
a box had no rise, and the counter resets on a restart.) The baseline file's 90-day per-run count is **not recorded**, so
the pair that can be compared a month on is this one.

### A month on

Set `Not-before: 2026-11-10` on #4449. Repeat, unchanged: the command above, `pnpm run fleet:status`, and the per-box
`/health` read, and write the two sets of numbers beside the ones above.

| | 2026-10-10 | the month-later reading |
|---|---|---|
| boxes with no counter rise in 24 h | 4 (workers 7, 8, 9, 11) | _to be read_ |
| Windows builds seen | 3 | _to be read_ |
| display modes seen | 1 | _to be read_ |
| browser versions seen | 2 | _to be read_ |

## What was changed to take the reading

For the record, in the order it happened on 2026-10-10:

- `a11y-fleet-auto-off.timer` on the control plane stopped (it stays `enabled`) from 03:30Z and started again at about 04:25Z, so a
  five-minute-idle box was not powered off under a deploy or a provision.
- `fleet:wake` for all 15 boxes.
- `fleet:deploy` of nvda-worker v0.9.0 (`dc8f506c…`) and screenreader-fleet v0.7.2 (`cd53040b…`), worker 2 first and
  then the other 14, with **`--allow-protocol-change`: the fleet served protocol 22, main pins 24.**
- `fleet:provision --serial=0` for all 15 (stopped at the Edge step), then again with `--allow-edge-downgrade` (workers
  7, 8, 9 failed), then for the 12 that could finish.
- `fleet:patch --apply`: worker 2, then all 15.
- `pnpm run fleet:patch-schedule`: the `a11y-fleet-patch-window` timer is installed and enabled, next firing
  2026-10-11T02:00:00Z.
