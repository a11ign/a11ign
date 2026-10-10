RELEASE.md carries a current lab reading of `scorer:shortcuts` and of `check-signals`, each with its date and commit. Edit: `RELEASE.md` only.

**Both ran on the lab (`a11y-lab`) at `cb8864c7a5fb`** (`cb8864c7a5fb…` = `origin/main` at the merge of #4853; the job reports `runs at cb8864c7a5fb (pulled main)`), dispatched by `lab:job -e job=<job> -e row=4552` with `layer_refs` from `layerRefsFromLockfile` at that sha (`nvda-worker` `dc8f506c`, `screenreader-fleet` `c355b8ed`, both read back from the layers' own repositories by the play).

**Precondition read first.** The control host's checkout was at `cb8864c7a5fb` with `packages/control/.layer-ref` = `v0.3.7`, and its laid `ansible/lab-job.yml` has no `"--"` after `scorer:shortcuts` (the argv goes straight to `"--model", "runs/model-…"`). The 14:30Z attempt exited 2 on that `--`; this one did not.

**`scorer:shortcuts`** (job `shortcuts`, exit 0, 15:38:18Z–15:39:14Z), the lab's output:

```
74 unclosable veto pair(s) across 11 subtype(s) -> /opt/a11y/runs/unclosable-vetoes.json
28 CLOSABLE veto pairs across 23 heads (78 in total).
50 further veto pair(s) are UNCLOSABLE and excluded from the counts above
1 feature(s) are CONSTANT across all 3131 record(s): transcript_present = 1.0 everywhere
```

The same counts as the 2026-10-06 reading (#3130): the 2026-10-06 recapture changed neither.

**`check-signals`** (job `check-signals`, exit 0, 15:40Z), the lab's output:

```
1795 discriminating, 0 blind, 0 contaminated, 0 uncaptured, 0 stale, 0 provisional (not yet proven, not blocking)
PASS — all 1795 case(s) discriminate, and the corpus is complete.
```

**Is any of the 28 closable pairs on a head the scorer decides alone? YES, 9 of them.** `packages/lab/rule-ownership.json` says "Absence means the model decides it"; it lists 18 subtypes as `rules`, and `4.1.3:status-progress` and `4.1.3:status-waiting` are in none of its three lists. The report's closable column on the eight heads that have any:

| head | closable | decided by | worst closable (sum of logits) |
|---|---|---|---|
| `4.1.3:status-progress` | 4 | **the scorer** | `form_change_nonempty` (-3.48) |
| `4.1.3:status-waiting` | 5 | **the scorer** | `validation_error_missing` (-6.24) |
| `1.4.13:focus-panel-undismissable` | 8 | rules | `form_change_observed_absent` (-4.70) |
| `1.3.1:no-headings` | 4 | rules | `generic_heading_present` (-3.13) |
| `2.4.1:skip-link-inert` | 2 | rules | `validation_error_missing` (-2.25) |
| `2.4.2:route-title-stale` | 2 | rules | `validation_error_missing` (-2.93) |
| `3.3.3:error-remedy-missing` | 2 | rules | `status_update_announced` (-3.75) |
| `4.1.2:state-change-silent` | 1 | rules | `status_update_announced` (-1.17) |

4 + 5 + 8 + 4 + 2 + 2 + 2 + 1 = 28. A head the rule layer owns has a deterministic check beside it; these two have only the scorer, so a veto that taxes a real page carrying both features reaches a report with nothing to catch it. That is a finding, filed from #4552 and not explained away in RELEASE.md. It is not new in kind: #2385 and #2258 (both closed) found the same two heads training on six declarations each; this reading is that the vetoes are still there after the 2026-10-06 recapture. The individual features past the "worst" one are in the lab's `runs/scorer-shortcuts.json`, which this PR does not copy.

**What the edit changes** (`RELEASE.md`, three places): the `npm run scorer:shortcuts` table row (reading, date, commit, the 9 and the 19), the sentence under the table that quoted `check-signals` "0 stale on 2026-09-24", and the *Closed since* bullet for the 418 stale captures, which said "`check-signals` has not been read since that recapture".

**Not claimed:** that the 28 or the 74 are acceptable (nobody has said so; the table row says that); nothing was retrained, no `runs/` file was copied into the repository, and no fleet worker was touched (`fleet:deploy` refuses at layer 2 with 14 workers off the network; the control host had already been moved to `cb8864c7a5fb` at 15:30:53Z by something else, so it was not run here).

platform: nothing built; one documentation file.

Acceptance: `bash -c 'grep -qE "check-signals.*read on the[ ]lab 2026-1[0-2]-[0-9]{2}" RELEASE.md && grep -qE "scorer[:]shortcuts.*Read 2026-10-(0[7-9]|[1-3][0-9])" RELEASE.md'` exited 0 at this head, from `/home/agent/repos/wt-4552` (rc 1 at `origin/main`).

Closes #4552

Mutation: none -- this diff changes no test file and no guard; it edits prose.
