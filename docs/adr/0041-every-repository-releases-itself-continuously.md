# ADR 0041: every repository releases itself, continuously

## Status

**Proposed, 2026-10-03.** Row #3129, child of #69 and of the chairman's standing direction of 2026-10-03 on #928. It
records seven decisions that `ceo` ruled on the chairman's direction; **this ADR writes them down with their readings
and does not reopen them.** It changes no workflow, no release and no registry: the rows that carry it out are the
appendix, filed beside this one.

The chairman's words (#928, 2026-10-03): "make sure ... that each package is independently deployable, for each repo ...
we really need to shoot for a CI/CD cadence of getting releases out there rather than the kind of waterfall that's going
on right now."

**Measured at commit `308b2de5b`, 2026-10-03T08:57Z.** A reading is a moment: every command below can be re-run, and a
number quoted from here without re-running it is a quotation, not a measurement.

**Extends [ADR 0040](./0040-agent-org-is-a-standalone-project-agnostic-tool.md).** Its 2026-10-03 amendment ("release per
repository, move first, publish second") is the first half of this; 0041 extends it from "each repository CAN release"
to "each repository DOES, on every merge". Nothing in 0040 is withdrawn.

## Context

**The waterfall, measured.** a11ign has made one release. The release workflow starts only on a person dispatching it and
typing a confirmation. 3,101 commits and 664 merged pull requests have landed since, none shipped.

#### The baseline this ADR starts from

```
$ git log -1 --format='%h %cI' v0.1.0
b373d1d7d 2026-09-19T00:18:38Z
$ for n in evidence judge scorer; do echo -n "@a11ign/$n "; npm view @a11ign/$n time --json | tr -d '\n ' ; echo; done
@a11ign/evidence {"created":"2026-09-19T09:38:59.818Z","0.1.0":"2026-09-19T09:39:00.127Z","modified":"2026-09-19T09:39:00.565Z"}
@a11ign/judge {"created":"2026-09-19T09:39:06.387Z","0.1.0":"2026-09-19T09:39:06.740Z","modified":"2026-09-19T09:39:07.098Z"}
@a11ign/scorer {"created":"2026-09-19T09:39:03.214Z","0.1.0":"2026-09-19T09:39:03.552Z","modified":"2026-09-19T09:39:03.955Z"}
$ grep -n -A2 '^on:' .github/workflows/release.yml
62:on:
63-  workflow_dispatch:
64-    inputs:
$ git rev-list --count v0.1.0..HEAD
3101
$ gh pr list --repo a11ign/a11ign --state merged --search 'merged:>=2026-09-19' --limit 1000 --json number --jq length
664
```

`@a11ign/evidence`, `judge` and `scorer` each have one version on npm. The GitHub Release page for `v0.1.0` is dated
2026-09-24; the registry's publish is 2026-09-19. **Where the two differ, the registry is the release** (decision 7).

## The seven repositories

Each releases itself, by the mechanism in its row. **Today only `a11ign` and `agent-org` have ever released**, and five of
the seven are empty repositories (decision 1's reading).

| repository | releases by | release mechanism |
|---|---|---|
| `a11ign` | version pull request, then publish on its merge | npm, trusted publishing over OIDC with provenance, no stored token; `evidence`, `judge`, `scorer` and the `a11ign` command-line package |
| `agent-org` | version pull request, then tag on its merge | git tag plus GitHub Release, published to NO registry; consumers pin the tag (ADR 0040 decision 3) |
| `screenreader-worker` | version pull request, then publish on its merge | npm, trusted publishing over OIDC with provenance, no stored token (`@a11ign/screenreader-worker`) |
| `screenreader-fleet` | version pull request, then publish on its merge | npm, trusted publishing over OIDC with provenance, no stored token (`@a11ign/screenreader-fleet`) |
| `documents` | version pull request, then publish on its merge | npm, trusted publishing over OIDC with provenance, no stored token (`@a11ign/documents`) |
| `lab` | version pull request, then tag on its merge | git tag plus GitHub Release; `private: true`, no npm |
| `control` | version pull request, then tag on its merge | git tag plus GitHub Release; `private: true`, no npm |

## Decision

Seven decisions. Each carries one reading, and an owner for the row that makes it true.

### DECISION 1 — a repository is the unit of release, and there is no shared release train

**Decision:** each of the seven repositories has its own CI and its own release pipeline and releases without asking
another. Repositories depend on one another only through a PUBLISHED version: a semver range from the npm registry, or a
pinned release tag for a repository that publishes to no registry. `workspace:`, `link:`, `file:` and a relative import
across a repository boundary are refused by a test in the CONSUMING repository.

**Owner:** #3143 (the refusal test, filed by the row that wrote this ADR because no filed row carried it); each move row (#2701 to #2705) carries its repository's release.

```
$ for r in a11ign agent-org screenreader-worker screenreader-fleet documents lab control; do echo "$r releases=$(gh release list --repo a11ign/$r --exclude-drafts --limit 100 --json tagName --jq length)"; done
a11ign releases=1
agent-org releases=1
screenreader-worker releases=0
screenreader-fleet releases=0
documents releases=0
lab releases=0
control releases=0
$ git grep -n -E '"@a11ign/[a-z-]+": "' -- 'packages/*/package.json' | head -5
packages/cli/package.json:23:    "@a11ign/evidence": "0.0.0",
packages/cli/package.json:24:    "@a11ign/judge": "0.0.0",
packages/cli/package.json:25:    "@a11ign/documents": "0.0.0",
packages/cli/package.json:26:    "@a11ign/scorer": "0.0.0",
packages/cli/package.json:27:    "@a11ign/screenreader-fleet": "0.0.0",
```

Five of the seven repositories are empty today (the split has not moved a byte), and the packages in the monorepo name one
another by the exact version `0.0.0`, resolved by the workspace. **No test refuses a cross-repository `workspace:` today
because no cross-repository edge exists to refuse**: #3143 writes the test before the first edge is cut (#2701), with a
positive control that the refusal fires on a planted `workspace:` specifier.

### DECISION 2 — a merge to `main` that changes a releasable package releases it, automatically

**Decision:** versioning stays on `changesets` (per package, `fixed: []`): no new versioning tool. The default is one
release per merge, and one a day at the very worst; never a batch. `main` requires an approving review and no identity may
bypass it (#2022), so the version bump cannot be pushed to `main`: **the release workflow opens a version pull request, the
org's own gate reviews and merges it like any other, and the merge of that pull request publishes.** The typed
`publish-for-real` confirmation is retired: its job, stopping an accident, is done by the gates and not by a person typing.
Publish uses npm trusted publishing over OIDC with provenance and NO stored token, as the first release did.

**Owner:** the `a11ign` release row (#3131); `agent-org`'s own (#3134).

```
$ cat .changeset/config.json | grep -E '"(fixed|ignore|commit)"'
  "commit": false,
  "fixed": [],
  "ignore": []
$ ls .changeset/*.md | grep -c -v README
176
$ grep -n '"push"' scripts/release-commit-version-bump.mjs
79:  git(["push", "origin", "HEAD:main"]);
$ gh api repos/a11ign/a11ign/rules/branches/main --jq '[.[]|.type]|join(",")'
merge_queue,pull_request
$ git grep -c 'publish-for-real' -- .github/workflows/release.yml
.github/workflows/release.yml:6
```

176 changesets are pending (the row's "177" counts the README, and its "178" in Done-when counts neither: **176 is the
measured figure**). The shipped bump-back script pushes straight to `main` and the branch rules require a pull request:
it would be refused, which is why the version pull request is the only path.

### DECISION 3 — every release must be better than the last: the gate runs on each one and blocks only a REAL regression

**Decision:** the gate is never softened. It has two parts. **The part a runner can prove** (`release:gate:ci`, the consumer
gate, the packed-install check) blocks as it does today. **The part that needs a Windows worker** (the stability gate, and
the NVDA layer's qualification) is a VERDICT recorded against a commit sha, which the release READS, the way
`release-reuses-verdict.mjs` already reads the coverage verdict. "Real" is decided by re-running a failed verdict ONCE on a
fresh capture, never by loosening a threshold and never by removing the check. A block files a row and does NOT revert
(fix forward, chairman 2026-09-24). **A verdict that is ABSENT is not a pass and is not a regression:** the release waits
on it with a named condition (`Waiting-for:`) and the lab is asked for it.

**Owner:** #3136 wires the read; #3132 measures the fleet part first, and is `orchestrator`'s (it needs the fleet).

```
$ grep -n '"release:gate' package.json | cut -c1-110
147:    "release:gate:ci": "pnpm run scorer:verify && pnpm run release:provenance && pnpm run release:rehearsa
148:    "release:gate": "pnpm run scorer:verify && pnpm run release:provenance && pnpm run release:rehearsal-c
$ grep -n -o 'gate:nvda-release[^&]*\|gate:stability[^&]*' package.json | head -3
95:gate:stability": "tsx packages/lab/scripts/stability-gate.mjs",
96:gate:nvda-release": "node packages/lab/scripts/nvda-release-gate.mjs",
148:gate:nvda-release 
```

**UNMEASURED today, named so nobody reads a guess as a figure:** the wall-clock of the fleet part; its false-block rate; and
which packages need it at all (a documents package has no NVDA layer). #3132 takes all three before #3136 wires anything.

### DECISION 4 — consumers upgrade automatically, through the org's own path

**Decision:** a new release of a dependency opens a dependency pull request in each consumer, from the platform:
Dependabot first (it is a file, not an app); Renovate only if a measurement shows Dependabot cannot read the `agent-org`
git-tag pin. It merges when green THROUGH THE ORG'S OWN PATH: the review requirement is not bypassed
(`bypass_pull_request_allowances` stays empty), the org's reviewer approves, the queue merges, no human acts. The
merge-blocking `Acceptance:` and `Closes` body checks refuse a bot's body today, so a dependency pull request needs a
declared, narrow way through them.

**Owner:** #3133 (the configuration), #3137 (the body-check way through).

```
$ ls .github/dependabot.yml .github/renovate.json renovate.json
ls: cannot access '.github/dependabot.yml': No such file or directory
ls: cannot access '.github/renovate.json': No such file or directory
ls: cannot access 'renovate.json': No such file or directory
$ grep -n '"agent-org":' package.json
221:    "agent-org": "github:a11ign/agent-org#semver:^0.1.0",
```

No dependency-update configuration exists. **UNMEASURED:** whether Dependabot reads a `github:owner/repo#semver:` pin. That
is the one measurement that decides Renovate, and #3133 takes it first.

### DECISION 5 — the split is re-shaped: each move is a vertical slice that ends with its repository RELEASING ON ITS OWN

**Decision:** a move is done when the repository has its CI, its own release workflow (OIDC, or tag plus GitHub Release if
the package is private), its first release read back from the registry or the Releases page, a dependency-update
configuration, and `a11ign` consuming it by range. No move blocks another except by a real dependency: M2 waits on M1's
first release because the fleet imports the worker by name; M6 waits on M5. ADR 0040's "release per repository" amendment is
the first half of this.

**Owner:** `product-manager` amends the move rows' Done-when; the rows are #2701 to #2705 and #3125.

```
$ grep -c 'RELEASE PER REPOSITORY' docs/adr/0040-agent-org-is-a-standalone-project-agnostic-tool.md
1
$ gh api repos/a11ign/a11ign/issues/2702/dependencies/blocked_by --jq '[.[].number]|join(",")'
2701
```

### DECISION 6 — a11ign's own release starts now, from what is on `main`, and does not wait for the split

**Decision:** the first release after `0.1.0` is cut from `main` as it stands, by hand once (#3130); the automatic release
(#3131) follows. Three packages in the monorepo (`screenreader-worker`, `screenreader-fleet`, `documents`) are non-private
and have no trusted publisher bound yet, so **what the first release publishes is #3126's question, not this ADR's**.

**Owner:** #3130.

```
$ gh release list --repo a11ign/a11ign --exclude-drafts --limit 100 --json tagName,publishedAt --jq '.[]|"\(.tagName) \(.publishedAt)"'
v0.1.0 2026-09-24T07:46:06Z
$ for f in packages/*/package.json; do node -e "const p=require('./$f');console.log(p.name, p.private===true?'private':'public')"; done | grep public | tr '\n' ';'
a11ign public;@a11ign/evidence public;@a11ign/judge public;@a11ign/screenreader-worker public;@a11ign/documents public;@a11ign/scorer public;@a11ign/screenreader-fleet public;
```

### DECISION 7 — MEASURED DAILY on #928, per repository: the four DORA metrics

**Decision:** four metrics, read from the registry and GitHub and **never from the org's own state** (a tick journal, a
label, a row comment): the org would be grading its own work with its own ledger. The reading is taken once per UTC day by
`agent-org` (#3135) for the seven repositories declared in `a11ign` (#3138), and posted on #928.

**Owner:** #3135 (the measurement), #3138 (the declaration).

#### DEPLOYMENT FREQUENCY

**Definition:** releases per UTC day, per repository. The target is at least one on any UTC day on which a releasable change
merged.
**Input:** a registry-published repository's release times from `npm view <package> time --json`; a repository that publishes
to no registry, from `gh release list --repo a11ign/<repository> --exclude-drafts --json tagName,publishedAt`; the days with a
releasable change from `gh pr list --repo a11ign/<repository> --state merged --json mergedAt,files`.

#### LEAD TIME

**Definition:** the merge of a change to the publish of the FIRST release containing it: median and maximum, per repository.
**Input:** the pull request's `mergedAt` and merge commit from `gh pr view <n> --json mergedAt,mergeCommit`; the earliest
release containing that commit from `git tag --contains <sha>`, whose time is the registry's or the Release's.

#### CHANGE FAILURE RATE

**Definition:** releases later deprecated, or followed within 24 hours by a release that closes a row labelled `regression`,
over releases.
**Input:** deprecation from `npm view <package>@<version> deprecated`; the rows from `gh issue list --label regression --state
closed --json number,closedAt`, matched to the release that contains the closing pull request's merge commit.

#### TIME TO RESTORE

**Definition:** that `regression` row's opening to the publish of the release that closes it.
**Input:** the row's `createdAt` from `gh issue view <n> --json createdAt`; the closing release's publish time as under LEAD TIME.

**Baseline, stated:** a11ign has made 1 release in 14 days (2026-09-19 to 2026-10-03), so deployment frequency is 1 in 14, and the
lead time of each of the 664 merges since is unbounded (no release contains one). **Change failure rate and time to restore are UNDEFINED**: one
release, no failure recorded, and a ratio over one is not a rate.

```
$ gh label list --repo a11ign/a11ign --limit 200 --json name --jq '[.[]|select(.name|test("regress"))]|length'
0
```

**The `regression` label does not exist.** Change failure rate and time to restore cannot be read until it does, and an empty
read would be indistinguishable from "no failures". **No filed row creates it** (#3135 reads it and does not create it): the
finding is on #3135, whose Done-when gains the label and the rule for applying it. Until a release has been followed by a
closed `regression` row or a deprecation, both metrics are reported UNDEFINED, never 0%.

## What this does NOT change

The zero-false-positive claim, the asserted-versus-referred split, and `main`'s review requirement are untouched. Releasing
more often moves WHEN a gate runs, never WHETHER.

## Consequences

- **A release per merge is a release per merge only if the fleet part keeps up.** If the stability gate takes hours, "one
  a day at the very worst" is what the cadence becomes. That is why #3132 measures before #3136 wires.
- **The version pull request is a pull request like any other**, so it waits on review and on the queue: lead time has a floor
  of one gate cycle, and the DORA reading will show it rather than hide it.
- **Dependency pull requests multiply the gate's load** (one per consumer per release). The first measurement of that is the
  first week of #3133's configuration.
- **A block never reverts.** It files a row, and the next release carries the fix; a deprecated version is the record.
- **Until the split lands, a11ign's release publishes names no trusted publisher is bound to** (#3126), so the first release
  after the amendment may have to skip them.

## Alternatives rejected

- **A shared release train for all repositories.** Rejected: it ties a repository that is ready to one that is not, which is
  the waterfall again, and it needs a coordinator with write access to seven repositories.
- **Conventional commits with no version commit.** Rejected: a changeset already carries intent per package, 176 are pending,
  and the tool is in use; replacing it would discard that intent to save one file per change.
- **A direct push of the version bump to `main`.** Rejected: refused by #2022. The shipped bump-back script does exactly
  this and would fail on the first run.
- **Publishing the fleet part's verdict as a blocking check on every pull request.** Rejected: its cost is UNMEASURED
  (decision 3), and a per-pull-request fleet check could hold the queue behind a single shared Windows resource.

## What would falsify this

- **Falsified if** the fleet part's wall-clock, once measured (#3132), exceeds a day: a release per merge is then not
  achievable and the cadence is a release per fleet cycle, which this ADR must be amended to say.
- **Falsified if** Dependabot cannot read the `agent-org` pin AND Renovate cannot either: consumers then upgrade by hand and
  decision 4 fails.
- **Falsified if** the daily DORA reading shows lead time's median above one day for a month on a repository that merges daily.
- **Falsified if** the false-block rate of a re-run verdict is high enough that people re-run until green: the gate is then
  softened by habit, which decision 3 forbids.

## Appendix: the rows filed beside this ADR

Read from #928's 2026-10-03 re-plan and the rows' own edges (`gh api repos/a11ign/a11ign/issues/<n>/dependencies/blocked_by`) at
the commit above. **Carries** names the decision a row makes true; **Blocked by** is the native edge, or the named condition
when the wait is not an edge.

### ROW 3130 — release a11ign from main now

**Carries:** DECISION 6.
**Blocked by:** nothing.

### ROW 3131 — a11ign releases itself: a version pull request on merge, a publish on its merge

**Carries:** DECISION 2.
**Blocked by:** nothing by edge. Its first real run may wait on #3130 and on #3126.

### ROW 3132 — measure the fleet part of the release gate

**Carries:** DECISION 3.
**Blocked by:** nothing. Lane `orchestrator`, `fleet-gated`: it needs the fleet, which an engineer may not touch.

### ROW 3133 — a11ign takes dependency updates from the platform

**Carries:** DECISION 4.
**Blocked by:** nothing.

### ROW 3134 — agent-org releases itself

**Carries:** DECISION 2.
**Blocked by:** nothing.

### ROW 3135 — agent-org measures the four DORA metrics per repository, daily

**Carries:** DECISION 7.
**Blocked by:** nothing.

### ROW 3136 — the release reads the fleet part's verdict by commit sha

**Carries:** DECISION 3.
**Blocked by:** #3131 and #3132.

### ROW 3137 — a dependency pull request passes the merge gate without a human

**Carries:** DECISION 4.
**Blocked by:** #3133.

### ROW 3138 — a11ign declares the seven repositories the DORA reading measures

**Carries:** DECISION 7.
**Blocked by:** #3135.

### ROW 3143 — a repository boundary refuses a cross-repository `workspace:`, `link:`, `file:` or relative import

**Carries:** DECISION 1.
**Blocked by:** #2701 (the first cross-repository edge is cut there). Filed by the row that wrote this ADR, because the
appendix found no row carrying decision 1's refusal test.

### ROW 2701 — the split, move 1: nvda-worker and nvda-speech to a11ign/screenreader-worker

**Carries:** DECISION 5, and the first edge DECISION 1's refusal test needs.
**Blocked by:** #3123 and #3124.

### ROW 2702 — the split, move 2: worker-fleet to a11ign/screenreader-fleet

**Carries:** DECISION 5.
**Blocked by:** #2701.

### ROW 2703 — the split, move 3: lab to a11ign/lab

**Carries:** DECISION 5.
**Blocked by:** #2701, #2702 and #2623.

### ROW 2704 — the split, move 4: control to a11ign/control

**Carries:** DECISION 5.
**Blocked by:** #2623, #2702 and #2703.

### ROW 2705 — the split, move 5: pdf to a11ign/documents

**Carries:** DECISION 5.
**Blocked by:** nothing.

### ROW 3125 — the split, move 6: cli depends on @a11ign/documents by version range

**Carries:** DECISION 5.
**Blocked by:** #2705.

### ROW 3126 — the monorepo's own release would publish three packages before their repositories release them

**Carries:** DECISION 6.
**Blocked by:** nothing by edge; it must land before the first real release.
