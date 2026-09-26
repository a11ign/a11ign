# ADR 0040: `agent-org` is a standalone, project-agnostic tool, and a11ign is the first project it is configured for

## Status

**Proposed, 2026-09-26.** Row #2615, child 2 of #69. It moves no code and files no row: the appendix holds, for each of
the eight children already filed (#2616 to #2623), the Region, Acceptance and Done-when **confirmed or amended against
the decisions below**, plus two rows the decisions found were missing and the nine MOVE rows (one per target repository and one per npm rename, each naming its chairman step or saying it has none), so `product-manager` promotes from the appendix and
nobody re-derives them.

**Decided by the chairman and `ceo`, RECORDED here and not reopened** (#69, 2026-09-26): `agent-org` leaves
`a11ign/a11ign` for a PUBLIC repository in the a11ign org, generically named, with nothing a11ign-branded inside
(#69, 06:58Z); **the licence is `Apache-2.0` at creation** and the first push carries `LICENSE` and the matching
`license` field (#69, 07:20Z); **the merge-path question is closed**, because a public repository gets the ruleset,
protection, required review and merge queue on the free plan exactly as `a11ign/a11ign` does (#69, 07:20Z); **no
`agent-org-sandbox` repository is created**, and a fixture project inside `agent-org`'s own tests proves the boundary
(#69, 07:20Z); the leak scan and the LAN-IP refusal apply from the FIRST commit of every public repository (#69, 07:20Z);
a11ign's product rows stay on `a11ign/a11ign` while `agent-org`'s own development rows live in ITS repository, so the
machinery reads MORE THAN ONE board (#69, 06:58Z; the earlier "one tracker" ruling is withdrawn). Also recorded: **the WHOLE split is version one** (#2615, `ceo`, 08:45Z, on the chairman's ruling), and, from
#69 at 07:53Z and 08:01Z: `pdf` stays and goes to its own repository, now `a11ign/documents`; `cli`, `judge`, `scorer`
and `evidence` stay together in `a11ign/a11ign` for now; the three asks (a), (b) and (c) below are the chairman's.

**Two questions on #69 are still OPEN with the chairman, and this ADR says nothing about them beyond that: it builds on
neither answer.**

**Measured at commit `46b59abf0`** (`origin/main` when the readings were taken, 2026-09-26). Each reading below is a
command with its real output beneath it. Three things a reader must know before trusting one:

- **A reading is a moment.** Re-run it at that commit (`git worktree add ../adr-0040-read 46b59abf0`). Every whole-tree
  `git grep` here excludes this document, whose own text would otherwise be counted; four readings need a small script,
  printed under "The reading scripts" at the end, saved under the name the command uses and run from the repository
  root. The readings that begin `gh api`, `ls ~/.cache/a11ign` or `cut … wake-ledger` are **live state** of GitHub and of
  the agent host, taken 09:13Z on 2026-09-26 by `a11ign-ai-workers`, and are marked *live*; a later reader gets a
  different answer and that is not a defect.
- **Measured and inferred are different claims and are labelled.** *Measured* means the command above produced it;
  *inferred* is reading code without running it; *external knowledge* is GitHub behaviour recalled, not exercised, and is
  never load-bearing without a step that verifies it. A count of files by a pattern is a count of files that MATCH the
  pattern, and the row that acts on it classifies each site.
- **What this ADR cannot prove is said where it arises** (decision 8 says what the fixture project cannot).

## What this changes in ADR 0039

ADR 0039 (#2614) was written under the ruling that `agent-org` and the rows both STAY in `a11ign/a11ign`, and this ADR
withdraws the paragraph that says so: 0039's Status paragraph ("one tracker, one board, one merge-queue policy") and its
Decision 1, which says `TRACKER_REPO` "never becomes a list", are replaced by **decisions 1 and 2 below: a project declares
a LIST of trackers and a LIST of code repositories, and a name is qualified by a declared key, the empty key belonging to
the host's primary project**. That is a superset of 0039's rule ("unprefixed means core", `reviewer-<layer>-<n>`), so no
name 0039 prescribes changes meaning. **0039's items 1 to 4 (`REPO`, `row-claim` and B4, `work-gate` and `wake`,
`pr-open`) need a RE-READ**, because each read "the tracker" as one repository and each is now a per-project list; their
readings stay true as readings, and their sizes stand, but the row body each produced is superseded by the matching child
in the appendix here (3a, 3b, 3c, 3g). Items 5 to 10 concern the `nvda-worker` layer and stand: 0039's item 5 is extended by
decision 6 (the same two surfaces, now for `agent-org`), and its item 9 (agent rules per repository) is touched by
decision 4 because the role briefs leave the tool. 0039's own text is not edited by this row (its file is outside this
row's Region); a dated update in 0039's Status pointing here is owed and is named in the closing comment.

## Context

**The chairman ruled that `agent-org` becomes a tool other projects could run, with a11ign as its first project.** The
measured fact that shapes every decision below is one sentence: **the tool's whole dependence on the rest of this tree is
NINE files, and its whole a11ign-specific content is a handful of named surfaces, but the failure a second project would
meet is SILENT.** A pull request number 7 in a second repository would be read by the gate as this repository's number 7
(decision 2); a tool that defaulted a missing field to `a11ign/a11ign` would answer for the wrong project without an error
(decision 1). Each is measured below.

**Two facts found by reading that the move would otherwise have found.** (1) The tool is NOT dependency-free on the product:
it imports nine files by relative path (decision 4), **and one of them is a file under AGPL-3.0-or-later that a public
Apache-2.0 tool must not import** (decision 7). (2) The tool is far more than four surfaces: **`acceptance-commands.mjs`
carries a list of a11ign's shared-resource commands (`fleet:`, `lab:`, `worker:`) that no surface in the row's own list
names** (decision 1, surface 2), which is why the label row is larger than it was filed.

## Decision

1. **The tool reads ONE declaration per project and refuses, never defaults.** The declaration is a JSON file at
   `.agent-org/project.json` in the project's repository, plus plugin modules beside it (`.agent-org/plugins/`) for the few
   things that must RUN project code. A second, machine-level file (`host.json`, decision 3) says where the tool and each
   project's checkout are on THIS host. **A field is data; a plugin is code the project owns; everything else stays code in
   the tool and the project cannot change it** (decision 1 draws the line for each of the four surfaces).
2. **A repository is named by a declared KEY, and a key is how a session, a claim, a seat and a state entry are told apart
   when two repositories both have a number 7.** The empty key belongs to the host's PRIMARY project's first code repository,
   so every existing name, ledger line and label keeps its meaning; every other repository's names carry its key
   (`reviewer-agent-org-12`, `worker-agent-org-7`, `../wt-agent-org-7`, `agent-org#7`). One tick reads every project the host
   lists.
3. **The host runs the tool from its OWN checkout, installed from `a11ign/agent-org` and pointed at projects by
   `host.json`, and never from inside a product checkout.** The three tool units are rendered from templates, the four
   project units and the routing data stay in the project.
4. **`guards` stays with the product; the tool COPIES the seven small files it needs; the org's tests split by what they
   import (113 travel, 14 stay to be divided).** The tool ends with no relative import out of its own tree.
5. **The rehearsal is a shadow run on a copy of the state with a stated window (1,440 ticks, chosen not measured), and the
   rollback is that no state file changes shape or place across the cut.** The old unit stays installed and its timer is
   disabled, not deleted, until a separate row removes it.
6. **`agent-org`'s `main` is protected BEFORE its first pull request, and the one unprotected write is named: the first push
   creates `main`.** (RULED; this ADR records what follows.)
7. **The relicensing check finds nothing that cannot be relicensed and one edge that must be cut first.** (RULED;
   the check is the ADR's.)
8. **A fixture project inside the tool's tests exercises all four surfaces and five two-repository cases, and cannot prove
   GitHub's side of any of them.** (RULED; the limit is written down.)
9. **Of `packages/agent-org/host`'s 17 entries, 8 are the tool's, 8 are the project's and 1 is host data.**
10. **The timeline and critical path, ruled version one as a whole:** `agent-org` out in 3 to 5 days and the whole split in 6 to 16, LOW confidence, every duration citing a reading or the word UNMEASURED; the shadow window is 1,440 ticks (48 hours), chosen, and the readings do not separate it from 24; `documents`' first publish is on the next `a11ign` release's critical path.
11. **The three asks of #69, 07:53Z:** the trigger for splitting `evidence` is 28 days
    without a protocol bump and under 10 commits a week; report wording DOES live in `evidence`, and moving its six display
    glosses to `cli` is one additive row that changes the text of a contract sentence; `scorer` stays until that trigger
    fires. And **`@a11ign/documents` has never been published, so its move is a FIRST PUBLISH on the critical path of the
    next `a11ign` release.**

**This ADR files nothing and starts nothing.** It changes no code, and creates no repository.

## The eleven decisions

Each gives its readings, what assumes what, a size a reader can recheck, the decision with its cost and what was rejected,
an owner, and what it depends on.

### DECISION 1 — The boundary between configuration and code: four surfaces, and a fifth the row did not name

**Readings.**

```
$ git grep -lE 'repo-identity' -- packages/agent-org/src ':!*.test.*' | wc -l
31
```

```
$ git grep -l 'a11ign/a11ign' -- packages/agent-org ':!*.test.*' ':!*.md' | sort
packages/agent-org/host/a11ign-board-report.service
packages/agent-org/host/board-report-dispatch.sh
packages/agent-org/src/host-units.mjs
packages/agent-org/src/org-watch.mjs
packages/agent-org/src/reviewer/pr-review-verdict.sh
```

```
$ git grep -lE 'PROJECT_OWNER|PROJECT_NUMBER' -- packages scripts ':!*.test.*' | wc -l
7
```

```
$ { git grep -lE 'repo-identity|PROJECT_OWNER|PROJECT_NUMBER' -- packages/agent-org/src ':!*.test.*'; git grep -l 'a11ign/a11ign' -- packages/agent-org ':!*.test.*' ':!*.md'; } | sort -u | wc -l
36
```

```
$ git grep -lP '[\x22\x27\x60](ready|backlog|in-progress|started|was-ready|needs:chairman|out-of-release|blocked)[\x22\x27\x60]|[\x22\x27\x60](lane|session|answer):|Road to version one|Out of release' -- packages/agent-org/src ':!*.test.*' | wc -l
43
```

```
$ git grep -lE 'claim-labels' -- packages/agent-org/src ':!*.test.*' | wc -l
8
```

```
$ comm -12 <(git grep -lP '[\x22\x27\x60](ready|backlog|in-progress|started|was-ready|needs:chairman|out-of-release|blocked)[\x22\x27\x60]|[\x22\x27\x60](lane|session|answer):|Road to version one|Out of release' -- packages/agent-org/src ':!*.test.*' | sort) <(printf 'packages/agent-org/src/%s\n' row-claim.mjs row-claim/file-overlap-rule.mjs row-claim/blocked-by-edge-rule.mjs row-claim/blocked-by-rule.mjs row-claim/own-pr-health-rule.mjs row-claim/template-fields-rule.mjs region-paths.mjs pr-open.mjs acceptance-commands.mjs work-gate.mjs work-gate/pr-orders.mjs wake.mjs | sort) | wc -l
10
```

```
$ sed -n 117,124p packages/agent-org/src/acceptance-commands.mjs | cut -c1-100
const FLEET_LAB_PATTERNS = /** @type {[RegExp, string][]} */ ([
  [/\bfleet:/, "reaches the fleet -- a GitHub runner has no Windows worker"],
  [/\blab:/, "reaches the lab -- a GitHub runner has no Proxmox"],
  [/\btraining:capture/, "captures real evidence, which needs the fleet"],
  [/\bworker:/, "reaches a worker VM, which does not exist on a GitHub runner"],
  [/\bevidence:check\b/, "compares live evidence against a real worker"],
  [/\bgate:stability\b/, "captures canaries against a real worker"],
  [/\bcapture:check\b/, "needs a real worker and NVDA"],
```

```
$ node -e "import('./packages/agent-org/src/work-gate.mjs').then(m=>console.log('CAUSES',m.CAUSES.length,'START',m.START_CAUSES.length,'JUDGMENT',m.JUDGMENT_CAUSES.length))"
CAUSES 29 START 9 JUDGMENT 16
```

```
$ git grep -ohE 'causeKey: `[a-z0-9-]+/' -- packages/agent-org/src/work-gate.mjs packages/agent-org/src/work-gate | sort | uniq -c
      4 causeKey: `ceo/
      1 causeKey: `orchestrator/
     10 causeKey: `product-manager/
```

```
$ git ls-files packages/agent-org/docs | sed 's#/[^/]*$##' | sort | uniq -c; git ls-files | grep -c 'agent-org/docs/roles/sessions.json'
     13 packages/agent-org/docs/roles
     20 packages/agent-org/docs/roles/memory
1
```

```
$ git grep -lE 'agent-org/docs/roles' -- . ':!docs/adr/0040-*' | wc -l
37
```

```
$ git grep -lE '/home/agent' -- packages/agent-org ':!*.test.*' ':!*.md' | wc -l; ls packages/agent-org/host | wc -l
12
17
```

```
$ git grep -lE 'process\.env\.HOME|homedir\(\)' -- packages/agent-org/src ':!*.test.*' | wc -l
6
```

```
$ { git grep -lE 'repo-identity|PROJECT_OWNER|PROJECT_NUMBER' -- packages/agent-org/src ':!*.test.*'; git grep -l 'a11ign/a11ign' -- packages/agent-org ':!*.test.*' ':!*.md'; git grep -lP '[\x22\x27\x60](ready|backlog|in-progress|started|was-ready|needs:chairman|out-of-release|blocked)[\x22\x27\x60]|[\x22\x27\x60](lane|session|answer):|Road to version one|Out of release' -- packages/agent-org/src ':!*.test.*'; printf 'packages/agent-org/src/%s\n' work-gate.mjs worker-profile.mjs wake.mjs; git grep -lE '/home/agent' -- packages/agent-org ':!*.test.*' ':!*.md'; } | sort -u | wc -l
64
```

**What each reading says.**

- **Surface 1, repositories and boards: 36 files (measured: the union of the first four readings).** 31 non-test files import
  `repo-identity`, 5 carry the literal `a11ign/a11ign` (three are host units and scripts that cannot import anything), and 7
  files across `packages` and `scripts` use `PROJECT_OWNER` and `PROJECT_NUMBER`. **FIELDS**: each tracker and each code
  repository is an entry `{key, repo}`, each tracker also `{board: {owner, number}}`. **CODE, unchanged**: every `gh` call
  and its `--repo` argument (89 sites, ADR 0039 item 1). **No plugin.**
- **Surface 2, labels, milestones, lanes and the row template: 43 files (measured, pattern-counted) where the row said
  "twelve".** 43 non-test files carry a quoted status word (`ready`, `in-progress`, `needs:chairman`, …), a `lane:`,
  `session:` or `answer:` prefix, or a milestone title, and **only 8 import the constants module that exists for them**, so
  the vocabulary is mostly spelled, not imported. **10 of the 43 are files 3b and 3c already edit**, which sets the order
  (see "The sum"). **FIELDS**: the label names, the milestone titles, the path of the lanes file (which stays where it is
  and is POINTED AT: `docs/lane-ownership.json` is `ceo`'s), the template field names (`Acceptance`, `Closes`, `Fleet`).
  **The FIFTH kind, found by reading `acceptance-commands.mjs`: a project's list of SHARED-RESOURCE commands**
  (`FLEET_LAB_PATTERNS`, seven `[pattern, reason]` pairs and the row-template question that goes with them). It is a
  **FIELD** (`resources: [{pattern, reason}]`, `question`), because a project with no fleet has none and loses no other
  rule. **CODE, unchanged**: the row state machine (`backlog → ready → in-progress → …`): a project may RENAME a state, it
  cannot ADD one.
- **Surface 3, role briefs and gate causes: 3 code files and 33 files that move (measured).** The gate has 29 causes
  (9 START, 16 JUDGMENT) in `work-gate.mjs`, four lists a cause must be added to together. **The row assumed the causes
  naming the fleet, lab and corpus were many; the reading says ONE of 29 routes to the fleet seat** (`orchestrator/`
  appears once against 10 for `product-manager/` and 4 for `ceo/`), so **28 are the tool's CODE and at most 1 is a
  PLUGIN** (`fleet-batch-due`; the row's first step classifies all 29 and may find one more). A plugin is a module
  `{cause, group, profile, detect(reads)}` because it runs project code. The role briefs (13 files including
  `sessions.json`, plus 20 in `memory/`) are **a FIELD naming a directory**, and **they MOVE OUT of
  `packages/agent-org/docs/roles` into the a11ign repository**, else the extraction would carry a11ign's briefs into a public
  tool; 37 files reference the path.
- **Surface 4, host paths and units: 12 files carry `/home/agent` and 6 read `HOME` (measured).** All seven services set
  `WorkingDirectory=/home/agent/repos/a11y-witness`. **FIELDS in `host.json`** (this is the machine's, not the project's):
  the tool's install path, each project's checkout, the state directory, the `gh` config directories. **FIELDS in the
  project declaration**: the unit-name prefix and the partition of units (decision 9). **CODE**: the unit checks
  (`host-units.mjs`), which read both directories.

**Size.**

**Surface 1 — 36 files.** **Surface 2 — 43 files.** **Surface 3 — 3 code files, and 33 files that move.** **Surface 4 — 12 files.**

**Sum:** the four surfaces are 36 + 43 + 3 + 12 files and **64 distinct files once the overlaps are removed** (measured: the last reading), plus 33 role files that move and 69 files whose imports are repointed (decision 4). That is **10 rows** (the eight filed, and two the decisions found: 3g cuts the nine outward edges, W moves report wording, decision 10). **After the seam, 3b, 3c and 3f go in parallel** (their Regions are disjoint), then 3d, which shares 10 files with 3b and 3c and touches `host-units.mjs` with 3f, then 3e; 3a and 3g come first and 4 and 5 last.

**Decision:** The declaration is `.agent-org/project.json`, **JSON** and not YAML, for three measured reasons: the tool imports no third-party module today (16 lines import a package, all `@a11ign/worker-fleet/cli-flags`, a file the tool must stop importing; reading in decision 7), so a YAML reader would be its FIRST dependency; the product's own scripts must read the declaration without importing the tool (decision 4), and `JSON.parse` is a built-in; and the repository already keeps its data files as JSON with `_`-prefixed keys for prose (`docs/lane-ownership.json`, `_claimVsAuthorRuling`). A missing declaration, a missing or mistyped field, an unknown `schema`, two entries with the same key, and a key that ends in `-<digits>` are each REFUSED naming the field; **nothing is defaulted to a11ign's value**, which is the failure a defaulting reader has everywhere in this tree. Cost: JSON has no comments (the `_` convention carries them) and a hand edit is less forgiving. Rejected: (a) YAML, above; (b) a `package.json` field (`"agent-org": {…}`), because a project that is not an npm package has none, and the tool must not assume Node conventions of its subject; (c) a `.mjs` module exporting the declaration, because it makes the declaration CODE, which is what "a field is data" exists to prevent, and a reader would have to execute a project's file to learn its board.

**Owner:** engineer (3a, then 3g, 3b, 3c, 3f, 3d, 3e).

**Depends on:** none.

### DECISION 2 — Where each project's rows live, how the machinery reads more than one board, and what a name is when two repositories both have a number 7

**Readings.** (The seats reading is decision 1's `s3-seats`.)

```
$ git grep -nE '`reviewer-\$\{' -- packages/agent-org/src/review-attribution.mjs
packages/agent-org/src/review-attribution.mjs:100:  return `reviewer-${Number(prNumber)}`;
```

```
$ cut -f2- ~/.cache/a11ign/wake-ledger | sed -E 's/[0-9]+/N/g' | sort | uniq -c | sort -rn | head -6
    474 RESET	engineers/ready-row-unclaimed/N
    316 engineers/ready-row-unclaimed/N
    224 RESET	product-manager/ready-queue-empty/N
    146 engineers/ready-row-unclaimed/N	worker-N
    122 RESET	product-manager/answer-owed/row-N
    103 product-manager/ready-queue-empty/N
```

**What assumes what.**

- **Every name that embeds a bare number is a collision waiting for the second repository (measured, first two readings).**
  The reviewer's seat name is built in ONE place, `review-attribution.mjs:100`, as `reviewer-${Number(prNumber)}`; the wake
  ledger, a live file, holds keys of the shapes `engineers/ready-row-unclaimed/N`, `product-manager/answer-owed/row-N` and
  `…/N:STATE`, each ending in a bare number. A row #7 in `agent-org` and a row #7 in `a11ign` would today be ONE ledger key,
  so a `RESET` written for one would silence the other. (*inferred* from the shape: no second repository exists to show it
  happening; decision 8's fixture is where it is shown.)
- **The standing seats are not per project (measured: of the 15 cause keys that name a standing seat, 10 route to
  `product-manager`, 4 to `ceo` and 1 to `orchestrator`).** Those three are ONE session each and read every board; the handoff
  queue is keyed by seat name (decision 5). **One tick over every project the host lists** therefore delivers to each seat once;
  a tick per project would give a seat two queues.

**Decision:** Every tracker and every code repository in a declaration carries a **key**: `[a-z0-9-]+`, unique across the
host, never ending in `-<digits>` (so a name parses uniquely from the right), and **the empty key, allowed once on the
host, belongs to the primary project's first code repository and first tracker**. A name is `<role>-<key>-<n>` and, for the
empty key, `<role>-<n>` exactly as today. So for a11ign (the primary, key empty) nothing moves, for its layer repository
`nvda-worker` (0039's rule) a review seat is `reviewer-nvda-worker-12`, and for `agent-org` (key `agent-org`) `reviewer-agent-org-12`,
`worker-agent-org-7`, worktree `../wt-agent-org-7`, label `session:worker-agent-org-7`. **A ledger, marker or queue key is `<key>#<n>` for a
non-empty key and the bare `<n>` for the empty one**, so the existing wake ledger, its `VOIDED` markers and the handoff queue
are read by the new code with no conversion and by the old code unchanged: **this is what makes rollback (decision 5) a
unit edit and not a state migration.** A Region path carries a repository prefix (`nvda-worker:src/x.ts`, 0039) and the
prefix is the key. **A cross-repository close is `Closes owner/repo#N`**, the form a layer PR uses; 3b makes the merge-blocking
parser accept it. **A repository the tool cannot read is `CANNOT_TELL`, never "no overlap" and never a pass** (0039's invariant,
unchanged). Cost: every name in a NON-primary project is longer, and the reader has one more rule to refuse on. Rejected:
(a) always qualify, so a11ign's names become `reviewer-a11ign-12` — measured against the ledger above, that renames a live
population of keys mid-flight and breaks every existing `VOIDED` marker; (b) a tick per project — the queue reason above; (c)
qualify by `owner/repo` instead of a key — `/` is the ledger's separator, and a seat name is a session name in a terminal
multiplexer, which the org types by hand.

**Size:** 3 files build a seat or worktree name today (measured: `review-attribution.mjs`, `wake.mjs`, `work-gate.mjs`), and 43
files carry vocabulary (decision 1); the naming row (3c) edits the three.

**Owner:** engineer (3c for the gate and wake names, 3b for the claim and worktree names).

**Depends on:** decision 1 (the reader that supplies keys).

### DECISION 3 — How the host runs it: installed from its own repository, pointed at a project, never run from inside a product checkout

**Readings.**

```
$ grep -E '^(WorkingDirectory|ExecStartPre|ExecStart)=' packages/agent-org/host/a11ign-work-tick.service; grep -E '^(OnBootSec|OnUnitActiveSec)=' packages/agent-org/host/a11ign-work-tick.timer
WorkingDirectory=/home/agent/repos/a11y-witness
ExecStartPre=-/usr/bin/npm run primary:update
ExecStart=/usr/bin/node packages/agent-org/src/work-tick.mjs
OnBootSec=2min
OnUnitActiveSec=2min
```

```
$ grep -H '^WorkingDirectory' packages/agent-org/host/*.service | sed 's#packages/agent-org/host/##'
a11ign-board-report.service:WorkingDirectory=/home/agent/repos/a11y-witness
a11ign-corpus-release-nightly.service:WorkingDirectory=/home/agent/repos/a11y-witness
a11ign-corpus-snapshot.service:WorkingDirectory=/home/agent/repos/a11y-witness
a11ign-fleet-watch.service:WorkingDirectory=/home/agent/repos/a11y-witness
a11ign-lab-watch.service:WorkingDirectory=/home/agent/repos/a11y-witness
a11ign-work-tick.service:WorkingDirectory=/home/agent/repos/a11y-witness
a11ign-worktree-prune.service:WorkingDirectory=/home/agent/repos/a11y-witness
```

```
$ git grep -lE 'agent-org' -- . ':!packages/agent-org' ':!*.test.*' ':!*.md' ':!docs' ':!runs' ':!package-lock.json' ':!pnpm-lock.yaml' | sed -E 's#^(.github/workflows)/.*#\1#;s#^(packages/[^/]+)/.*#\1#;s#^(scripts)/.*#\1#' | sort | uniq -c | sort -rn
     14 packages/lab
     12 scripts
      9 .github/workflows
      6 packages/guards
      1 packages/control
      1 package.json
      1 CODEOWNERS
```

**What assumes what.** The running unit is the product checkout: `WorkingDirectory=/home/agent/repos/a11y-witness`,
`ExecStartPre=-/usr/bin/npm run primary:update` (which keeps THAT checkout at `origin/main`) and
`ExecStart=/usr/bin/node packages/agent-org/src/work-tick.mjs` (measured, first reading), so **the tool is live within two
minutes of a merge because it lives in the checkout `primary:update` moves.** All seven services set the same working
directory (measured). Outside the package, 44 non-test, non-document files name it: 14 in `lab`, 12 in `scripts`, 9 workflows,
6 in `guards`, `control`, root `package.json` and `CODEOWNERS` one each (measured); those are the product's consumers of the
tool and the extraction leaves them pointing at an installed copy.

**Decision:** The host holds **`host.json`** (path in the unit's `Environment=AGENT_ORG_HOST=`), read by the tool at start:
`{tool: <install path>, primary: <project id>, stateDir: <path>, projects: [{id, checkout}], gh: {workers, leads, leadsWorkspaces}}`.
The tool is a **checkout of `a11ign/agent-org` at that path** and a tick starts `node src/work-tick.mjs` **from it**; each
project's declaration is read from `<checkout>/.agent-org/project.json`. **What the running `work-tick` unit changes, exactly
three lines:** `WorkingDirectory` becomes the tool's path, `ExecStart` becomes `node src/work-tick.mjs` (no `packages/agent-org/`
prefix), and `ExecStartPre` becomes two: update the TOOL checkout (its own `update` command, the analogue of `primary:update`),
then run each project's declared `beforeTick` command (a11ign's is `npm run primary:update`, so its primary keeps moving).
The three tool units are rendered from templates by `host:install`; `host:check` compares the rendered text (0039 item 6's
"the installed copy is the program"). **The tool tracks `main` of its repository, as the product does today**, because a pin
adds a second release act per change and today's `main` is already the live copy;
the declaration's `schema` number is the only version coupling, and an unknown `schema` REFUSES. Cost: a defect merged to the
tool's `main` reaches every project within two minutes, as a defect in `agent-org` reaches a11ign today. Rejected: (a) a
version pin per project, above; (b) an npm package installed by `npm install -g` — publishing is a chairman step (npm trusted
publisher) and nothing here needs it; (c) the tool as a git submodule of each project — it puts the tool INSIDE a product
checkout again, which is what the ruling forbids.

**Size:** 3 unit files change text (work-tick, worktree-prune, board-report) and 1 file (`host-units.mjs`) learns two source directories.

**Owner:** engineer (3f builds the reader and the templates; 5 performs the install).

**Depends on:** decision 1; decision 9's partition.

### DECISION 4 — Where `guards` goes and where the org's tests go

**Readings.**

```
$ node outward.mjs
51	packages/worker-fleet/src/cli-flags.mjs
32	packages/guards/src/git-env.mjs
30	scripts/repo-identity.mjs
10	packages/lab/src/packaging/leak-patterns.mjs
3	packages/guards/src/changed-files.mjs
3	packages/guards/src/local-import-closure.mjs
1	packages/guards/src/worktree-resolution.mjs
1	scripts/npm-cli-executable.mjs
1	scripts/product-home.mjs
-- distinct targets by top: {"packages/worker-fleet":1,"packages/guards":4,"scripts":3,"packages/lab":1}
-- distinct targets: 9  files with an outward import: 69
```

```
$ bash nine.sh
packages/worker-fleet/src/cli-flags.mjs                   211 lines   9 commits 116 importers-outside-agent-org
packages/guards/src/git-env.mjs                            56 lines   1 commits  84 importers-outside-agent-org
scripts/repo-identity.mjs                                  58 lines   7 commits  10 importers-outside-agent-org
packages/lab/src/packaging/leak-patterns.mjs              249 lines  15 commits   5 importers-outside-agent-org
packages/guards/src/changed-files.mjs                      74 lines   2 commits   9 importers-outside-agent-org
packages/guards/src/local-import-closure.mjs              146 lines   3 commits  13 importers-outside-agent-org
packages/guards/src/worktree-resolution.mjs               218 lines   2 commits   3 importers-outside-agent-org
scripts/npm-cli-executable.mjs                            182 lines   4 commits  34 importers-outside-agent-org
scripts/product-home.mjs                                   49 lines   2 commits   1 importers-outside-agent-org
-- leak patterns
7
name: "private LAN IPv4 address"
name: "a named SSH private key file"
name: "a named credential file on a fleet host"
name: "a live pct exec container-hop command"
```

```
$ bash guards-consumers.sh
module                       lines agent-org others
assert-glob-not-empty          209         0     14
changed-files                   74         3      6
changed-packages                91         0      4
files-under                    100         0      5
git-env                         56        34     74
git-spawn-scrubbed             101         0      1
isolation-gate                 609         0     12
local-import-closure           146         3     11
mutant-survivors               447         0      2
mutation-check                 337         0      4
piped-exit-status-guard        249         0      4
sandbox-exhaustion             244         0      4
test-memory-cap                268         1      1
test-tmp                        72         0     11
tooling-roots                   23         0      3
tree-wide-guard                169         0     27
tree-wide-guards                58         0      2
uncontrolled-emptiness         274         0      2
walk-scope-declaration          95         0      1
walk-scope                     721         0     20
worktree-resolution            218         1      0
```

```
$ git grep -nE 'agent-org' -- packages/guards/src ':!*.test.*' | grep -vE ':[0-9]+:\s*(//|\*|/\*)' | cut -c1-150; git grep -lE 'agent-org' -- packages/guards/src ':!*.test.*' | wc -l
packages/guards/src/tooling-roots.mjs:23:export const TOOLING_ROOTS = Object.freeze(["scripts", "packages/agent-org/src", "packages/guards/src"]);
6
```

```
$ echo "guards: $(git log --no-merges --since=2026-08-26 --format=%h -- packages/guards | wc -l)  agent-org: $(git log --no-merges --since=2026-08-26 --format=%h -- packages/agent-org | wc -l)  both: $(comm -12 <(git log --no-merges --since=2026-08-26 --format=%H -- packages/guards | sort) <(git log --no-merges --since=2026-08-26 --format=%H -- packages/agent-org | sort) | wc -l)"
guards: 24  agent-org: 309  both: 5
```

```
$ git grep -lE '(from|import\().*agent-org/(src|host)' -- packages/lab | sed 's#/[^/]*$##' | sort | uniq -c
      1 packages/lab/nightly
      1 packages/lab/scripts
    124 packages/lab/src/packaging
      1 packages/lab/src/training
```

```
$ git grep -l 'agent-org' -- packages/lab | wc -l
170
```

```
$ git grep -lE '(from|import\().*agent-org/(src|host)' -- packages/lab | xargs git grep -lE '(\.\./)+(evidence|judge|cli|worker-fleet|nvda-worker|nvda-speech|scorer|control|pdf)/|@a11ign/(evidence|judge|cli|worker-fleet|nvda-worker|scorer|control|pdf)' -- | wc -l
14
```

```
$ git grep -l 'a11ign/a11ign' -- 'packages/lab/**/*.test.*' | wc -l
33
```

**What the readings say.**

- **The tool's whole outward dependence is NINE files, and 69 of its files import at least one (measured, first reading).**
  `cli-flags` (51 importers), `git-env` (32), `repo-identity` (30), `leak-patterns` (10), and five files with one to three
  importers each. **`guards` supplies four of the nine and none of its other 17 modules is imported by the tool's source, and one of them, `test-memory-cap`, by a single tool test**
  (measured, the consumers table); `ceo`'s "42 inbound edges" is 42 IMPORT LINES to four modules, 32 of them `git-env`.
- **`guards` does not import the tool (measured): zero import lines, one data path** (`tooling-roots.mjs:23`, a list of
  directories the censuses walk) **and five comment mentions.** The row's "and `guards` imports back" is a path in a
  list, not an edge, and it changes when the directory does.
- **`guards` and the tool change together rarely: 5 of the 24 non-merge commits to `guards` in the 31 days since 2026-08-26 also touched
  the tool, against 309 to the tool in the same window (measured).** The four modules the tool uses were touched by 1, 2, 3 and 2 commits in
  their whole history (`g-nine`).
- **The org's tests are in `lab`: 127 files import the tool's source, 124 of them in `lab/src/packaging` (measured);
  170 mention it. 14 of the 127 also import a product package**, so 113 are wholly about the machinery. 33 `lab` tests
  hold the literal `a11ign/a11ign`. Outside the package, 44 non-test files name it (decision 3).

**Decision:** **`guards` STAYS with the product** and is placed: it is 21 modules of repo hygiene the product's own files
use (`git-env` alone has 74 importers outside the tool), the tool needs four of them and does not use the rest, and a
package the product edits (24 commits in the 31 days since 2026-08-26) cannot be a dependency of a tool that must not import the product.
**The tool COPIES the seven small files it needs into `src/lib/`**: `git-env` (56 lines, 1 commit), `changed-files` (74, 2),
`local-import-closure` (146, 3), `worktree-resolution` (218, 2), `npm-cli-executable` (182, 4), `product-home` (49, 2) and
`cli-flags` (211, 9): **936 lines**, each with a header naming the commit it was copied from. `repo-identity` is NOT copied:
3a's reader replaces it (the product's own 10 scripts read `.agent-org/project.json` directly, which is why the format is
JSON). **`leak-patterns` is SPLIT**: its two generic patterns (a private LAN IPv4 address, a named SSH key file) become the
tool's leak policy, and its two a11ign-specific ones (`.config/a11y-witness/…`, a live `pct exec`) become entries of the
project's `leakPatterns` field; the product keeps its own file. **The org's tests: the 113 wholly-about-the-machinery
files travel with the tool** (the extraction row moves them and their runner config); **the 14 that also import a product
package are DIVIDED by the extraction row** (each becomes tool-only by taking a fixture, or stays a product test that
calls the installed tool); **the 43 that only mention it are classified there too.** The 33 that hold `a11ign/a11ign` are
the population decision 8's fixture makes parameter-driven. Cost: **936 duplicated lines with no cross-repository pin**
(a pin would need the other repository), so the copies can drift; `cli-flags` at 9 commits and 116 outside importers is
the exposure, and the falsifier below names the signal. `lab` loses 113 of its 124 packaging tests. Rejected: (a)
`guards` moves wholesale with the tool — 16 of its 21 modules have no tool consumer and 74 product files would import
`git-env` across repositories; (b) `guards` becomes a published `@a11ign/guards` — publishing is a chairman step, and 24 product
commits in 31 days would each become a release; (c) the tool imports from an installed product checkout — it is the
coupling the extraction exists to remove, and it makes the tool unrunnable elsewhere; (d) the tool re-exports the product's
files by symlink — the extraction is a history rewrite, which drops a symlink to a path outside the tree.

**Size:** 9 files are the outward surface and 69 files import them (measured); 7 files are copied, 1 replaced, 1 split.

**Owner:** engineer (row 3g cuts the edges in place; row 5 moves the tests).

**Depends on:** 3a (the reader that replaces `repo-identity`).

### DECISION 5 — The rehearsal and the rollback, and where each state file lives during and after

**Readings.**

```
$ ls ~/.cache/a11ign | sed -E 's/\.bak-[0-9]+$//' | sort -u | tr '\n' ' '; echo
claim-stalls.json kept-claims.json prompt-session-direct prompt-session-handoffs restart-resends.json reviewer-absences reviewer-endings reviewer-instances.json reviewer-refreshes spare-cycles spare-instances.json wake-emitted wake-ledger 
```

```
$ git grep -nE '(REVIEWER_STATE_DIR|DRAIN_MARKER) = |HANDOFF_QUEUE_FILE = |STALL_STATE_FILE = |REVIEWER_REFRESH_LEDGER_FILE = |wake-ledger`' -- packages/agent-org/src ':!*.test.*' | cut -c1-150
packages/agent-org/src/claim-stall.mjs:90:export const STALL_STATE_FILE = "claim-stalls.json";
packages/agent-org/src/wake.mjs:1598:export const HANDOFF_QUEUE_FILE = "prompt-session-handoffs";
packages/agent-org/src/wake.mjs:1611:  return flagValue(argv, "ledger") ?? `${process.env.HOME}/.cache/a11ign/wake-ledger`;
packages/agent-org/src/wake.mjs:2617: * MEASURED 2026-09-24T11:16Z at 65eb7e978, over the whole `wake-ledger` (2026-09-18T07:23Z onward, 1,184
packages/agent-org/src/work-gate.mjs:235:export const DRAIN_MARKER = `${process.env.HOME}/.cache/a11ign/drain`;
packages/agent-org/src/work-gate.mjs:2542:    ledger: ledger ?? (() => ledgerText(`${stateDir}/wake-ledger`)), restart: restartFor(held, restartAt) })
packages/agent-org/src/work-gate.mjs:4270:export const REVIEWER_STATE_DIR = `${process.env.HOME}/.cache/a11ign`;
packages/agent-org/src/work-gate.mjs:4276:export const REVIEWER_REFRESH_LEDGER_FILE = "reviewer-refreshes";
```

```
$ grep -E '^(WorkingDirectory|ExecStartPre|ExecStart)=' packages/agent-org/host/a11ign-work-tick.service; grep -E '^(OnBootSec|OnUnitActiveSec)=' packages/agent-org/host/a11ign-work-tick.timer
WorkingDirectory=/home/agent/repos/a11y-witness
ExecStartPre=-/usr/bin/npm run primary:update
ExecStart=/usr/bin/node packages/agent-org/src/work-tick.mjs
OnBootSec=2min
OnUnitActiveSec=2min
```

**What the readings say.** The running org keeps **13 state entries in one directory, `~/.cache/a11ign` (live, measured)**,
and the code that names them is a handful of constants (`STALL_STATE_FILE`, `HANDOFF_QUEUE_FILE`,
`REVIEWER_REFRESH_LEDGER_FILE`, the ledger default, `DRAIN_MARKER`, `REVIEWER_STATE_DIR`), **all derived from `$HOME` and
the literal directory name `a11ign`.** The tick is `Type=oneshot` every two minutes (`OnUnitActiveSec=2min`) with
`SuccessExitStatus=0 1 2` (measured), so two ticks cannot overlap and a cut can be made in the gap between them (*inferred*
from `oneshot` semantics, verified by row 4's rehearsal, not here).

**Where each state file lives, the ADR's answer.**

| state | file (measured above) | DURING the shadow run | AFTER the cut-over |
|---|---|---|---|
| wake ledger and its `VOIDED`/`RESET` lines | `wake-ledger`, `wake-emitted` | the live gate alone writes it, in place; the shadow reads a **copy** | the SAME file, same path, same line format, written by the tool |
| prompt-session handoff queue | `prompt-session-handoffs`, `prompt-session-direct` | live gate/`prompt-session` only; shadow never queues | same files, same place |
| stalled-claim files | `claim-stalls.json`, `kept-claims.json` | live only | same |
| reviewer-refresh ledger and seat records | `reviewer-refreshes`, `reviewer-instances.json`, `reviewer-absences`, `reviewer-endings` | live only | same |
| spare/restart/drain | `spare-cycles`, `spare-instances.json`, `restart-resends.json`, `drain` (only while draining) | live only | same |

**No file moves and none changes shape at the cut.** The directory name `a11ign` stays: renaming it is a state move, and
**moving a state file mid-tick strands an order** (it is written by the tick that owns it). The directory becomes `host.json`'s
`stateDir` (decision 3), whose a11ign value is today's path; keys are qualified only for non-primary projects (decision 2), so
every line already on disk is read as before.

**Decision:** **A shadow run, then a cut, then a separate removal.** (1) **Shadow:** row 4's runner takes the reads the live
gate took for a tick, feeds them to the extracted gate over a **copy** of the state directory, and writes both gates' orders
for that tick to a diff record; it REFUSES a state directory equal to the live one, by resolved real path (a symlink to it is
refused too), and never writes a state file, a marker or the queue. Because both gates read the SAME reads (row 4's design, *inferred* until it is built), the shadow adds
no GitHub calls. (2) **The window is 1,440 consecutive ticks (48 hours at two minutes) with every difference explained**
(a difference is a defect until it is), and it may not close until every cause that fired in the seven days BEFORE it opened
has fired in it, or the diff record says which did not and why. (3) **The cut** is a swap of two units in the gap between
ticks: the old timer is stopped and DISABLED (not deleted), the new started with an immediate manual tick, so no period is
missed. (4) **A live cut-over tick has run clean when 30 consecutive ticks (one hour) exit within `SuccessExitStatus`, drop no
order the shadow's reverse diff would have made, and at least one queued handoff has crossed the swap and been delivered.**
(5) **Rollback is re-enabling the old timer and stopping the new**, possible until a LATER row removes the old copy, because
no state changed shape; **removal is a separate row filed only after the clean tick**, so a rollback is one unit edit and
never a revert. The window and the two clean-tick numbers are **chosen, not measured**: the measured inputs are the two-minute
period and the exit statuses. Cost: 48 hours of calendar time before cut-over, and an old and a new copy of the machinery
installed at once. Rejected: (a) copy the state to a new directory at cut-over — a copy at time T loses every order written
after T, which is the stranded-order failure by another route; (b) a big-bang cut with a rollback plan — the ruling's shadow
run exists because a rollback of state is not a unit edit; (c) two gates writing the live state during the window — two
writers on one ledger.

**Size:** 13 state entries, 6 constants, 2 units (old and new); 0 files move.

**Owner:** engineer (row 4 builds the instrument; row 5 performs the swap).

**Depends on:** decisions 2 and 3.

### DECISION 6 — The merge path of `agent-org`: what protects `main` before its first pull request, and what arming does while the token cannot reach it

**RULED (#69, 07:20Z; recorded, not reopened):** the repository is public, so the ruleset, protection, required review and
merge queue are available on the free plan, exactly as `a11ign/a11ign` runs them; the private-repository 403 no longer
applies. What follows from it is the ADR's.

**Readings.**

```
$ bash live-reads.sh
{"allow_auto_merge":false,"default_branch":"main","delete_branch_on_merge":false,"has_issues":true,"license":null,"private":false,"size":0}
-- branches
0
-- main
{"message":"Branch not found","documentation_url":"https://docs.github.com/rest/branches/branches#get-a-branch","status":"404"}gh: Branch not found (HTTP 404)
-- rulesets
0
-- rules on main
0
-- protection
{"message":"Branch not found","documentation_url":"https://docs.github.com/rest/branches/branch-protection#get-branch-protection","status":"404"}gh: Branch not found (HTTP 404)
-- teams
[{"permission":"admin","slug":"bots"}]
-- same on a11ign
[{"enforcement":"active","id":23681721,"name":"merge-queue-main"}]
["merge_queue","pull_request"]
```

```
$ sed -n 92,97p .github/workflows/auto-arm.yml | cut -c1-140
# GitHub does not trigger workflows from events created with `GITHUB_TOKEN`. A merge completed by
# `github-actions[bot]` -- every merge THIS workflow arms and GitHub later completes -- fires neither
# `pull_request: closed` nor a `push`, so `trunk-guard`, `close-rows` and every push watchdog go silent
# for exactly the merges the pipeline performs (37 data points, no exceptions: 18 of 18 PAT merges ran
# `close-rows`, 19 of 19 bot merges never did; 5 of 5 sampled bot-merge SHAs never ran `trunk-guard` at
# all). Arming with a real, fine-grained PAT instead means the completed merge is attributed to that
```

```
$ sed -n '226,229p' .github/workflows/auto-arm.yml | cut -c1-150; sed -n '444,445p' .github/workflows/auto-arm.yml | cut -c1-150
          if [ -n "$A11IGN_BOT_TOKEN" ]; then
            export GH_TOKEN="$A11IGN_BOT_TOKEN"
          else
            echo "::warning::A11IGN_BOT_TOKEN is not set -- arming with GITHUB_TOKEN instead. A merge completed with it fires no workflow events (trun
          if [ -z "$A11IGN_BOT_TOKEN" ]; then
            echo "::warning::A11IGN_BOT_TOKEN is not set -- SKIPPING update-branch entirely, not falling back to GITHUB_TOKEN. A push made with GITHUB
```

**What the readings say (all *live* except the two workflow readings).** **Nothing protects `agent-org`'s `main` today,
because `main` does not exist: 0 branches, 0 rulesets, 0 rules applying to `main`, `allow_auto_merge` and
`delete_branch_on_merge` both `false`, and the `bots` team holds `admin`** (first reading). `a11ign/a11ign` runs ruleset
`merge-queue-main` (id 23681721) with a `merge_queue` and a `pull_request` rule (last two lines of the first reading). The
arming workflow falls back to `GITHUB_TOKEN` when `A11IGN_BOT_TOKEN` is unset (the third reading) and **skips
update-branch entirely** rather than fall back; and its own header records why the fallback matters: **a merge completed with
`GITHUB_TOKEN` fires neither `pull_request: closed` nor a `push`, so `close-rows` and `trunk-guard` go silent (19 of 19 bot
merges never ran `close-rows`, 5 of 5 sampled never ran `trunk-guard`; the second reading, the workflow's own measurement
of 2026-09-08).** `ceo` reported at 07:40Z that the chairman has added `agent-org` to the token's repository access on the
fine-grained token and the org secret; **that is not readable from here and is taken on his word.**

**Decision:** **`main` is unprotected for exactly ONE write, the first push, and that write is named.** The order, each step
before the next: (1) settings while empty: `allow_auto_merge` and `delete_branch_on_merge` set to `true`, as on `a11ign/a11ign`;
(2) **the first push** (the history-preserving import, whose first commit carries `LICENSE`, the `license` field, the leak scan
and the PR template) by the admin bootstrap identity: **this is the one unprotected write, and the window is the time to
step 3**; (3) IMMEDIATELY: classic protection (`enforce_admins: true`, EMPTY `bypass_pull_request_allowances`, one approving
review) and a `merge-queue-main`-style ruleset (`pull_request` requiring 1, plus `merge_queue`), copied from ruleset 23681721;
(4) **read back BEHAVIOURALLY before any real pull request**: open a docs-only smoke PR and read `reviewDecision`, which must
read `REVIEW_REQUIRED` and not empty (`main-review-requirement`), **and say which instrument was used**: with repository admin,
`branches/main/protection` behind `A11Y_CHECK_BRANCH_PROTECTION=1` (the only one that can answer *nobody is exempt*); without,
`rules/branches/main` plus the ruleset behind `A11Y_CHECK_MAIN_RULESET=1`, which answers for the asking identity ONLY; (5)
only then downgrade `bots` from `admin` to `write` and read the requirement back again; (6) the required status check `gate`
is added AFTER the first PR's own `gate` job has run once (a check name can be required only after it has run: *external
knowledge*, from `ceo`'s provisioning list, not exercised here). **The token scope is a PRECONDITION of child 5's cut-over and
not a decision:** until the first merge in `agent-org` shows which arming path ran (the token's, or the fallback's warning),
nothing that needs `close-rows` or `trunk-guard` is claimed to work there, and update-branch is skipped. Cost: one push that
any admin identity could have made differently, held open for minutes and closed by a human-run step that is not automatic.
Rejected: (a) create the ruleset before the first push — a `pull_request` rule with an empty bypass list would refuse the
import itself (*external knowledge*, to be verified by the row rather than assumed), and a bypass entry for the import is the
standing exemption the review rule exists to close; (b) push a placeholder commit to make `main` exist early — the same
unprotected write, made earlier and for no reason; (c) accept the fallback silently — 19 of 19 is not a rounding error.

**Size:** 0 files change in the product; 2 surfaces set once (classic protection and the ruleset); 1 workflow reading per merge.

**Owner:** engineer for the read-back, the chairman for the token (a precondition, not a task here).

**Depends on:** child 5.

### DECISION 7 — The licence: `Apache-2.0` at creation, and the one check the ruling leaves standing

**RULED (#69, 07:20Z; recorded, not reopened):** `Apache-2.0` at creation, the first push carrying `LICENSE` and the matching
`license` field. `agent-org` is `AGPL-3.0-or-later` today (first reading). **The ADR owns the ONE check: that the tool carries
no AGPL-derived code or product content it cannot relicense.**

**Readings (the relicensing check).**

```
$ for p in packages/agent-org packages/worker-fleet packages/guards packages/lab packages/nvda-speech; do echo "$p $(grep -o '"license": *"[^"]*"' $p/package.json)"; done; grep -n '"license"' package.json
packages/agent-org "license": "AGPL-3.0-or-later"
packages/worker-fleet "license": "AGPL-3.0-or-later"
packages/guards "license": "AGPL-3.0-or-later"
packages/lab "license": "AGPL-3.0-or-later"
packages/nvda-speech "license": "GPL-3.0-or-later"
7:  "license": "AGPL-3.0-or-later",
```

```
$ ls packages/*/LICENSE LICENSE | tr '\n' ' '; echo; head -2 packages/evidence/LICENSE | cut -c1-80
LICENSE packages/cli/LICENSE packages/evidence/LICENSE packages/judge/LICENSE packages/nvda-speech/LICENSE packages/nvda-worker/LICENSE packages/pdf/LICENSE packages/scorer/LICENSE packages/worker-fleet/LICENSE 

                                 Apache License
```

```
$ grep -c '"dependencies"' packages/agent-org/package.json; git grep -c 'require(' -- packages/agent-org/src ':!*.test.*' | wc -l
0
0
```

```
$ git grep -hE "^\s*(import|export) .* from ['\"][^./]" -- packages/agent-org/src ':!*.test.*' | sed -E "s/.* from ['\"]([^'\"]+)['\"].*/\1/" | grep -v '^node:' | sort | uniq -c
     16 @a11ign/worker-fleet/cli-flags
```

```
$ git log --no-merges --format='%ae' -- packages/agent-org | sort | uniq -c | sort -rn
    173 github-actions[bot]@users.noreply.github.com
    107 46429371+DanBeckDev@users.noreply.github.com
      7 noreply@anthropic.com
      6 ai-workers@a11ign.dev
      5 boreme12@gmail.com
      5 a11ign-ai-workers@users.noreply.github.com
      4 ai-workers@a11ign.invalid
      1 worker-tooling@a11ign.invalid
      1 noreply@github.com
```

```
$ git log --no-merges --format=%B -- packages/agent-org | grep -i '^Co-authored-by' | sed 's/ *<.*//' | sort | uniq -c | sort -rn
    155 Co-Authored-By: Claude Sonnet 5
    153 Co-Authored-By: Claude Opus 5 (1M context)
```

```
$ git grep -lEi 'SPDX-License|@license|Copyright \(c\)|All rights reserved' -- packages/agent-org | wc -l
0
```

**What the check finds.**

- **No third-party code (measured):** the package declares no `dependencies`, has no `require(`, and imports no module but
  Node's built-ins and **one package, `@a11ign/worker-fleet/cli-flags`, 16 import lines** (`l-thirdparty`; `l-deps`).
- **No author outside the chairman's accounts and the org's agents (measured, not a legal opinion).** 309 non-merge commits
  under 9 identities: `github-actions[bot]` 173, the chairman's account 107 and his address 5, the org's agent accounts 22,
  and two single commits (`worker-tooling@a11ign.invalid`, and `noreply@github.com` under the `a11ign-ai-workers` name).
  No commit by an identity that is neither. **The premise that the chairman is the sole holder is the ruling's (`ceo`, 07:20Z)
  and this reading does not contradict it.**
- **308 `Co-Authored-By: Claude` trailers** sit on these commits (155 + 153). Whether model-assisted output is copyrightable, and
  by whom, is unsettled law (*external knowledge*); **either answer leaves the holder free to license it, so it is recorded
  and is not a blocker.**
- **No per-file licence header (0 files, measured):** the package is licensed at package level, so no header conflicts with
  the new one. `nvda-speech` (GPL-3.0-or-later) is not among the nine outward targets (`g-outward`).
- **ONE FINDING that must be acted on: the nine files the tool imports are all in AGPL-3.0-or-later packages** (`worker-fleet`,
  `guards`, `lab`, and the root `scripts/`; `l-licences`). An Apache-2.0 tool that IMPORTS them is, *inferred* and not legal advice, a combined work whose
  AGPL terms it cannot shed, which the licence ruling assumed away. It is not a file the holder cannot relicense (he holds
  them), so **it is not a correction to the ruling and does not go to `ceo` as one**: it is fixed by decision 4's copies,
  made by the holder, each copy carrying its own Apache-2.0 header, and **the check is re-run at the extraction commit as
  child 5's Acceptance**. The role briefs and their 20 memory files (33 files) name a11ign throughout and **stay with a11ign**
  (decision 1), so no product content enters the public tool.

**Decision:** Apache-2.0 stands. The tool's tree is licensed only after decision 4's edge cut; the extraction's Acceptance
refuses a `license` other than `Apache-2.0` and any relative import out of the tree. **If the holder premise is wrong** (a
contributor outside his accounts is found), that is a correction to the ruling and goes to `ceo` on this row. Cost: the
copies are AGPL originals and Apache copies of the same lines, which is the holder's to do and which the product's AGPL
originals do not affect. Rejected: (a) relicense the four `guards` modules in place — it relicenses files the product
still owns; (b) keep the tool AGPL — ruled otherwise; (c) a licence exception file — the reading found nothing needing one.

**Size:** 9 files carry the finding (the nine targets), 7 copied; 309 commits and 9 identities read.

**Owner:** engineer (child 5 re-runs it), `ceo` only if the premise fails.

**Depends on:** decision 4.

### DECISION 8 — How "project-agnostic" is tested: a fixture project inside the tool's own tests

**RULED (#69, 07:20Z; recorded, not reopened):** no `agent-org-sandbox` repository is created; **a fixture project inside
`agent-org`'s own tests proves the boundary.** The ADR says what it must exercise and what it cannot prove.

**Readings.**

```
$ git grep -nE '"--repo"' -- packages/agent-org/src ':!*.test.*' | wc -l
89
```

```
$ git grep -l 'a11ign/a11ign' -- 'packages/lab/**/*.test.*' | wc -l
33
```

**Decision:** A fixture project is REQUIRED in the tool's own tests, the set below is the MINIMUM it must exercise, and the limit that follows is part of the ruling.

**What the fixture project must exercise.** It is a SECOND declaration (`test/fixtures/projects/<name>/.agent-org/project.json`
in the tool's repository) that differs from a11ign's in every field a project can set, and the tests run the tool against it.
**The four surfaces of decision 1:** (1) an owner, repository and board number that are not a11ign's, and a missing field
REFUSED naming it and never answered with a11ign's value; (2) a vocabulary that renames labels and milestones (`row-file`
refuses a milestone the fixture lacks), names its own `Acceptance`/`Closes` fields and a `resources` list of its own, and
NO fleet command; (3) a roles directory of its own and a gate with no project cause, losing no other cause; (4) paths and a
unit prefix that are not a11ign's. **The five two-repository cases of decision 2:** (a) the same row number in two
trackers gives two seats, two ledger keys and two worktree names; (b) the same PR number in two code repositories gives
two reviewer seats; (c) a project with two code repositories, where a B4 overlap lives only in the second, is refused naming
it; (d) a tracker that is not the code repository, with `Closes owner/repo#N` accepted by the merge-blocking parser and a
malformed cross-repository form refused; (e) a repository the tool cannot read is `CANNOT_TELL` and never "no overlap". **And
one tick over two projects**, the primary keeping bare names and the second qualified, its ledger byte-identical to a11ign's
for the primary's entries. The 89 `"--repo"` sites (measured) are where (a) to (e) are made true, and the 33 `lab` tests that
hold `a11ign/a11ign` are the ones the fixture makes parameter-driven or that stay a11ign's.

**What it CANNOT prove, so the limit of the ruling is written down.** (1) **GitHub's side of everything**: that a
ruleset and the merge queue behave, that arming completes a merge, that `Closes owner/repo#N` actually closes an issue across
repositories, what a token's scope reaches, and the separate GraphQL and REST pools per token (`gh-api-budget`); the
fixture replays recorded reads and never talks to GitHub. (2) **A real second board's shape**: a Projects v2 board's field and
option ids are per board and a fixture's are invented. (3) **The host**: systemd, the terminal multiplexer whose session names
the org types by hand, the `gh` routing wrapper's accounts. (4) **A project unlike the fixture**: a fixture written by the
authors of the tool encodes the authors' assumptions, so "the tool ran on it" is weaker than "a stranger's project ran on
the tool" — the same mistake as one outsider, one step smaller. **A second REAL project would prove more and is not ruled;
this ADR does not ask for one.** Cost: the tool's readiness for a second project is asserted by tests its own authors wrote.
Rejected: (a) the sandbox repository — ruled out; (b) a11ign's own declaration as the only fixture — one project proves
nothing; (c) a property test over generated declarations — it generates the same assumptions faster.

**Size:** 1 fixture project, 5 two-repository cases, 4 surfaces; 89 `--repo` sites and 33 literal-holding tests are the reachable population.

**Owner:** engineer (each of 3a to 3g adds its case; 5 checks the set is complete).

**Depends on:** decisions 1 and 2.

### DECISION 9 — What is the PROJECT's and not the tool's inside `packages/agent-org/host`

**Readings.**

```
$ git grep -ciE 'fleet|corpus|nvda|lab:job|worker-capture' -- packages/agent-org/src ':!*.test.*' | awk -F: '$2>=8' | sort -t: -k2 -nr; ls packages/agent-org/host
packages/agent-org/src/acceptance-commands.mjs:114
packages/agent-org/src/work-gate.mjs:101
packages/agent-org/src/row-file.mjs:31
packages/agent-org/src/host-units.mjs:25
packages/agent-org/src/waiting-condition.mjs:23
packages/agent-org/src/fleet-gated-nightly.mjs:23
packages/agent-org/src/board-report.mjs:22
packages/agent-org/src/board-document.mjs:11
packages/agent-org/src/worker-profile.mjs:9
packages/agent-org/src/ready-label-audit.mjs:9
packages/agent-org/src/wake.mjs:8
a11ign-board-report.service
a11ign-board-report.timer
a11ign-corpus-release-nightly.service
a11ign-corpus-release-nightly.timer
a11ign-corpus-snapshot.service
a11ign-corpus-snapshot.timer
a11ign-fleet-watch.service
a11ign-fleet-watch.timer
a11ign-lab-watch.service
a11ign-lab-watch.timer
a11ign-work-tick.service
a11ign-work-tick.timer
a11ign-worktree-prune.service
a11ign-worktree-prune.timer
board-report-dispatch.sh
gh
gh-leads-workspaces.txt
```

```
$ grep -H '^WorkingDirectory' packages/agent-org/host/*.service | sed 's#packages/agent-org/host/##'
a11ign-board-report.service:WorkingDirectory=/home/agent/repos/a11y-witness
a11ign-corpus-release-nightly.service:WorkingDirectory=/home/agent/repos/a11y-witness
a11ign-corpus-snapshot.service:WorkingDirectory=/home/agent/repos/a11y-witness
a11ign-fleet-watch.service:WorkingDirectory=/home/agent/repos/a11y-witness
a11ign-lab-watch.service:WorkingDirectory=/home/agent/repos/a11y-witness
a11ign-work-tick.service:WorkingDirectory=/home/agent/repos/a11y-witness
a11ign-worktree-prune.service:WorkingDirectory=/home/agent/repos/a11y-witness
```

**What the readings say.** `host` holds **17 entries: seven services each with a timer (14), and three others**
(`board-report-dispatch.sh`, `gh`, `gh-leads-workspaces.txt`); every service sets the same working directory (measured).
Separately, 11 non-test source files mention the fleet, the corpus, NVDA or lab jobs at least eight times each (the first
reading, pattern-counted, mostly comments and messages), **which no row has classified**.

**Decision:** **8 entries are the tool's, 8 are the project's, 1 is host data.** **The tool's:** `a11ign-work-tick`,
`a11ign-worktree-prune` and `a11ign-board-report` (each service and timer: 6), `board-report-dispatch.sh` and `gh`, the
routing wrapper (a mechanism whose account directories come from `host.json`). **The project's, which stay with a11ign and
move to `.agent-org/units/`:** the corpus-snapshot, corpus-release-nightly, fleet-watch and lab-watch units (each service and
timer: 8). **Host data:** `gh-leads-workspaces.txt`, the list of workspaces that act as the leads account, which becomes
`host.json`'s `gh.leadsWorkspaces` and is installed from it. The unit-name prefix (`a11ign-`) is a field, so the tool's
units are named by the project that installs them. **`host-units.mjs` records the partition** where it reads it, so a unit
is classified once and **an 18th entry classified nowhere is REFUSED.** The 11 source files are classified by 3e and 3f as
the first step of each, and the decision is by ownership, not by word count: `fleet-gated-nightly.mjs` is a11ign's by what
it does. Cost: a11ign's four units leave the tool's tree, so the tool's `host:check` reads two directories. Rejected: (a)
the four stay in the tool "for now" — a public tool that ships a11ign's corpus snapshot; (b) all 14 units are the tool's —
the tool would then name a11ign's lab.

**Size:** 17 entries classified (8 + 8 + 1); 11 source files to classify by row.

**Owner:** engineer (3f).

**Depends on:** decision 3.

### DECISION 10 — Timeline and critical path: the whole split is version one, and every duration says what it stands on

**RULED (#2615, `ceo`, 2026-09-26 08:45Z, on the chairman's ruling; recorded, not reopened):** "Road to version one" closes when the WHOLE split is done: `agent-org`, `screenreader-worker` (`nvda-worker` with `nvda-speech`), `screenreader-fleet`, `lab`, `control` and `documents` (`pdf`), each published package with its npm rename and its trusted-publisher re-bind (`documents` is a FIRST publish). `cli`, `judge`, `scorer` and `evidence` stay in `a11ign/a11ign`. **No move row has run yet, so every duration for one below is an estimate and says so.**

**Readings.** (*live* GitHub and host reads, taken at the time stated at the top; the scripts are printed at the end. They are numbered because the durations below cite them as `[reading N]`.)

```
$ bash edges.sh
#2612 blocked by: #2610
#2613 blocked by: #2612
#2615 blocked by: #2614
#2616 blocked by: #2615
#2617 blocked by: #2616
#2618 blocked by: #2616
#2619 blocked by: #2616
#2620 blocked by: #2616
#2621 blocked by: #2618 #2616
#2622 blocked by: #2621 #2620 #2619 #2618 #2617
#2623 blocked by: #2622
```

```
$ bash region-overlaps.sh
#2616 Region: 4 paths
#2617 Region: 10 paths
#2618 Region: 4 paths
#2619 Region: 5 paths
#2620 Region: 5 paths
#2621 Region: 5 paths
#2622 Region: 2 paths
#2623 Region: 2 paths
-- files shared by two filed Regions
#2616 & #2620: packages/agent-org/src/board-snapshot-scope.mjs 
#2618 & #2621: packages/agent-org/src/wake.mjs packages/agent-org/src/work-gate.mjs 
```

```
$ bash cycle.sh
#2610 2026-09-26T06:58:57Z -> 2026-09-26T07:55:22Z
#2614 2026-09-26T07:06:13Z -> 2026-09-26T08:23:11Z
merged PRs: 200  median 39 min  p90 111 min  max 1250 min
```

```
$ bash ledger-causes.sh
last 24h: 23 distinct causes fired
last 48h: 23 distinct causes fired
last 168h: 26 distinct causes fired
```

```
$ gh pr list --state open --limit 100 --json number,files --jq '[.[]|select(any(.files[]?; .path|startswith("packages/nvda-worker/src")))|"#\(.number)"]|join(" ")'
```

```
$ gh issue list --milestone 'Road to version one' --state open --limit 200 --json number,labels --jq '{open: length, backlog: ([.[]|select(any(.labels[]; .name=="backlog"))]|length)}'
{"backlog":9,"open":11}
```

```
$ grep -E '^(WorkingDirectory|ExecStartPre|ExecStart)=' packages/agent-org/host/a11ign-work-tick.service; grep -E '^(OnBootSec|OnUnitActiveSec)=' packages/agent-org/host/a11ign-work-tick.timer
WorkingDirectory=/home/agent/repos/a11y-witness
ExecStartPre=-/usr/bin/npm run primary:update
ExecStart=/usr/bin/node packages/agent-org/src/work-tick.mjs
OnBootSec=2min
OnUnitActiveSec=2min
```

```
$ for n in nvda-worker worker-fleet pdf; do echo "$n: $(git grep -l "@a11ign/$n\b" -- . ':!*.md' ':!docs' ':!package-lock.json' ':!pnpm-lock.yaml' | wc -l) files name it, $(git ls-files packages/$n | wc -l) files in the package"; done; git grep -lE 'trusted|provenance|id-token' -- .github/workflows
nvda-worker: 61 files name it, 124 files in the package
worker-fleet: 168 files name it, 107 files in the package
pdf: 26 files name it, 7 files in the package
.github/workflows/auto-arm.yml
.github/workflows/release.yml
.github/workflows/reusable-acceptance.yml
```

**(a) What gates what, read and not remembered.** The native `blockedBy` edges as filed (reading 1): 3a waits on this row; 3b, 3c, 3d and 3f wait on 3a; **3e waits on 3c and 3a; 4 waits on all five of 3b to 3f; 5 waits on 4.** The Regions as filed (reading 2) share only two files: `board-snapshot-scope.mjs` (3a and 3f) and `wake.mjs` with `work-gate.mjs` (3c and 3e), which is why 3e follows 3c. **The filed edges understate the plan, because they were read from Regions that decision 1 shows too small:** with 3g (which repoints 69 files, 33 of them 3d's) and 3d's real 43 files (10 shared with 3b and 3c), the edges become, **and `product-manager` adds them:** 3g on 3a; 3b, 3c and 3f on 3g; 3d on 3b, 3c and 3f; 3e on 3d (it already follows 3c); 4 on 3e; 5 on 4. The move rows wait on 5 (below).

**(b) The sets that run in parallel.** After 3a: 3g alone. After 3g: **3b, 3c and 3f together** (three rows, disjoint Regions), then 3d, then 3e, so `agent-org`'s critical path is **3a, 3g, 3c, 3d, 3e, 4, the shadow window, 5: seven rows and a window.** W (report wording) and the two npm renames are independent of the chain except that R2 (worker-fleet) waits for 3g, because 16 of the tool's import lines name `@a11ign/worker-fleet` (decision 7). After 5: **the three layer chains run in parallel**: R1 then M1 (`screenreader-worker`), R2 then M2 (`screenreader-fleet`), M5 then M6 (`documents` then `cli`'s dependency); then M3 (`lab`) and M4 (`control`) together, because `lab` holds 182 of the 231 guards and they reach into everything (`ceo`, 08:45Z, from child 0's baseline). **Why the move rows wait for 5 is a ruling and an inference, not a reading:** a layer repository's pull requests must be visible to the gate (3c), and the machinery should be extracted once, not twice.

**(c) Ranges, each with what it stands on and what it does NOT know.**

**`agent-org` out: 3 to 5 days.**

**Stands on:** seven chain rows and a window (b). A path row is priced at **3 to 8 hours** (an ASSUMPTION anchored by the two split rows that ran, 57 and 77 minutes filing to close, both documents-only and smaller than 3c, and by PR open-to-merge, median 39 and p90 111 minutes over the newest 200 merged: reading 3). Seven rows at 3 to 8 hours is 21 to 56 hours; a p90 review-and-merge wait per row adds about 13; the 48-hour window adds 48: **82 to 117 hours, 3.4 to 4.9 days** (arithmetic over the labelled inputs, not a measurement).

**Does not know:** how long a 43-file row (3d) or a gate-file row (3c) takes, since none has run; how often a row goes back for review; whether a clear window is needed on the files 3g repoints (69 files, so B4 will refuse a claim on any of them while 3g is open); merge-queue delay at load (the p90 above is from a quiet day, the max was 1,250 minutes).

**Whole split: 6 to 16 days, LOW confidence.**

**Stands on:** the `agent-org` range, then the longest layer chain **R1, M1, M3** at 1 to 3 days per move row (an ASSUMPTION: a history rewrite, a public repository's protection read back behaviourally, the first release from it), plus the chairman's two steps on that chain (R1 and M1) at 0 to 2 days each. **3 to 5, plus 3 to 7 for the chain, plus 0 to 4 for the two chairman steps = 6 to 16.**

**Does not know:** any move row's real duration; **the chairman's turnaround** on an npm re-bind or the first publish; **whether the window #69 requires on the package is clear: one open pull request touches `packages/nvda-worker/src` today (reading 5), and a claimed SaaS row holds Regions that never appear as a pull request**; hosted-runner loss (`ceo` names it); and whether 3d's 43 files or 3e's 33 moved files land cleanly.

**Milestone distance today:** "Road to version one" holds 12 open rows, 11 of them `backlog` (reading 6); the filed rows plus the eleven new ones the appendix lists (3g, W and nine move rows) are the honest distance, which is why the move rows are filed under it.

**Shadow window: 1,440 ticks (48 hours at the two-minute period, reading 7), CHOSEN not measured.** It is the one duration no row-cycle time predicts. **The measurement does not discriminate between 24 and 48 hours: 23 distinct gate causes fired in the last 24 hours and the same 23 in the last 48, against 26 in seven days (reading 4)**, so 24 hours (720 ticks) covers exactly what 48 does today and `ceo` may shorten it without contradicting this reading; 48 is chosen to include two passes of the scheduled nightly work (*inferred*), and decision 5's rule stands that the diff record NAMES any cause of the 26 that did not fire in the window (three, on this reading) and why.

**Durations, each with its measured input or the word UNMEASURED:**

- **DURATION split rows that ran (#2610, #2614), filing to close:** 57 and 77 minutes [reading 3].
- **DURATION pull request open to merge:** median 39 minutes, p90 111 minutes, max 1,250 minutes over the newest 200 merged [reading 3].
- **DURATION gate tick period:** 2 minutes [reading 7].
- **DURATION distinct causes fired in a window:** 23 in 24 hours, 23 in 48 hours, 26 in 7 days [reading 4].
- **DURATION shadow window:** 1,440 ticks (48 hours), CHOSEN; the coverage it buys is [reading 4].
- **DURATION a path row (3a to 3g, 4, 5):** 3 to 8 hours each, an ASSUMPTION, UNMEASURED (no path row has run).
- **DURATION `agent-org` out:** 3 to 5 days, ARITHMETIC over the two lines above, UNMEASURED as a whole.
- **DURATION a move row (R1, R2, M0 to M6):** 1 to 3 days each, UNMEASURED (no move row has run; sizes are in [reading 8]).
- **DURATION a chairman step:** 0 to 2 days, UNMEASURED.
- **DURATION whole split:** 6 to 16 days, LOW confidence, UNMEASURED as a whole.

**UNMEASURED, listed:** every move-row duration (R1, R2, M0 to M6); a path row's duration for a row the size of 3c or 3d; the chairman's turnaround on an npm re-bind and on the first publish; the merge-queue delay at load; the reviewer's latency on a 69-file pull request; whether the window on `packages/nvda-worker/src` is clear when M1 is claimed; and the shadow window's sufficiency (it is chosen). **Sizes that ARE measured** (reading 8): renaming `nvda-worker` touches 61 files by name, `worker-fleet` 168, `pdf` 7 in the package and 26 by name; the workflow files that publish are `release.yml`, `auto-arm.yml` and `reusable-acceptance.yml`, and **`release.yml`'s filename is what a trusted publisher is bound to**, so each new repository's release workflow filename is part of its move row.

**`documents`' first publish is on the critical path of the next `a11ign` release.** `@a11ign/pdf` has never been published, so there is no old package to rename or re-bind, and the published `a11ign@0.1.0` does not depend on it while `packages/cli/package.json:25` does:

```
$ grep -n '"@a11ign/pdf"' packages/cli/package.json; timeout 30 npm view @a11ign/pdf version 2>&1 | head -2; timeout 30 npm view a11ign@0.1.0 dependencies 2>&1 | head -8; git log --no-merges --since=2026-09-10 --format=%h -- packages/pdf | wc -l
25:    "@a11ign/pdf": "0.0.0",
npm ERR! code E404
npm ERR! 404 Not Found - GET https://registry.npmjs.org/@a11ign%2fpdf - Not found
{
  '@a11ign/evidence': '0.1.0',
  '@a11ign/judge': '0.1.0',
  '@a11ign/scorer': '0.1.0',
  '@a11ign/worker-fleet': '0.1.0',
  yaml: '^2.9.0'
}
1
```

So the next `a11ign` release cannot be installed until `@a11ign/documents` is on the registry, and the order is `ceo`'s: move `pdf` (M5), publish `0.1.0` from `a11ign/documents`, then `cli` depends on it by version range (M6), and only then can `a11ign` release again. **The empty repositories:** `agent-org`, `screenreader-worker`, `screenreader-fleet`, `lab`, `control` and `documents` all exist, empty and public; **this ADR renames or deletes none of them**, decision 4 places `guards` with the product so it needs none, and `lab` and `control` are in the version-one ruling and exist as placeholders: this ADR renames neither, and what stays in the product from `lab` (the guards it needs) is decision 4's.

**Decision:** The plan is the chain in (b), the ranges in (c) and the 1,440-tick window, **and the milestone's open count is its distance**: on merge `product-manager` files the eleven new rows (3g, W, R1, R2 and M0 to M6) under "Road to version one", each blocked by a native edge, and revises the ranges from the first path row that closes. Cost: the timeline is dominated by inputs this ADR cannot measure, and it says so rather than narrowing the range. Rejected: (a) one figure per range, which would be an assumption dressed as a reading; (b) starting the move rows before 5, which extracts the machinery twice; (c) a window of 24 hours, which is not contradicted by the reading and is `ceo`'s to choose.

**Owner:** `product-manager` for the rows and edges; engineer for each row.

**Depends on:** decisions 1 to 9.

### DECISION 11 — The three asks of #69 (07:53Z): a trigger for `evidence`, the report-wording check, and `scorer`'s placement

**Recorded from the chairman's rulings (#69, 07:53Z, 08:01Z); the asks are his and the answers are the ADR's.** Readings are under each part.

**Decision:** three answers, each below: **a trigger with a number and a unit** (28 consecutive days), **the pasted report-wording check** (it lives in `evidence`; moving it is not free), and **`scorer`'s placement** (it stays until the trigger fires, then leaves first, into its own repository).

#### (a) — a trigger for splitting `evidence` out, and the read-only-mirror option

**Readings.**

```
$ for c in $(git log -G'export const CAPTURE_PROTOCOL_VERSION *=' --no-merges --format=%h -- packages/nvda-worker/src/protocol-version.mjs); do echo "$(git log -1 --format=%ad --date=short $c) $(git show $c:packages/nvda-worker/src/protocol-version.mjs | grep -oE 'CAPTURE_PROTOCOL_VERSION *= *[0-9]+')"; done | sort
2026-09-05 CAPTURE_PROTOCOL_VERSION = 15
2026-09-06 CAPTURE_PROTOCOL_VERSION = 16
2026-09-11 CAPTURE_PROTOCOL_VERSION = 17
2026-09-13 CAPTURE_PROTOCOL_VERSION = 18
2026-09-19 CAPTURE_PROTOCOL_VERSION = 19
2026-09-20 CAPTURE_PROTOCOL_VERSION = 20
2026-09-22 CAPTURE_PROTOCOL_VERSION = 21
2026-09-26 CAPTURE_PROTOCOL_VERSION = 22
```

```
$ git log -1 --format='%ad %h' --date=short -G'export const CAPTURE_PROTOCOL_VERSION *=' -- packages/nvda-worker/src/protocol-version.mjs
2026-09-26 854573414
```

```
$ git log --no-merges --since=2026-08-15 --format='%ad' --date=format:'%G-W%V' -- packages/evidence/src | sort | uniq -c
      2 2026-W34
     31 2026-W35
     21 2026-W36
     33 2026-W37
     11 2026-W38
     15 2026-W39
```

```
$ grep -l '"@a11ign/evidence"' packages/*/package.json | sed 's#/package.json##' | tr '\n' ' '; echo
packages/cli packages/evidence packages/judge packages/lab packages/nvda-worker packages/scorer packages/worker-fleet 
```

**What the readings say (measured).** **The protocol constant is owned by `nvda-worker`, not `evidence`** (the readings name
its file), and it rose from 15 to 22 in 21 days, **eight values, the longest gap between two bumps being 6 days**
(13 to 19 September). `evidence` itself takes **11 to 33 non-merge commits a week (five full weeks: 31, 21, 33, 11, 15)** and
six packages declare it. The chairman's reading (the volatile package is the most depended-on) holds on these numbers, with
the correction that the volatile NUMBER lives in the worker.

**Trigger:** **28 consecutive days, and it is the conjunction of two commands and it is not met today:** `CAPTURE_PROTOCOL_VERSION` unchanged
for those 28 days (4.7 times the longest gap above; today's reading is `0` days, the last bump being 2026-09-26),
**and fewer than 10 non-merge commits a week to `packages/evidence/src` in each of those four weeks** (below every one of the
last five weeks). **The numbers are CHOSEN, not measured**; what is measured is the history they are set against. `product-manager`
reads the two commands at each release and files the split row when both hold; **no gate cause is added** (a cause touches
four places, `a-new-gate-cause-touches-four-places`). **The read-only-mirror option (develop in-repo, publish to a repository
that takes only pushes from a workflow) is NOT built now**: `@a11ign/evidence` is already on the registry
(`a11ign@0.1.0` depends on `@a11ign/evidence` 0.1.0), so the registry is the artifact mirror, and a source mirror adds
discoverability only; **it becomes the option to take if a consumer outside this repository needs the source's history
before the trigger fires.** Cost of the mirror when taken: a workflow, a push credential, and a repository with Issues and
PRs disabled (the Kubernetes staging pattern, *external knowledge*). Rejected: (a) split now — the ruling's own reason
(every bump becomes a coordinated multi-repository release); (b) a trigger on calendar time alone — churn also has to fall.

#### (b) — does report wording live in `evidence`?

**Readings.**

```
$ for c in b95749f3b 5fc101392 74942469a edbb6ca92; do git show --stat=110 --format=%h $c -- packages/evidence/src packages/cli/src | grep -v test.ts | grep -v changed | cut -c1-100 | sed '/^ *$/d'; done
b95749f3b
 packages/cli/src/report.ts      | 19 ++++++++++++++++++-
5fc101392
 packages/cli/src/report.ts                | 26 +++++++++++++++++++++--
 packages/evidence/src/conformance.ts      | 41 +++++++++++++++++++++++++++++++++---
74942469a
 packages/cli/src/report.ts                |  4 ++++
 packages/evidence/src/conformance.ts      | 20 +++++++++++++++++++-
edbb6ca92
 packages/evidence/src/conformance.ts      |  2 +-
```

```
$ sed -n 53,60p packages/evidence/src/conformance.ts | cut -c1-118; git grep -nE '^\s*(establishes|limitation):' -- packages/evidence/src/conformance.ts | wc -l
const SWEEP_STOP_GLOSS: Record<Exclude<SweepStop, "exhausted" | "repeat">, string> = {
  cap: "hit its own step limit before reaching the end of the page",
  deadline: "the capture's overall time budget ran out mid-sweep",
  error: "a round trip to the screen reader failed",
  silent: "no new speech arrived after retries, cause unknown",
  channelReset: "the screen reader's speech log was rebuilt mid-sweep, breaking continuity with what came before",
  focusModeStuck: "the page trapped keyboard focus and the sweep could not recover control of it",
};
22
```

```
$ for f in $(git ls-files 'packages/evidence/src/*.ts' | grep -v '\.test\.'); do n=$(grep -cE "[\"\`'][A-Za-z][^\"\`']{40,}[\"\`']" $f); [ "$n" -gt 0 ] && echo "$n $f"; done | sort -rn | head -5
65 packages/evidence/src/conformance.ts
40 packages/evidence/src/verify.ts
12 packages/evidence/src/announcement.ts
7 packages/evidence/src/left-site.ts
3 packages/evidence/src/document-identity.ts
```

```
$ git grep -lE '\.(limitation|establishes)\b' -- packages ':!*.test.*' ':!*.md' ':!*/fixtures/*' | tr '\n' ' '; echo; git grep -lE '"(limitation|establishes)"' -- packages/cli/src/fixtures | wc -l
packages/cli/src/action/summary.ts packages/cli/src/report.ts 
3
```

**Answer: YES, and moving it is not free.** Three of the four report-jargon rounds edited `packages/evidence/src/conformance.ts`
(the first reading is the four commits: #1851 touched only `cli`; #1855, #1873 and the #1881 fix each touched
`conformance.ts`). The file holds `SWEEP_STOP_GLOSS`, **six display strings**, and **22 `establishes:`/`limitation:`
assignments**, the two prose fields of the `ConformanceRequirement` contract; 65 string literals in `conformance.ts` and 40 in
`verify.ts` are sentence-length (pattern-counted, *inferred* to be display text). **The six glosses are interpolated into
`limitation`** (`… (silent -- no new speech arrived…)`), the sentence `cli` prints verbatim (`report.ts`, `action/summary.ts`,
the only two consumers) and three recorded result fixtures carry. **So the chairman's "no split cost" is half right:** the
coupling is real (a wording round costs an `evidence` change and, split, a cross-repository release), **but moving the six
glosses to `cli` changes the text of a contract field.** **Wording:** file ONE row (W, appendix): `evidence` reports each
stop as data (type and stop code, already in `SweepOutcome`), `cli` owns the six glosses and composes the clause, and
`limitation` keeps its sentence for one release; the 22 prose assignments are classified by that row and are NOT moved
(they are the contract's own statements of what a run established and did not, ADR 0037). Cost: an additive contract change and a text change to one
sentence. Rejected: (a) move all 28 strings — the 22 are the contract's statements, not wording; (b) leave it until the split —
each wording round then costs a cross-repository release.

#### (c) — `scorer`'s placement

**Reading.**

```
$ node -e "const p=require('./packages/scorer/package.json');console.log(JSON.stringify(p.dependencies))"; grep -l '"@a11ign/scorer"' packages/*/package.json | sed 's#/package.json##' | tr '\n' ' '; echo; git grep -lE '@a11ign/scorer|packages/scorer|\.\./scorer/' -- packages scripts ':!packages/scorer' ':!*.test.*' ':!*.md' | sed 's#^\(packages/[^/]*\)/.*#\1#;s#^scripts/.*#scripts#' | sort | uniq -c
{"@a11ign/evidence":"0.0.0"}
packages/cli packages/judge packages/lab packages/scorer 
      3 packages/cli
      3 packages/control
      2 packages/judge
     31 packages/lab
      2 packages/worker-fleet
      3 scripts
```

**Placement:** **`scorer` stays in `a11ign/a11ign` until the decision 11 (a) trigger fires, then it is the FIRST to leave, into its OWN
repository, `a11ign/screenreader-scorer`, NOT into `screenreader-worker`.** Measured: its only in-repo dependency is
`evidence`, so it cannot leave before `evidence` is stable (the Stable Dependencies Principle the chairman cited); 31 `lab`
files, and three each in `cli` and `control`, import it, so the trigger row is a large one. ADR 0036 places it in the
screen-reader layer and **this ADR agrees on the LAYER and separates the REPOSITORY**: it is a Python subprocess over model
artifacts (ADR 0032) on a training cadence, not the capture cadence of the worker. No repository is created now.
Rejected: (a) with `screenreader-worker` — two toolchains and two release cadences in one repository; (b) now — it would
depend on an unstable `evidence`.

**Owner:** `product-manager` (reads the trigger at each release and files W); engineer (W).

**Depends on:** decision 4 (which packages stay together).

## The sum

**Sum:** the extraction of `agent-org` is **10 rows**: the eight filed (3a to 3f, 4, 5), **3g** (cut the nine outward edges, 69 files), and **W**
(report wording, 4 files); **the rest of the split is 9 MOVE rows** (R1, R2, M0 to M6, decision 10), so **19 rows in all, 11 of them not yet filed**, and the milestone's open count is the distance. **The order the measurements set:** 3a first (the reader), then 3g (it repoints imports in 69 files,
so nothing else may be editing them); **then 3b, 3c and 3f in parallel** (their Regions are disjoint: `row-claim/`,
`work-gate`/`wake`, and the host files); **then 3d**, which is 43 files and shares 10 with 3b and 3c and `host-units.mjs` with 3f;
**then 3e**, which edits the same gate files and moves 33 role files; then 4 and 5. W is independent and can run at any time.

**First two:** 3a and 3g, in that order.

**Where the rows are larger than they were filed (measured):** 3d is **43 files, not 4** (the row said twelve of them carried a
word); 3e **moves 33 files** and repoints 37, and **one gate cause, not many, is a11ign's**; 3f **moves 8 unit files**; 3g did not exist.

## Consequences (including the ones the chairman will not like)

1. **The extraction is 10 rows and longer than the epic's 8, and the whole split is 19.** 3g and W were not filed; 3d is roughly ten times its filed size;
   the chain is serial in three places (3a, 3g, then 3d, 3e). The measured overlap (10 of 43 files shared with 3b and 3c) is why
   it cannot be shortened by starting them together.
2. **936 lines are duplicated in seven files, with no cross-repository pin**, and `cli-flags` has changed 9 times. The falsifier
   below is the tripwire; the alternative is a published package, which is a chairman step.
3. **Every change that touches both the tool and a11ign's declaration is two pull requests in two repositories**, reviewed by one
   pool of reviewers, and the tool tracks `main`: **a defect merged to the tool reaches every project within two minutes.**
4. **A second `main` needs an approving review**, so the reviewer pool's scope doubles, and `bots` holds `admin` on `agent-org`
   until the read-back (decision 6).
5. **The tool's first merge is unverified against the token** until it happens (the token is taken on the chairman's word); nothing
   needing `close-rows` or `trunk-guard` is claimed to work in `agent-org` before then.
6. **A 48-hour shadow window, and two copies of the machinery installed at once**, until a separate removal row.
7. **The fixture project is written by the tool's authors** and cannot prove GitHub's side (decision 8); a second real project is
   the stronger proof and is not ruled.
8. **The fourth surface is not the whole a11ign residue:** eleven source files mention the fleet or corpus at least eight times
   and are unclassified (decision 9); the rows classify them, and a file that is a11ign's by what it does stays a11ign's.
9. **The wording move is not free** (decision 11 (b)): a contract text changes.

## Alternatives rejected

- **`agent-org` stays in the monorepo and is only configured.** Ruled out by the chairman (#69, 06:58Z); the ADR's job is the
  boundary, not the reversal.
- **A copy of the tool per project (a fork).** Every project would carry its own drift; the only reading available (`g-cochange`)
  shows the tool changing 309 times in five weeks, which no fork keeps up with.
- **YAML, a `package.json` field or a `.mjs` module for the declaration** (decision 1).
- **A tick per project; always-qualified names** (decision 2).
- **A pinned tool version per project; an npm package; a submodule** (decision 3).
- **`guards` moves wholesale; `guards` is published; the tool imports the product** (decision 4).
- **Copy the state at cut-over; a big-bang cut; two writers** (decision 5).
- **Create the ruleset before the first push; a placeholder commit; accept the fallback silently** (decision 6).
- **Relicense in place; keep AGPL; a licence exception** (decision 7).
- **The sandbox repository; the property test** (decision 8).
- **All 28 evidence strings move to `cli`; split `evidence` now; `scorer` beside the worker** (asks).

## What would falsify this

1. **A second project needs a change to the tool's CODE, not to its declaration or a plugin, to run.** The fixture project is
   the first place this shows: if a fixture field cannot be JSON, decision 1's line is in the wrong place.
2. **The shadow diff is not empty for the window for a reason that is not timing**: the extracted gate does not read what the live
   one reads, and decision 5's window is too short or the extraction is wrong.
3. **A line the new code writes for the primary project differs in bytes from the one the old code writes**: decision 2's "no
   conversion" is false, and rollback is not a unit edit.
4. **Any of the seven copies is edited in the product after the extraction** (`git log` on the originals): the copies have begun to
   drift, and the published package the ADR rejected is the answer.
5. **The first merge in `agent-org` runs no `close-rows` or `trunk-guard` although the token is granted**: decision 6's
   precondition is wrong.
6. **The relicensing check, re-run at the extraction commit, finds an import into an AGPL file, or an author outside the org's
   accounts**: decision 7.
7. **`reviewDecision` on the smoke PR reads empty**: the requirement does not bite, and no real PR merges (decision 6).
8. **Both conditions of decision 11 (a) hold and the split row is not filed**, or **either is met and a bump follows within the week**: the
   trigger's numbers are wrong.

## Appendix: the eight children confirmed or amended, the two rows the decisions found, and the nine MOVE rows

**How to read this.** Each entry names the row, gives a **Verdict** (CONFIRMED, or AMENDED with what changed and the decision
that changed it), and then holds the row's `## Region`, `## Acceptance` and `## Done-when` **as they should read once amended**, in
a fenced block `product-manager` can paste. A Region names files that exist or are reserved by the row; where a list is long it is
the output of the command in the row, taken at `46b59abf0`, and **the claimant re-runs the command at claim time** (a Region is a
reading at a moment). Every Acceptance command below is the shape the filed rows use (`npx rstest run --config
scripts/rstest/rstest.config.mjs --include <file>`); a NEW test file is named and is created by its row. **The order is 3a, 3g, then
3b, 3c and 3f in parallel, then 3d, then 3e, then 4, then 5; W is independent.** Native `blocked-by` edges to add:
3g on 3a; 3b, 3c and 3f on 3g; 3d on 3b, 3c and 3f; 3e on 3d; 4 on 3e; 5 on 4. **The MOVE rows follow 5** (each names its own blockers and its **Chairman step**, or says none, which `product-manager` copies into the row's first paragraph and `needs:chairman` where a step is the chairman's): R1 and R2 (the npm renames) then M1 and M2 (the two layers), M5 then M6 (`documents`, then `cli`), M3 and M4 (`lab`, `control`), M0 (the removal). Every move row is filed under "Road to version one" and blocked by a native edge, so the milestone's open count is the distance to version one (decision 10).

### CHILD 3a (#2616): the configuration seam

**Verdict: AMENDED, small.** Decision 1 fixes the file (`.agent-org/project.json`, JSON) and decision 2 the keys, so the Region
gains the declaration and the reader must refuse the key rules; nothing about its shape or its "moves no importer" rule changes.

````markdown
## Region

```
.agent-org/project.json
packages/agent-org/src/project-config.mjs
packages/lab/src/packaging/project-config.test.ts
scripts/repo-identity.mjs
packages/agent-org/src/board-snapshot-scope.mjs
```

`.agent-org/project.json` is a11ign's declaration (ADR 0040, decision 1); its `tracker` and `code` lists each hold ONE entry,
`a11ign/a11ign`, with the EMPTY key (decision 2), until #2612's layer repositories exist.

## Acceptance

```bash
npx rstest run --config scripts/rstest/rstest.config.mjs --include packages/lab/src/packaging/project-config.test.ts
npx rstest run --config scripts/rstest/rstest.config.mjs --include packages/lab/src/packaging/repo-identity-consolidated.test.ts --include packages/lab/src/packaging/board-snapshot-scope.test.ts
```

**The new test must show:** the a11ign declaration, read through the reader, gives exactly today's values (`a11ign/a11ign`, owner
`a11ign`, board 1) so nothing moved; a SECOND fixture project (another owner, repository and board number) gives ITS values
through the same reader; and each of these is REFUSED naming the field, never answered with a11ign's values: a missing
declaration, a missing field, a mistyped field, an unknown `schema`, two entries with the same key, a key ending in `-<digits>`, and
the empty key declared twice. **Positive controls, in the test file:** the a11ign declaration is asserted non-empty and holds the empty
key exactly once, and each refusal is shown to fail for the named field and not an unrelated one. The second command is the two
existing suites, unchanged and green. The count of non-test files in `packages/agent-org/src` carrying `a11ign/a11ign` is recorded and
asserted NOT to grow.

## Done-when

1. One reader returns the project's trackers, code repositories (each `{key, repo}`), board owner and number from
   `.agent-org/project.json`; `REPO` and the board constants are computed from it and the 31 importers are unchanged.
2. The two existing suites pass unchanged; the new test shows a second project resolving through the same reader and every refusal above.
3. The closing comment gives the count of non-test files in `packages/agent-org/src` still carrying `a11ign/a11ign`.
````

### CHILD 3g (NEW, ready to file): cut the nine outward edges

**Verdict: NEW.** Nothing filed cuts the tool's imports out of the product tree, and child 5's own Acceptance ("no edge in either
direction") needs it (decision 4). **It goes right after 3a and before every other row of the chain**, because it repoints imports in 69
files, 33 of which are also in 3d's 43 (`comm`, measured), and nothing else may be editing them.

````markdown
## What it is

**Child 3g of #69: the tool stops importing the product tree.** `agent-org` imports NINE files by relative path (ADR 0040, decision 4,
`outward.mjs`): `worker-fleet/src/cli-flags`, `guards/src/{git-env, changed-files, local-import-closure, worktree-resolution}`,
`scripts/{repo-identity, npm-cli-executable, product-home}` and `lab/src/packaging/leak-patterns`. **Copy seven into
`packages/agent-org/src/lib/`** (each header naming the commit it was copied from and carrying no other change), **replace
`repo-identity` by 3a's reader** (the product's own scripts keep theirs), and **split `leak-patterns`**: its two generic patterns
become the tool's, its two a11ign-specific ones become entries of the declaration's `leakPatterns`. Repoint the 69 importing files.
The product keeps every original. **It changes no behaviour.**

## Region

```
packages/agent-org/src/lib/cli-flags.mjs
packages/agent-org/src/lib/git-env.mjs
packages/agent-org/src/lib/changed-files.mjs
packages/agent-org/src/lib/local-import-closure.mjs
packages/agent-org/src/lib/worktree-resolution.mjs
packages/agent-org/src/lib/npm-cli-executable.mjs
packages/agent-org/src/lib/product-home.mjs
packages/agent-org/src/lib/leak-patterns.mjs
packages/lab/src/packaging/agent-org-outward-edges.test.ts
packages/agent-org/src/acceptance-commands.mjs
packages/agent-org/src/arm-pr.mjs
packages/agent-org/src/auto-arm-sweep.mjs
packages/agent-org/src/board-data.mjs
packages/agent-org/src/board-discussion.mjs
packages/agent-org/src/board-document.mjs
packages/agent-org/src/board-record.mjs
packages/agent-org/src/board-report.mjs
packages/agent-org/src/board-schedule-liveness.mjs
packages/agent-org/src/board-snapshot-scope.mjs
packages/agent-org/src/board-snapshot.mjs
packages/agent-org/src/board-summary-check.mjs
packages/agent-org/src/branch-inventory-report.mjs
packages/agent-org/src/carry-branch.mjs
packages/agent-org/src/claim-provenance.mjs
packages/agent-org/src/claim-stall.mjs
packages/agent-org/src/close-rows-for-merged-pr.mjs
packages/agent-org/src/close-rows-sweep.mjs
packages/agent-org/src/closes-mismatch-check.mjs
packages/agent-org/src/control-plane-hygiene.mjs
packages/agent-org/src/fleet-gated-nightly.mjs
packages/agent-org/src/host-units.mjs
packages/agent-org/src/mark-primary-checkout.mjs
packages/agent-org/src/merge-guard.mjs
packages/agent-org/src/merge-guard/armed-race-rule.mjs
packages/agent-org/src/merge-guard/lookups.mjs
packages/agent-org/src/merge-guard/merge-ref-staleness-rule.mjs
packages/agent-org/src/merge-guard/reconciliation.mjs
packages/agent-org/src/merge-queue.mjs
packages/agent-org/src/org-watch.mjs
packages/agent-org/src/owned-path-signoff.mjs
packages/agent-org/src/parent-recheck-summary.mjs
packages/agent-org/src/pr-hold.mjs
packages/agent-org/src/pr-open.mjs
packages/agent-org/src/prompt-session.mjs
packages/agent-org/src/prune-tmp.mjs
packages/agent-org/src/prune-worktrees.mjs
packages/agent-org/src/queue-stalled.mjs
packages/agent-org/src/queue-table.mjs
packages/agent-org/src/ready-label-audit.mjs
packages/agent-org/src/reconstitution-drill.mjs
packages/agent-org/src/region-paths.mjs
packages/agent-org/src/rescue-hunk.mjs
packages/agent-org/src/row-claim.mjs
packages/agent-org/src/row-claim/blocked-by-edge-rule.mjs
packages/agent-org/src/row-claim/blocked-by-rule.mjs
packages/agent-org/src/row-claim/file-overlap-rule.mjs
packages/agent-org/src/row-claim/own-pr-health-rule.mjs
packages/agent-org/src/row-claim/stale-rule-guard.mjs
packages/agent-org/src/row-claim/template-fields-rule.mjs
packages/agent-org/src/row-file.mjs
packages/agent-org/src/row-reachability.mjs
packages/agent-org/src/settle-closed-rows.mjs
packages/agent-org/src/stash-whose.mjs
packages/agent-org/src/stranded-branches.mjs
packages/agent-org/src/token-audit.mjs
packages/agent-org/src/tracker-comment.mjs
packages/agent-org/src/trunk-red.mjs
packages/agent-org/src/trunk-revert-guard.mjs
packages/agent-org/src/trunk-sweep.mjs
packages/agent-org/src/update-branch-sweep.mjs
packages/agent-org/src/update-primary.mjs
packages/agent-org/src/wake.mjs
packages/agent-org/src/work-gate.mjs
packages/agent-org/src/work-gate/pr-orders.mjs
packages/agent-org/src/work-tick.mjs
packages/agent-org/src/worker-profile.mjs
packages/agent-org/src/workflow-run-liveness.mjs
packages/agent-org/src/worktree-owner.mjs
```

The last 69 lines are `node outward-files.mjs` (the ADR's `outward.mjs` printing the importers) at `46b59abf0`; the claimant re-runs it at
claim time. **Commit in slices of at most 12 files** (the pre-commit cap); one pull request.

## Acceptance

```bash
npx rstest run --config scripts/rstest/rstest.config.mjs --include packages/lab/src/packaging/agent-org-outward-edges.test.ts
npm run test:org
```

**The new test must show:** a walk of `packages/agent-org/src` finds NO relative or `@a11ign/` import that resolves outside
`packages/agent-org/`, comments excluded; each of the seven copies is byte-identical to its original apart from its header; the
tool's leak policy holds the two generic patterns and the declaration's `leakPatterns` holds the two a11ign ones; and the union equals
the product's `leak-patterns.mjs` set. **Positive control, in the test file:** a fixture package with ONE import across the boundary is
REFUSED naming both ends, so a walk that finds no edge is not read as a clean tree; and the walk is shown to find the nine edges on a
copy of the tree at `46b59abf0`'s shape.

## Done-when

1. `node outward.mjs` (ADR 0040) prints no target and reports 0 files with an outward import.
2. The 7 copies carry a header naming their origin commit; the product's originals are untouched.
3. `npm run test:org` passes, unchanged in what it asserts.
4. The closing comment lists the seven files and their line counts (936 lines in total at `46b59abf0`), so the drift tripwire in ADR
   0040 has a baseline.

## Not in this row

Any change to what a moved file does; the product's `guards`; publishing anything; the extraction.

## Fleet

No.
````

### CHILD 3b (#2617): the claim rules, B4 and `pr-open` read every repository the project declares

**Verdict: AMENDED.** The names follow decision 2 (the key grammar), the claim's worktree and session names are qualified for a
non-primary key, and the Region gains nothing but the blocked-by edges change: after 3g, and before 3d (10 of 3d's files are 3b's or
3c's).

````markdown
## Region

```
packages/agent-org/src/row-claim.mjs
packages/agent-org/src/row-claim/file-overlap-rule.mjs
packages/agent-org/src/row-claim/blocked-by-edge-rule.mjs
packages/agent-org/src/row-claim/blocked-by-rule.mjs
packages/agent-org/src/row-claim/own-pr-health-rule.mjs
packages/agent-org/src/row-claim/template-fields-rule.mjs
packages/agent-org/src/region-paths.mjs
packages/agent-org/src/pr-open.mjs
packages/agent-org/src/acceptance-commands.mjs
packages/lab/src/packaging/multi-board-claim.test.ts
```

Ten files, under the 12 a commit may stage. `acceptance-commands.mjs` is large and shared: edit ONLY the `Closes` extraction, because
`classifyCommand` also reaches `pr-open` and a change to it charges every row's Acceptance.

## Acceptance

```bash
npx rstest run --config scripts/rstest/rstest.config.mjs --include packages/lab/src/packaging/multi-board-claim.test.ts
npx rstest run --config scripts/rstest/rstest.config.mjs --include packages/lab/src/packaging/row-claim-file-overlap-rule.test.ts --include packages/lab/src/packaging/row-claim.test.ts --include packages/lab/src/packaging/pr-open.test.ts --include packages/lab/src/packaging/region-paths.test.ts
```

**The new test must show, one fixture each:** with a declaration listing two code repositories, a claim whose Region overlaps a file
changed by an open pull request in the SECOND is REFUSED naming that repository and pull request; a Region path with a repository
prefix (`nvda-worker:src/x.ts`) is read as that key's path and a bare path as the first repository's; a failed read of the second
repository is INCONCLUSIVE and never "no overlap"; **the same row number in two trackers yields two different worktree names and two
different `session:` labels (decision 2's grammar: `wt-<n>` for the empty key, `wt-<key>-<n>` otherwise)**; the merge-blocking parser
ACCEPTS `Closes a11ign/a11ign#7` and REFUSES a malformed cross-repository form. **Positive controls, in the test file:** the same claim
with only the first repository declared PASSES, so a reader that refuses everything is not read as reading two boards; and the
accepted form is one the parser's own extractor returns. The second command is the four existing suites, unchanged and green.

## Done-when

1. B4 reads every declared code repository's open pull requests and the test refuses an overlap that lives only in the second.
2. `Closes owner/repo#N` is accepted by the merge-blocking parser and by `pr-open`, shown by running both on it; the row's comment pastes the run.
3. A claim in a non-primary key names its worktree and session with that key and a primary claim's names are byte-identical to today's.
4. The four existing suites pass unchanged.
5. The closing comment says how many `gh` calls one claim now spends per declared repository, so 3c and the API budget rule can read it.
````

### CHILD 3c (#2618): the gate and wake enumerate every repository, and a seat name cannot collide

**Verdict: AMENDED.** Decision 2 names the grammar the row must implement, and the reading found the reviewer seat is built in ONE place,
`review-attribution.mjs`, which the filed Region omitted. The gate takes a LIST of declarations (decision 2: one tick over every project
the host lists); until 3f's `host.json` exists the list has one element.

````markdown
## Region

```
packages/agent-org/src/work-gate.mjs
packages/agent-org/src/work-gate/pr-orders.mjs
packages/agent-org/src/wake.mjs
packages/agent-org/src/review-attribution.mjs
packages/lab/src/packaging/multi-board-gate.test.ts
```

`wake.mjs` and `work-gate.mjs` are the two largest files in the package: edit the enumeration and the naming and nothing else, and run the
new gate code once against the live read-only reads before the first push (HOME pointed at a scratch directory, `wake` never run), because a
test double accepts any argument list.

## Acceptance

```bash
npx rstest run --config scripts/rstest/rstest.config.mjs --include packages/lab/src/packaging/multi-board-gate.test.ts
npx rstest run --config scripts/rstest/rstest.config.mjs --include packages/lab/src/packaging/work-gate.test.ts --include packages/lab/src/packaging/wake.test.ts --include packages/lab/src/packaging/work-gate-split-b4.test.ts
```

**The new test must show:** with two projects, one open pull request in each with the SAME number yields two distinct reviewer seat names
(`reviewer-<n>` and `reviewer-<key>-<n>`), two distinct cause keys and two distinct ledger keys (`<n>` and `<key>#<n>`); **a recorded
sample of today's live ledger lines (keys of the shapes `…/N`, `…/row-N`, `…/N:STATE`, `RESET …`) is read by the new code unchanged and the
new code writes the same bytes for a primary entry**; a row in the second tracker reaches the ready queue and is offered; a failed read of
one repository is reported and does NOT drop the other's orders; with one project the orders equal a recorded fixture of today's.
**Positive controls, in the test file:** the recorded one-project fixture and the ledger sample are each asserted non-empty, so an empty
gate cannot equal an empty fixture. The second command is the three existing gate suites, unchanged and green.

## Done-when

1. The gate and wake enumerate every declared repository and tracker, and the collision test passes.
2. The three existing suites pass unchanged; the claimant ran the new gate code once against the live GitHub read-only and pasted the orders.
3. The row says what it decided about the seat name for a non-primary key, in the words of ADR 0040 decision 2.
4. **The primary project's ledger, marker and queue entries are byte-identical to today's** (the test above), so a rollback is a unit edit.

## Not in this row

The claim-side readers (3b); labels (3d); causes and briefs (3e); host paths (3f); running the shadow gate (4). The acceptance job has no
token: the new test file declares the no-token exemption the way `work-gate.test.ts` does, and the claimant checks it with `pr-open` at claim time.
````

### CHILD 3d (#2619): labels, milestones, lanes and the row template are a project's vocabulary

**Verdict: AMENDED, materially.** The row said twelve files carry the vocabulary and named four; the reading (decision 1, surface 2) is
**43**, of which only 8 import the constants module, and **10 are files 3b and 3c edit**, so 3d follows both. The row also lacks the fifth
kind decision 1 found: the shared-resource commands `FLEET_LAB_PATTERNS` and the `Fleet` question in `acceptance-commands.mjs`.

````markdown
## Region

```
packages/agent-org/src/project-vocabulary.mjs
packages/lab/src/packaging/project-vocabulary.test.ts
packages/agent-org/src/acceptance-commands.mjs
packages/agent-org/src/arm-pr.mjs
packages/agent-org/src/auto-arm-sweep.mjs
packages/agent-org/src/board-data.mjs
packages/agent-org/src/board-report.mjs
packages/agent-org/src/board-snapshot.mjs
packages/agent-org/src/branch-inventory-report.mjs
packages/agent-org/src/branch-inventory.mjs
packages/agent-org/src/carry-branch.mjs
packages/agent-org/src/claim-labels.mjs
packages/agent-org/src/claim-provenance.mjs
packages/agent-org/src/claim-stall.mjs
packages/agent-org/src/close-rows-for-merged-pr.mjs
packages/agent-org/src/host-units.mjs
packages/agent-org/src/lane-ownership.mjs
packages/agent-org/src/merge-guard.mjs
packages/agent-org/src/merge-guard/claimed-row-rule.mjs
packages/agent-org/src/merge-guard/pr-hold-rule.mjs
packages/agent-org/src/pr-hold-state.mjs
packages/agent-org/src/pr-hold.mjs
packages/agent-org/src/pr-open.mjs
packages/agent-org/src/prompt-session.mjs
packages/agent-org/src/prune-worktrees.mjs
packages/agent-org/src/queue-table.mjs
packages/agent-org/src/ready-label-audit.mjs
packages/agent-org/src/region-paths.mjs
packages/agent-org/src/row-claim.mjs
packages/agent-org/src/row-claim/blocked-by-edge-rule.mjs
packages/agent-org/src/row-claim/file-overlap-rule.mjs
packages/agent-org/src/row-claim/own-pr-health-rule.mjs
packages/agent-org/src/row-claim/runner-rule.mjs
packages/agent-org/src/row-claim/waiting-language-rule.mjs
packages/agent-org/src/row-file.mjs
packages/agent-org/src/row-reachability.mjs
packages/agent-org/src/settle-closed-status.mjs
packages/agent-org/src/stranded-branches.mjs
packages/agent-org/src/trunk-red.mjs
packages/agent-org/src/waiting-condition.mjs
packages/agent-org/src/wake.mjs
packages/agent-org/src/work-gate.mjs
packages/agent-org/src/work-gate/pr-orders.mjs
packages/agent-org/src/work-tick.mjs
packages/agent-org/src/worker-profile.mjs
```

The first two lines are new; the last 43 are the non-test files of `packages/agent-org/src` that carry a quoted status word, a
`lane:`/`session:`/`answer:` prefix or a milestone title (ADR 0040, decision 1, `s2-vocab`), at `46b59abf0`; **the claimant re-runs the
command at claim time** and the list is the row's Region. Commit in slices of at most 12 files. `docs/lane-ownership.json` is `ceo`'s and
neither moves nor changes: the declaration points at it.

## Acceptance

```bash
npx rstest run --config scripts/rstest/rstest.config.mjs --include packages/lab/src/packaging/project-vocabulary.test.ts
npx rstest run --config scripts/rstest/rstest.config.mjs --include packages/lab/src/packaging/row-claim-runner-rule.test.ts --include packages/lab/src/packaging/repo-identity-consolidated.test.ts
```

**The new test must show:** every label, milestone title, template field name and shared-resource pattern the machinery reads equals the
a11ign declaration's value (one assertion per constant, so a constant moved out without its value is caught); **a walk of
`packages/agent-org/src` finds NO quoted status word, `lane:`/`session:`/`answer:` prefix, or milestone title outside the vocabulary
module** (a ratchet that starts at 43 and ends at 0); a fixture project with a DIFFERENT vocabulary changes what `row-file` refuses (a milestone it
does not have, a label outside its set), what the lane rule reads, and, with an empty `resources` list, lets an Acceptance run `fleet:` commands the
a11ign declaration refuses; a missing vocabulary field is REFUSED naming it. **Positive controls, in the test file:** the a11ign vocabulary
is asserted to hold each of the nine labels, and the walk is shown to find a planted literal in a fixture file. The second command is the
lane-refusal and identity suites, unchanged and green.

## Done-when

1. No status word, prefix or milestone title is a literal in the 43 files; each comes from the vocabulary module, whose a11ign values equal today's.
2. `FLEET_LAB_PATTERNS` and the `Fleet` question are the declaration's `resources` and `question`; a project with none has none.
3. The existing suites in the Acceptance pass unchanged.
4. The closing comment lists every word NOT moved and why (a word a test pins in a document the tool does not own, for instance).
````

### CHILD 3e (#2621): role briefs and gate causes are a project's declaration

**Verdict: AMENDED, materially.** Measured (decision 1, surface 3): of 29 gate causes ONE routes to the fleet seat, so the row's premise that
many causes name the fleet, lab and corpus over-reads: 28 are the tool's code and at most 1 is a plugin. And the role briefs are not only
"read from a declared path": **33 files move OUT of `packages/agent-org/docs/roles`** into the a11ign repository, or the extraction carries
a11ign's briefs into a public tool, and 37 files reference the path. It follows 3d (they share `work-gate.mjs`, `wake.mjs`, `worker-profile.mjs`).

````markdown
## Region

```
packages/agent-org/src/work-gate.mjs
packages/agent-org/src/worker-profile.mjs
packages/agent-org/src/wake.mjs
packages/agent-org/src/cause-declaration.mjs
packages/lab/src/packaging/project-roles.test.ts
.agent-org/roles/
docs/operational-lessons.md
docs/reviewer-instancing.md
docs/split-baseline.md
docs/stale-row-audit.md
packages/agent-org/docs/roles/README.md
packages/agent-org/docs/roles/ceo.md
packages/agent-org/docs/roles/engineer.md
packages/agent-org/docs/roles/lead-orchestrator.md
packages/agent-org/docs/roles/memory/MEMORY.md
packages/agent-org/docs/roles/memory/a-fix-reaching-the-instance-not-the-class.md
packages/agent-org/docs/roles/memory/a-number-from-the-apparatus.md
packages/agent-org/docs/roles/memory/a-reproduction-names-its-version.md
packages/agent-org/docs/roles/memory/avoid-agent-overspawn.md
packages/agent-org/docs/roles/memory/board-document-ai-content-guidelines.md
packages/agent-org/docs/roles/memory/ceo-worker-utilisation.md
packages/agent-org/docs/roles/memory/check-whether-the-record-was-superseded.md
packages/agent-org/docs/roles/memory/github-is-the-tracker.md
packages/agent-org/docs/roles/memory/local-worker-vms-deprecated.md
packages/agent-org/docs/roles/memory/merge-worktree-is-not-a-gate-environment.md
packages/agent-org/docs/roles/memory/mutation-check-from-a-copy.md
packages/agent-org/docs/roles/memory/nvda-worker-vm-access.md
packages/agent-org/docs/roles/memory/orchestrating-peer-sessions.md
packages/agent-org/docs/roles/memory/org-shape-second-orchestrator.md
packages/agent-org/docs/roles/memory/peer-session-resource-ban.md
packages/agent-org/docs/roles/memory/rank-a-claim-only-after-reading-it.md
packages/agent-org/docs/roles/memory/verify-a-peers-load-bearing-claim.md
packages/agent-org/docs/roles/memory/verify-open-against-unmerged-branches.md
packages/agent-org/docs/roles/memory/worktree-resolves-primary-dist.md
packages/agent-org/docs/roles/migrate.md
packages/agent-org/docs/roles/orchestrator.md
packages/agent-org/docs/roles/product-manager.md
packages/agent-org/docs/roles/reviewer.md
packages/agent-org/docs/roles/sessions.json
packages/agent-org/docs/roles/tracker-auditor.md
packages/agent-org/docs/roles/worker-audit.md
packages/agent-org/docs/roles/worker-config.md
packages/agent-org/docs/roles/worker-loop-orchestrator.md
packages/agent-org/src/arm-pr.mjs
packages/agent-org/src/queue-table.mjs
packages/agent-org/src/reconstitution-drill.mjs
packages/agent-org/src/review-verdict.mjs
packages/agent-org/src/row-claim/own-pr-health-rule.mjs
packages/agent-org/src/row-claim/runner-rule.mjs
packages/agent-org/src/wake.mjs
packages/agent-org/src/work-gate.mjs
packages/agent-org/src/work-gate/pr-orders.mjs
packages/control/ansible/README.md
packages/lab/src/packaging/arm-pr.test.ts
packages/lab/src/packaging/checkout-dash-safety.test.ts
packages/lab/src/packaging/control-plane-checkout-is-one-fact.test.ts
packages/lab/src/packaging/dist-resolution-rule.test.ts
packages/lab/src/packaging/engineer-brief-context-habits.test.ts
packages/lab/src/packaging/leak-patterns.mjs
packages/lab/src/packaging/pr-open-region.test.ts
packages/lab/src/packaging/reconstitution-drill.test.ts
packages/lab/src/packaging/repo-identity-consolidated.test.ts
packages/lab/src/packaging/roles-memory.test.ts
packages/lab/src/packaging/roles-readme.test.ts
packages/lab/src/packaging/row-claim-one-row.test.ts
packages/lab/src/packaging/row-claim.test.ts
packages/lab/src/packaging/tracked-prose-leak-guard.test.ts
packages/lab/src/packaging/wake-drain.test.ts
packages/lab/src/packaging/wake-engineer-brief.test.ts
packages/lab/src/packaging/wake-spare-family.test.ts
packages/lab/src/packaging/wake.test.ts
packages/lab/src/packaging/work-gate.test.ts
packages/worker-fleet/src/entry-points.test.ts
scripts/check-transfer-urls.mjs
scripts/doc-checks/roles-memory.mjs
scripts/doc-checks/roles-readme.mjs
```

`.agent-org/roles/` is where the 33 role files land (`git mv`, history kept); the last lines are the union of the 33 files that move and the 37
files that reference `agent-org/docs/roles` at `46b59abf0`, and the claimant re-runs `git grep -l 'agent-org/docs/roles'` at claim time.
`work-gate.mjs` and `wake.mjs` are edited only where `CAUSES`, `START_CAUSES`, `JUDGMENT_CAUSES` and `PROFILES` are computed.

## Acceptance

```bash
npx rstest run --config scripts/rstest/rstest.config.mjs --include packages/lab/src/packaging/project-roles.test.ts
npx rstest run --config scripts/rstest/rstest.config.mjs --include packages/lab/src/packaging/roles-readme.test.ts --include packages/lab/src/packaging/wake-engineer-brief.test.ts --include packages/lab/src/packaging/work-gate.test.ts
```

**The new test must show:** a cause is ONE declaration `{cause, group, profile}` and the four exported lists equal today's when computed from
the 28 tool causes plus a11ign's declared cause(s) (one assertion per list, by value); a cause declared with a missing group or profile is
REFUSED naming it; a fixture project with NO project cause yields the 28 tool causes intact and no fleet cause; **the row first classifies all 29
causes, and the classification (28 tool / N project, N at most 2) is asserted in the test**; a role brief is read from the declared directory and a
missing directory is refused; the tool's tree ships no role brief. **Positive control, in the test file:** the a11ign cause list is asserted to
contain `fleet-batch-due`, so a declaration that lost it cannot equal the recorded lists. The second command is the roles, brief and gate suites,
unchanged in what they assert (their paths follow the move).

## Done-when

1. A gate cause is declared in one place; the four lists are computed from it and equal today's.
2. The 33 role files live under `.agent-org/roles/` with their history, the 37 referencing files read the new path, and the suites pass.
3. The tool's code names none of a11ign's project causes; a11ign's declaration supplies them (a plugin module where the cause runs project code).
4. The closing comment counts the files a new cause now touches, against the four places it touched before.

## Not in this row

The enumeration of repositories (3c); the vocabulary (3d); host paths (3f); rewriting any brief's content; classifying the 11 files decision 9 lists
(3f and this row each classify the ones they touch, and say so).
````

### CHILD 3f (#2620): host paths and unit names are the project's parameters

**Verdict: AMENDED.** Decision 3 adds `host.json` (the machine's facts) beside the project declaration, and decision 9 fixes the partition
(8 tool, 8 project, 1 host data), which moves the four project units out of the tool's tree. The row must render the three tool units from templates
and must not change the running unit (that is 4 and 5).

````markdown
## Region

```
packages/agent-org/src/host-units.mjs
packages/agent-org/src/host-config.mjs
packages/agent-org/host/gh
packages/agent-org/host/board-report-dispatch.sh
packages/agent-org/src/board-snapshot-scope.mjs
packages/lab/src/packaging/host-project-paths.test.ts
.agent-org/units/
```

`.agent-org/units/` receives the four project units (`corpus-snapshot`, `corpus-release-nightly`, `fleet-watch`, `lab-watch`, each a service and a timer:
8 files, moved with `git mv`) and `gh-leads-workspaces.txt` becomes `host.json`'s `gh.leadsWorkspaces`. `board-snapshot-scope.mjs` is also edited by 3a;
this row follows it and 3g by native edges.

## Acceptance

```bash
npx rstest run --config scripts/rstest/rstest.config.mjs --include packages/lab/src/packaging/host-project-paths.test.ts
npx rstest run --config scripts/rstest/rstest.config.mjs --include packages/lab/src/packaging/host-units.test.ts --include packages/lab/src/packaging/board-snapshot-scope.test.ts
```

**The new test must show:** no home-directory literal remains in the tool's sources or its own unit and script files (each is read from `host.json` or
the declaration); a11ign's `host.json` reproduces every current path exactly; **the partition of the 17 entries is asserted against the files** (tool 8,
project 8, host data 1) and **an 18th entry classified nowhere is REFUSED**; the three tool units are rendered from templates and equal today's text for a11ign's
values; a fixture project with different paths changes what the readers use. **Positive control, in the test file:** the partition is asserted to hold
8, 8 and 1 and the host directory 17 entries, so a partition of nothing is not read as complete. The second command is the host-unit and board-snapshot suites,
unchanged and green.

## Done-when

1. The tool's sources and its own units name no a11ign host path; `host.json` and the declaration supply them, unchanged.
2. Every entry is classified as the tool's, the project's or host data, and a new one that is none is refused.
3. **No unit is renamed and none is reinstalled by this row**, and the running `work-tick` unit is untouched: the row says so and names rows 4 and 5.
````

### CHILD 4 (#2622): the shadow-run rehearsal

**Verdict: AMENDED.** Decision 5 supplies what the row left "as the ADR set it": the window, the clean-cut-over condition, where every state file lives, and
that no state moves. The instrument's Acceptance gains the resolved-path refusal.

````markdown
## Region

```
packages/agent-org/src/shadow-gate.mjs
packages/lab/src/packaging/shadow-gate.test.ts
```

The real shadow WINDOW (48 hours of live ticks) is the extraction row's precondition and not this row's Acceptance; this row builds and rehearses the instrument.

## Acceptance

```bash
npx rstest run --config scripts/rstest/rstest.config.mjs --include packages/lab/src/packaging/shadow-gate.test.ts
```

**The test must show, one fixture each:** two gates fed identical reads for a recorded run of ticks produce an EMPTY diff; one perturbed order is reported
naming the tick and the order that differs; pointing the runner at the live state directory is REFUSED before any read, **and so is a path that resolves to it
by symlink**; a run writes no state file (the copy is byte-identical before and after); a simulated cut-over on a copy with a `VOIDED` marker and a queued
handoff in flight loses no tick and drops no order. **Positive controls, in the test file:** the recorded run holds more than one tick and at least one order, so an
empty run cannot produce an empty diff, and the perturbed fixture is the recorded run with exactly one order changed.

## Done-when

1. The instrument exists, refuses a live state directory (by resolved path), writes nothing, and reports the first differing tick and order.
2. The rehearsal on a copy is recorded on the row: the ticks, the orders in and out, the marker and handoff carried across.
3. The row states the window and the clean condition as ADR 0040 decision 5 set them: **1,440 consecutive ticks (48 h at two minutes) with every difference
   explained, covering every cause that fired in the seven days before it opened; then 30 consecutive clean ticks (one hour) after the swap with at least one
   queued handoff crossing it.** The numbers are chosen, and the row says so.
4. The row states where each state file lives during and after, as decision 5's table: **in place, in `~/.cache/a11ign`, no file moved and none changed shape**.
````

### CHILD 5 (#2623): the extraction

**Verdict: AMENDED.** The Region's "tests that leave" is now a measured set (decision 4: 113 travel, 14 are divided, 43 are classified); the first push is the one
unprotected write and its order is fixed (decision 6); the relicensing check is re-run at the extraction commit (decision 7); the installed form and the tick unit
are decision 3's; and `needs:chairman` for the token is a reading, since `ceo` reported it granted at 07:40Z and it is not readable from here.

````markdown
## Region

```
packages/agent-org/
packages/lab/src/packaging/agent-org-extraction.test.ts
```

PROVISIONAL and the widest Region of the epic. **The tests that leave** are the 113 `packages/lab` files that import the tool's source and no product package
(`t-import` minus `t-product`, decision 4), **the 14 that import both are divided by this row**, and the 43 that only mention the tool are classified by it;
the claimant re-runs the two commands at claim time and `product-manager` adds the files by amendment before the first edit. `docs/roles`, the project units
and `host.json`'s data are NOT imported (they stayed with a11ign in 3e and 3f). It is claimed only in a clear window (B4 read against every open pull request).

## Acceptance

```bash
npx rstest run --config scripts/rstest/rstest.config.mjs --include packages/lab/src/packaging/agent-org-extraction.test.ts
```

**The test must show:** no import in the extracted tree resolves outside it (decision 4's walk, 0 edges); nothing in `a11ign/a11ign` imports the package by a
relative path; the package, installed into a scratch directory and pointed at the fixture project, resolves that project's values and none of a11ign's; the extracted
tree carries a `LICENSE` file and a `license` field of `Apache-2.0`, and **the relicensing check of ADR 0040 decision 7 is re-run over it and finds no AGPL import**;
the numeric pins the move changes (`npm run test:org`'s `--min=300` floor and any count a test derives) are re-derived. **Positive controls, in the test file:** a
fixture package with one relative import across the boundary is REFUSED naming both ends; the fixture project's values are asserted different from a11ign's;
and the licence check over a fixture tree still declaring `AGPL-3.0-or-later` is REFUSED naming the field.

## Done-when

1. **The token scope is READ, not assumed:** the first pull request in `a11ign/agent-org` arms with `A11IGN_BOT_TOKEN` and not the `GITHUB_TOKEN` fallback (its
   `auto-arm` log names which path ran), and the row's comment cites the reading; until then nothing needing `close-rows` or `trunk-guard` is claimed to work there.
2. **The first push is the one unprotected write, and the order is decision 6's:** settings, then the push (its first commit carrying `LICENSE`, the `license` field, the
   leak scan and the PR template), then classic protection and the ruleset, then a docs-only smoke PR whose `reviewDecision` reads `REVIEW_REQUIRED`, **saying which
   instrument** (`A11Y_CHECK_BRANCH_PROTECTION=1` with admin, `A11Y_CHECK_MAIN_RULESET=1` without), then `bots` from `admin` to `write`.
3. The history of the package and its 113 tests is in `a11ign/agent-org`, verified by a commit count and the first and last commit of a sampled file.
4. The a11ign declaration and `host.json` point at the installed tool; **the monorepo copy and its units are still installed, their timer DISABLED and not deleted**,
   the row says so in one sentence and names the row that removes them.
5. The shadow window and the clean cut-over condition of decision 5 are recorded on the row, or it says they are not yet and stays open.
````

### NEW ROW W (ready to file): the six sweep-stop glosses live in `cli`

**Verdict: NEW.** decision 11 (b) found that report wording lives in `evidence`; the six glosses are the part that is display and not contract. Independent of the chain.

````markdown
## What it is

**The six sweep-stop glosses (`SWEEP_STOP_GLOSS`, `packages/evidence/src/conformance.ts`) move to `packages/cli`** (ADR 0040, ask (b)). `evidence` keeps reporting each
truncated sweep as data (`type` and `stop`, already in `SweepOutcome`) and `limitation` keeps its sentence for ONE release, naming the stop code without the gloss;
`cli` owns the six strings and composes the clause it prints. The 22 `establishes:`/`limitation:` assignments are the contract's statements and are NOT moved.

## Region

```
packages/evidence/src/conformance.ts
packages/evidence/src/conformance.test.ts
packages/cli/src/report.ts
packages/cli/src/report.test.ts
```

Plus a `.changeset` (a published package changes).

## Acceptance

```bash
npx rstest run --config scripts/rstest/rstest.config.mjs --include packages/evidence/src/conformance.test.ts --include packages/cli/src/report.test.ts
```

**The tests must show:** the rendered report for a run with each of the six stop codes contains the same gloss as today (six assertions, one per code, so a gloss moved
without its text is caught); `evidence`'s `limitation` for that run names the stop code and contains no gloss; a stop code with no gloss renders the bare code, as today.
**Positive control, in the test files:** the six codes are asserted to be exactly the ones `truncatedSweeps` selects, so a seventh code cannot be added without a gloss.

## Done-when

1. `SWEEP_STOP_GLOSS` is not in `packages/evidence`; the report `cli` prints reads as it did.
2. The row's comment names the contract change (the text of one `limitation` sentence) and the changeset's bump.
3. The closing comment says how many report-wording rounds since #1851 touched `evidence` (three of four), so the coupling's cost has a baseline.

## Fleet

No.
````

### MOVE ROW R1 (NEW, ready to file): rename `@a11ign/nvda-worker` to `@a11ign/screenreader-worker` on the registry

**Verdict: NEW.** ADR 0036 named `@a11ign/screenreader-worker` and was never carried out on the registry (`ceo`, #69, 07:06Z); npm cannot rename, so this publishes the new name and deprecates the old. It lands BEFORE M1, so the trusted-publisher binding is made once against the final name. Blocked by: 5.

**Chairman step:** the new name is a FIRST PUBLISH, so a trusted publisher for `@a11ign/screenreader-worker` must be configured on npmjs.com (an owner action with 2FA) or a bootstrap token used for the first release; `product-manager` names the options from npm's own documentation on the row (*external knowledge*, not verified here).

````markdown
## Region

```
packages/nvda-worker/package.json
packages/nvda-worker/README.md
.changeset/rename-nvda-worker-to-screenreader-worker.md
packages/lab/src/packaging/package-rename-nvda-worker.test.ts
```

Plus every non-document file that names `@a11ign/nvda-worker`: **61 files at `46b59abf0`** (`r-names`, decision 10), which `product-manager` pastes into the Region at promotion from `git grep -l '@a11ign/nvda-worker\b' -- . ':!*.md' ':!docs' ':!package-lock.json' ':!pnpm-lock.yaml'`.

## Acceptance

```bash
npx rstest run --config scripts/rstest/rstest.config.mjs --include packages/lab/src/packaging/package-rename-nvda-worker.test.ts
```

**The test must show:** the package's `name` is `@a11ign/screenreader-worker`; no file outside a deprecation note and the changeset names `@a11ign/nvda-worker`; every workspace importer resolves the new name. **Positive control:** the test's walk finds the old name in a fixture file and REFUSES it.

## Done-when

1. The pull request is merged with a changeset that publishes the new name; `npm run typecheck` and `npm test` pass.
2. The row states its chairman step (first publish of a new name) and who performed it.
3. After the first release the old name carries a deprecation pointing at the new (`npm view` pasted).
````

### MOVE ROW R2 (NEW, ready to file): rename `@a11ign/worker-fleet` to `@a11ign/screenreader-fleet`

**Verdict: NEW.** As R1. **168 files name it** (`r-names`), 16 of them the tool's own import lines, so it waits for 3g. Blocked by: 3g, 5.

**Chairman step:** the same first-publish step as R1, for `@a11ign/screenreader-fleet`.

````markdown
## Region

```
packages/worker-fleet/package.json
packages/worker-fleet/README.md
.changeset/rename-worker-fleet-to-screenreader-fleet.md
packages/lab/src/packaging/package-rename-worker-fleet.test.ts
```

Plus the 168 non-document files that name `@a11ign/worker-fleet` at `46b59abf0`, pasted at promotion from the command in R1 with the name changed.

## Acceptance

```bash
npx rstest run --config scripts/rstest/rstest.config.mjs --include packages/lab/src/packaging/package-rename-worker-fleet.test.ts
```

**The test must show:** the package's `name` is `@a11ign/screenreader-fleet`; no file outside a deprecation note and the changeset names the old name; every importer resolves the new one. **Positive control:** a fixture file naming the old name is REFUSED.

## Done-when

1. Merged with a changeset publishing the new name; `npm run typecheck` and `npm test` pass.
2. The row states its chairman step and who performed it.
3. After the first release the old name is deprecated pointing at the new.
````

### MOVE ROW M0 (NEW, ready to file): remove the monorepo copy of `agent-org`

**Verdict: NEW.** Child 5 leaves the old path wired and its timer disabled (decision 5); this is the separate removal, filed only after the clean cut-over tick, so a rollback is one edit until it merges. Blocked by: 5.

**Chairman step:** none.

````markdown
## Region

```
packages/agent-org/
packages/lab/src/packaging/agent-org-monorepo-copy-removed.test.ts
```

## Acceptance

```bash
npx rstest run --config scripts/rstest/rstest.config.mjs --include packages/lab/src/packaging/agent-org-monorepo-copy-removed.test.ts
```

**The test must show:** no tracked path under `packages/agent-org/`; no unit file of the tool's own in this repository; the a11ign declaration and `host.json` point at the installed tool. **Positive control:** a fixture tree still holding one file under the old path is REFUSED naming it.

## Done-when

1. The directory is gone and the suites that pinned it are updated, with their derived count pins moved in the same pull request.
2. `host:check` reports the old timer absent and the new one present; the reading is pasted.
3. The row records the clean cut-over tick it waited for.
````

### MOVE ROW M1 (NEW, ready to file): move `nvda-worker` and `nvda-speech` to `a11ign/screenreader-worker`

**Verdict: NEW.** The first layer, on 0039's rulings and this ADR's decisions 2 to 7. Blocked by: R1, 5, #2612, #2613, and a clear window on `packages/nvda-worker/src` and `packages/nvda-speech/` (B4 read at claim time; one pull request touches the former today, decision 10).

**Chairman step:** re-bind the npm trusted publisher of `@a11ign/screenreader-worker` to `a11ign/screenreader-worker` and its release workflow's filename, before the first release from there (an owner action with 2FA).

````markdown
## Region

```
packages/nvda-worker/
packages/nvda-speech/
packages/lab/src/packaging/screenreader-worker-extraction.test.ts
```

PROVISIONAL: the tests that leave with the layer are #2613's set; `product-manager` adds them by amendment.

## Acceptance

```bash
npx rstest run --config scripts/rstest/rstest.config.mjs --include packages/lab/src/packaging/screenreader-worker-extraction.test.ts
```

**The test must show:** the layer-edge guard (#2612) finds no edge in either direction; the licence test divides three ways as ADR 0039 finding 1 says; the new repository's first commit carries its `LICENSE`, the leak scan is clean at it, and its ruleset and protection are read back behaviourally in decision 6's order. **Positive control:** a fixture package with one relative import across the boundary is REFUSED naming both ends.

## Done-when

1. The history of both packages is in `a11ign/screenreader-worker`, verified by a commit count and the first and last commit of a sampled file.
2. The chairman step is done and read back (the first release from the new repository publishes), or the row says it is not yet and stays open.
3. `bots` is downgraded from `admin` to `write` and the requirement read back, saying which instrument.
````

### MOVE ROW M2 (NEW, ready to file): move `worker-fleet` to `a11ign/screenreader-fleet`

**Verdict: NEW.** As M1, for the fleet layer. Blocked by: R2, 5, and M1 (the fleet imports the worker).

**Chairman step:** re-bind the trusted publisher of `@a11ign/screenreader-fleet` to `a11ign/screenreader-fleet` and its release workflow's filename.

````markdown
## Region

```
packages/worker-fleet/
packages/lab/src/packaging/screenreader-fleet-extraction.test.ts
```

PROVISIONAL, as M1.

## Acceptance

```bash
npx rstest run --config scripts/rstest/rstest.config.mjs --include packages/lab/src/packaging/screenreader-fleet-extraction.test.ts
```

**The test must show:** no edge in either direction across the boundary (its 12 `guards` imports and its dependency on the worker are by name); the first commit's licence and leak scan; protection read back. **Positive control:** a fixture with one relative import across the boundary is REFUSED.

## Done-when

1. History verified as in M1; the chairman step done and read back, or the row says not yet.
2. `bots` downgraded and the requirement read back.
````

### MOVE ROW M3 (NEW, ready to file): move `lab` to `a11ign/lab`

**Verdict: NEW.** `lab` is in the version-one ruling (`ceo`, 08:45Z) and its repository exists as a placeholder; the move follows the layers, because `lab` holds 182 of the 231 guards and they reach into everything (`ceo`). What STAYS in the product is decision 4's, and this row states it by count. Blocked by: M1, M2.

**Chairman step:** none (unpublished; the token grants `lab`, `ceo` 07:40Z).

````markdown
## Region

```
packages/lab/
packages/lab/src/packaging/lab-extraction.test.ts
```

PROVISIONAL and the widest after 5: what stays is the guards the product needs (decision 4).

## Acceptance

```bash
npx rstest run --config scripts/rstest/rstest.config.mjs --include packages/lab/src/packaging/lab-extraction.test.ts
```

**The test must show:** no edge in either direction; the tree-wide guards still run on the product's tree and select nothing outside it; protection read back. **Positive control:** a fixture with one edge across the boundary is REFUSED.

## Done-when

1. History verified; protection read back; `bots` downgraded.
2. The row states which guards stayed and which moved, by count.
````

### MOVE ROW M4 (NEW, ready to file): move `control` to `a11ign/control`

**Verdict: NEW.** As M3, for the control plane (it reaches `worker-fleet` from 13 files). Blocked by: M2, M3.

**Chairman step:** none.

````markdown
## Region

```
packages/control/
packages/lab/src/packaging/control-extraction.test.ts
```

PROVISIONAL, as M3.

## Acceptance

```bash
npx rstest run --config scripts/rstest/rstest.config.mjs --include packages/lab/src/packaging/control-extraction.test.ts
```

**The test must show:** no edge across the boundary other than by package name; protection read back. **Positive control:** a fixture with one relative import across the boundary is REFUSED.

## Done-when

1. History verified; protection read back; `bots` downgraded.
2. The fleet's deploy and provision paths still resolve (read, not run: the resource ban applies).
````

### MOVE ROW M5 (NEW, ready to file): move `pdf` to `a11ign/documents` and publish `@a11ign/documents` 0.1.0

**Verdict: NEW.** The layer is renamed the DOCUMENTS layer (`ceo`, #69 08:01Z). `@a11ign/pdf` was never published, so there is no old package to rename or re-bind: **this is a FIRST PUBLISH and is on the critical path of the next `a11ign` release** (decision 10). Blocked by: 5.

**Chairman step:** BOTH: (1) add `a11ign/documents` to `A11IGN_BOT_TOKEN`'s repository access (`ceo` reported the grant by repository id survives the rename but cannot read the list, so it is NOT confirmed); (2) decide and perform the first-publish path on npmjs.com (a bootstrap token for the first release, or whatever npm permits for a package that does not exist yet: `product-manager` names the options from npm's documentation).

````markdown
## Region

```
packages/pdf/
packages/lab/src/packaging/documents-extraction.test.ts
```

Plus the 26 files that name `@a11ign/pdf` by name at `46b59abf0` (`r-names`), pasted at promotion.

## Acceptance

```bash
npx rstest run --config scripts/rstest/rstest.config.mjs --include packages/lab/src/packaging/documents-extraction.test.ts
```

**The test must show:** the package is named `@a11ign/documents`; nothing in `a11ign/a11ign` other than `cli` names `@a11ign/pdf`; no edge across the boundary (its only dependency is `pdf-lib`); the first commit's licence and leak scan. **Positive control:** a fixture naming the old name is REFUSED.

## Done-when

1. History verified; protection read back; `bots` downgraded.
2. **Both chairman steps are done and read back:** the token reaches the repository (the first merge shows the arming path) and `npm view @a11ign/documents version` prints `0.1.0`, pasted.
````

### MOVE ROW M6 (NEW, ready to file): `cli` depends on `@a11ign/documents` by version range

**Verdict: NEW.** After M5's publish, `cli` stops depending on the workspace `0.0.0` (`packages/cli/package.json:25`) and only then can `a11ign` release again. Blocked by: M5.

**Chairman step:** none (the publish was M5's).

````markdown
## Region

```
packages/cli/package.json
packages/cli/src/cli.ts
packages/cli/src/report.ts
packages/lab/src/packaging/cli-documents-dependency.test.ts
```

## Acceptance

```bash
npx rstest run --config scripts/rstest/rstest.config.mjs --include packages/lab/src/packaging/cli-documents-dependency.test.ts
```

**The test must show:** `cli` declares `@a11ign/documents` by a semver RANGE and not `0.0.0`; the two imports of `looksLikePdfUrl` and `scanPdfTagTree` resolve to it. **Positive control:** a fixture declaring the workspace `0.0.0` is REFUSED.

## Done-when

1. Merged; `npm run typecheck` and `npm test` pass; a changeset bumps `cli`.
2. The next `a11ign` release installs (the registry-consumer gate's reading, pasted).
````

## The reading scripts

Several readings call a script; save each under the name the command uses and run it from the repository root. Their output is above.

`outward.mjs` — the distinct files the tool imports from outside its own package (comment lines skipped, `@a11ign/<pkg>/<sub>` resolved to that package's `src`):

```js
// Distinct targets that non-test files of packages/agent-org import from OUTSIDE the package, resolved to repo paths.
// Prints "<target>\t<importing files>\t<lines>" sorted by importers, then a summary line.
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve, relative } from "node:path";

const root = process.cwd();
const files = execFileSync("git", ["ls-files", "packages/agent-org"], { encoding: "utf8" })
  .split("\n").filter((f) => /\.(mjs|ts|js)$/.test(f) && !/\.test\./.test(f));
const IMPORT = /(?:from|import\s*\()\s*["']([^"']+)["']/g;
const targets = new Map();
for (const f of files) {
  const src = readFileSync(f, "utf8").split("\n").filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join("\n");
  for (const m of src.matchAll(IMPORT)) {
    let spec = m[1];
    let abs;
    if (spec.startsWith(".")) abs = resolve(dirname(f), spec);
    else if (spec.startsWith("@a11ign/")) {
      const [, name, ...rest] = spec.split("/");
      abs = resolve("packages", name, "src", rest.join("/") || "index");
    } else continue;
    const rel = relative(root, abs);
    if (rel.startsWith("packages/agent-org/")) continue;
    const cand = [rel, `${rel}.mjs`, `${rel}.ts`].find((c) => existsSync(c)) ?? rel;
    const key = cand;
    const e = targets.get(key) ?? { files: new Set() };
    e.files.add(f);
    targets.set(key, e);
  }
}
const rows = [...targets].map(([t, e]) => [t, e.files.size]).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
for (const [t, n] of rows) console.log(`${n}\t${t}`);
const byTop = new Map();
for (const [t] of rows) {
  const top = t.startsWith("scripts/") ? "scripts" : t.split("/").slice(0, 2).join("/");
  byTop.set(top, (byTop.get(top) ?? 0) + 1);
}
console.log("-- distinct targets by top:", JSON.stringify(Object.fromEntries(byTop)));
console.log("-- distinct targets:", rows.length, " files with an outward import:", new Set([...targets.values()].flatMap((e) => [...e.files])).size);
```

`outward-files.mjs` — the same walk printing the IMPORTING files (child 3g's Region):

```js
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve, relative } from "node:path";
const root = process.cwd();
const files = execFileSync("git", ["ls-files", "packages/agent-org"], { encoding: "utf8" }).split("\n").filter((f) => /\.(mjs|ts|js)$/.test(f) && !/\.test\./.test(f));
const IMPORT = /(?:from|import\s*\()\s*["']([^"']+)["']/g;
const out = new Set();
for (const f of files) {
  const src = readFileSync(f, "utf8").split("\n").filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join("\n");
  for (const m of src.matchAll(IMPORT)) {
    const spec = m[1]; let abs;
    if (spec.startsWith(".")) abs = resolve(dirname(f), spec);
    else if (spec.startsWith("@a11ign/")) { const [, name, ...rest] = spec.split("/"); abs = resolve("packages", name, "src", rest.join("/") || "index"); } else continue;
    if (relative(root, abs).startsWith("packages/agent-org/")) continue;
    out.add(f);
  }
}
console.log([...out].sort().join("\n"));
```

`guards-consumers.sh` — for each `guards` module, the files under `packages/agent-org` that import it and the files elsewhere that do:

```bash
#!/usr/bin/env bash
# Per-module consumer counts for packages/guards/src: files under packages/agent-org vs files everywhere else.
export LC_ALL=C
cd "$(git rev-parse --show-toplevel)" || exit 1
printf "%-28s %5s %9s %6s\n" module lines agent-org others
for f in packages/guards/src/*.mjs; do
  m=$(basename "$f" .mjs)
  pat="guards/(src/)?${m}(\\.mjs)?[\"']"
  ao=$(git grep -lE "$pat" -- packages/agent-org ':!*.md' | wc -l)
  ot=$(git grep -lE "$pat" -- . ':!packages/agent-org' ':!packages/guards' ':!*.md' ':!docs' | wc -l)
  printf "%-28s %5s %9s %6s\n" "$m" "$(wc -l < "$f")" "$ao" "$ot"
done
```

`nine.sh` — size, commit count and outside importers of the nine outward targets, and the leak-pattern names:

```bash
#!/usr/bin/env bash
export LC_ALL=C
cd "$(git rev-parse --show-toplevel)"
for f in packages/worker-fleet/src/cli-flags.mjs packages/guards/src/git-env.mjs scripts/repo-identity.mjs packages/lab/src/packaging/leak-patterns.mjs packages/guards/src/changed-files.mjs packages/guards/src/local-import-closure.mjs packages/guards/src/worktree-resolution.mjs scripts/npm-cli-executable.mjs scripts/product-home.mjs; do
  printf "%-56s %4s lines %3s commits %3s importers-outside-agent-org\n" "$f" "$(wc -l < $f)" "$(git log --no-merges --oneline -- $f | wc -l)" "$(git grep -lE "$(basename $f .mjs)(\\.mjs)?[\"']" -- . ':!packages/agent-org' ':!*.md' ':!docs' | wc -l)"
done
echo "-- leak patterns"; grep -c 'name:' packages/lab/src/packaging/leak-patterns.mjs; grep -oE 'name: "[^"]+"' packages/lab/src/packaging/leak-patterns.mjs
```

`live-reads.sh` — the *live* reads of `a11ign/agent-org` and of `a11ign/a11ign`'s ruleset (as the asking identity, `a11ign-ai-workers`; 404 means absent or forbidden, never "unprotected"):

```bash
#!/usr/bin/env bash
gh api repos/a11ign/agent-org --jq '{private,default_branch,size,has_issues,allow_auto_merge,delete_branch_on_merge,license:.license.spdx_id}'
echo "-- branches"; gh api repos/a11ign/agent-org/branches --jq length
echo "-- main"; gh api repos/a11ign/agent-org/branches/main --jq .protected 2>&1 | tail -1
echo "-- rulesets"; gh api repos/a11ign/agent-org/rulesets --jq length 2>&1 | tail -2
echo "-- rules on main"; gh api repos/a11ign/agent-org/rules/branches/main --jq length 2>&1 | tail -1
echo "-- protection"; gh api repos/a11ign/agent-org/branches/main/protection --jq .enforce_admins.enabled 2>&1 | tail -1
echo "-- teams"; gh api repos/a11ign/agent-org/teams --jq '[.[]|{slug,permission}]' 2>&1 | tail -2
echo "-- same on a11ign"; gh api repos/a11ign/a11ign/rulesets --jq '[.[]|{id,name,enforcement}]' 2>&1 | tail -2
gh api repos/a11ign/a11ign/rules/branches/main --jq '[.[].type]' 2>&1 | tail -1
```

`edges.sh` — the native `blockedBy` edges of the split rows as the gate reads them (*live*):

```bash
#!/usr/bin/env bash
# Native blockedBy edges of the split rows, as the gate reads them (--json blockedBy).
for n in 2612 2613 2615 2616 2617 2618 2619 2620 2621 2622 2623; do
  echo "#$n blocked by: $(gh issue view $n --json blockedBy --jq '[.blockedBy.nodes[]|"#\(.number)"]|join(" ")')"
done
```

`region-overlaps.sh` — each filed child row's Region and the files two Regions share (*live*):

```bash
#!/usr/bin/env bash
# For each filed child row, the files of its Region (first fenced block under "## Region"), then the files two rows share.
export LC_ALL=C
D=$(mktemp -d)
for n in 2616 2617 2618 2619 2620 2621 2622 2623; do
  gh issue view $n --json body --jq .body | awk '/^## Region/{r=1;next} r&&/^```/{c++; if(c==2)exit; next} r&&c==1&&NF' | sort -u > "$D/$n"
  echo "#$n Region: $(wc -l < "$D/$n") paths"
done
echo "-- files shared by two filed Regions"
for a in 2616 2617 2618 2619 2620 2621 2622; do for b in 2617 2618 2619 2620 2621 2622 2623; do
  [ "$a" -lt "$b" ] || continue
  s=$(comm -12 "$D/$a" "$D/$b" | tr '\n' ' '); [ -n "$s" ] && echo "#$a & #$b: $s"
done; done
rm -rf "$D"
```

`cycle.sh` — filing-to-close of the two split rows that ran, and PR open-to-merge over the newest 200 merged (*live*):

```bash
#!/usr/bin/env bash
# Filing-to-close minutes for the two split rows that ran, and PR open-to-merge over the newest 200 merged PRs.
for n in 2610 2614; do
  gh issue view $n --json createdAt,closedAt --jq '"#'$n' \(.createdAt) -> \(.closedAt)"'
done
gh pr list --state merged --limit 200 --json createdAt,mergedAt --jq '.[]|((.mergedAt|fromdate)-(.createdAt|fromdate))/60|floor' | sort -n | awk '{a[NR]=$1} END{printf "merged PRs: %d  median %d min  p90 %d min  max %d min\n",NR,a[int((NR+1)/2)],a[int(NR*0.9)],a[NR]}'
```

`ledger-causes.sh` — the distinct gate causes that fired in the live ledger in the last 24 h, 48 h and 7 days (*live*, host state):

```bash
#!/usr/bin/env bash
# Distinct gate causes that fired in the live wake ledger inside the last 24 h, 48 h and 7 days (first column is epoch ms).
now=$(date +%s)000
for h in 24 48 168; do
  cut=$(( now - h*3600*1000 ))
  n=$(awk -F'\t' -v c=$cut '$1+0>=c && $1!="RESET" {split($2,p,"/"); if (p[2]!="") print p[2]}' ~/.cache/a11ign/wake-ledger | sort -u | wc -l)
  echo "last ${h}h: $n distinct causes fired"
done
```
