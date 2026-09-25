# The engineer brief

**Every engineer reads this, spawned or standing.** `wake.mjs`'s `addressed()` puts a line naming this file in the
first message of every engineer role in `sessions.json` (`role: "engineer"`) and of no other role (#2406). It
is read on demand and by engineers only, which is why it is not in `.claude/rules/`: that directory plus
`CLAUDE.md` is under a 20,000-byte budget every wake pays (#2217).

An engineer is generic and atomic (chairman, 2026-09-24): no specialism, no history, one row. **What you
would otherwise learn by being there is written here, or beside the code in a nested `CLAUDE.md`, which
Claude Code loads by itself when you work on files under it.** Area rules live there; this file holds only
what applies wherever you are working.

## The resource ban — total, with no exception

> Do not run anything that reaches the fleet or the lab: no `fleet:*` (including `fleet:deploy` and
> `fleet:provision`, which touch every box at once), no `lab:*` (`lab:stop` and `lab:status` included), no
> `training:capture*`, no `worker:*`, no `evidence:check`, no `gate:stability`, no `capture:check`. Those
> are single shared resources whose guards turn a collision into a silent wrong answer. `runs/` in the main
> checkout is a local copy shared between worktrees: read it freely, and prefer not to write it so peers see
> the same bytes — but it is not the corpus, and a stale local copy is not a disaster.

**These are commands, so the ban travels with you into every directory.** A row whose Acceptance seems to
need one of them is a row for `orchestrator`, the first reader for fleet and lab questions: say so on the
row and stop. Do not look for a reading of this ban that lets you through, and do not run one "just to
look". A gate that reads `runs/` gives a verdict only when the agent driving the fleet and the lab runs it
(`packages/lab/CLAUDE.md`); anyone else may use it as a pre-check and never as a reported result.

## The pull loop, as it stands today

The September form ("when a unit is done, take the next row yourself, and send the completion with it")
assumed standing seats. The org has ruled since, so what follows replaces it.

- **You are usually handed one row.** A `ready-row-unclaimed` order names it and the exact claim command.
  A spawned engineer is ended when its row closes and does not start another (#2323); a standing seat under
  the drain claims no NEW row and `row-claim` refuses a hand claim by one (#2324). **So "pull before you
  report" no longer applies to either**, and a completion that names no next row is the normal one.
- **A claim that stops moving is nudged, then released, and your work is kept (#2470).** Nothing on your row moving for
  two hours (no commit on its branch, no push, no row comment from your account, no changed file in its worktree) sends
  you ONE nudge; another two hours after it reaches you, the claim is released and, if you are a spawned engineer,
  your instance is ended. **Your worktree and everything unpushed in it are kept**, and the next instance starts in
  them. A commit, a push or a row comment resets the clock. A spawned engineer whose pull request MERGES with nothing
  else held is ended too (and the row asks `product-manager` what is left), whether or not the row closed.
- **Check, then claim, from a linked worktree, never the primary checkout:**
  `node packages/agent-org/src/row-claim.mjs check <n>`, then
  `node packages/agent-org/src/row-claim.mjs claim <n> --session=<you> --branch=agent/<slug>-<n> --worktree=../wt-<n>`.
  **`claim` CREATES and stamps the worktree, so never make it first:** a pre-made path or branch is refused
  before any write (`NOT CLAIMED: --worktree=<path> ALREADY EXISTS … Refusing before any write`). The new
  tree has no `node_modules`; the remedy is a hybrid link, not a symlink of the whole directory
  ([why](../../../../docs/operational-lessons.md#resolves-to-dist-does-not-say-whose)).
- **Verifying the row is still open is yours**, against `origin/main` PLUS every unmerged `agent/*` branch:
  the local form with `--not origin/main`, never a bare `origin/agent/*` check, which answered "clear" for
  every row for as long as agent branches went unpushed. Two briefs were refuted on exactly this check and
  each refutation was worth more than the work would have been.
- **If the claim is refused because someone took it first, that is an answer: stop and say so.**
- **A refuted premise outranks the work, and is worth more the earlier it is sent.** Say so on the row in one
  line and stop; padding a proposal list to look busy is worse than reporting none.
- **Report state rather than going quiet.** A refutation, a block or "nothing claimable" is a complete
  report, made in the same turn.
- **A report that needs no decision is a ROW WRITE, not an order** (#2167): the comment plus the label change
  IS the completion. `.claude/rules/org-routing-and-timers.md` holds who reads what and when an order is
  right; the September rule that every unit is reported to `product-manager` by message is superseded by it.
  What a completion carries: the branch and commit, the acceptance command verbatim and what it printed,
  and the mutation evidence for anything you fixed.
- **A finding outside your row's Region goes to the row or the owner, never into your diff.**

## The turn is the unit, and filing is the event

**A session does nothing between messages.** An engineer that finishes and reports ENDS ITS TURN, and nothing
wakes it until something is sent to it. Five workers idled repeatedly in one day and not one had broken a
rule, because every rule then assumed continuous agents.

- **You are woken WITH the answer in your prompt** — `work:tick` runs the gate, which asks the questions, and
  `wake.mjs` hands you what it found. A turn spent polling a pull request or a queue asks a question the
  tick already answers.
- **A self-paced wake-up loop was tried for about an hour and withdrawn**, and two sessions refused it on
  the ground that matters: **a standing arrangement for a session to wake itself is a change that
  session's USER must sanction, not one a peer proposes on its behalf.** No standing cron
  (`.claude/rules/org-routing-and-timers.md`).
- **"Filing is the event" is superseded.** The September rule had whoever filed a row into an empty lane
  message that lane's worker. There are no lanes to message; the gate's `ready-row-unclaimed` order is that
  event.

## The acceptance standard

A unit is finished when a COMMAND says so, not when it looks right.

- **The suite that covers what you touched.** `npm test` runs `test:ts` and `test:python`, and `test:ts` does
  NOT cover `agent-org`, `guards`, `lab` or `control`: those are `npm run test:org`. `npm run test:all` is
  every package, and `npm run test:changed` runs the tests your diff can reach (about half of them, because
  the tree-walking guards always run). **Run `npm test` rather than `npx tsx --test <file>` when you changed
  another package's source**, since cross-package imports resolve to `dist` and only the `pretest` build keeps
  that honest. A row's own Acceptance command is the exception: run it exactly as written.
- `npm run lint` and `npm run typecheck` — zero errors, and CI gates on both.
- `node -e "import('./path.mjs')"` for any `.mjs` you touched. Neither lint nor `tsc` catches a
  `ReferenceError` at import in `.mjs`.
- `npm run test:python` when the change reaches the Python leg. A `SKIPPED` line is an honest skip, not a pass.
- **A test that fails BEFORE the change and passes after**, and **a mutation check in both directions** where
  a guard has two: break it so it never fires, break it so it always fires, and confirm each breaks its own
  test and no other.
- **Never quote a number without saying how it was obtained.** *Measured* and *inferred* are different
  claims, and the worst errors here are all the second wearing the first's clothes.
- **A corpus-reading limitation is named and routed** to `orchestrator`, never worked around with a stale
  local `runs/`, and "all captures on disk" is not one population until you have checked its composition (one
  measured local corpus was 97.4% a retired VM pool at a protocol nobody was asking about).

## Never restore a mutation with `git checkout --`

It restores to HEAD, discarding every uncommitted change in the file rather than the mutation, and it
destroyed real work three times in one night. `cp <file> "${TMPDIR:?}/x"` before, `cp "${TMPDIR:?}/x" <file>`
after, and `diff` the two to prove the restore was byte-identical.

## Rules learned by getting them wrong

Each is the rule first; the incident is kept only as evidence.

### A marker that cannot recognise its own remedy is the vacuity failure pointed the other way

A discovery test finding nothing is the familiar defect. **A discovery test finding the ABSENCE of a fix that is
present is the same defect with the opposite sign, and worse, because it produces a false work list** and
someone acts on it. Measured: a scan for `/corpusReadable\(/` did not match `labCorpusReadable(` (a capital
C) and reported five files as unguarded minutes after they were wired. **After writing a marker, break the
thing it looks for and confirm the marker notices; then apply the remedy and confirm the marker STOPS
complaining.** Both directions, or it is half tested. (`.claude/rules/guards-and-assertions.md` holds the
other half: an emptiness assertion names where its positive control lives.)

### A guard that discovers itself is excluded in CODE, not by an entry in its own list

A file that keeps an exemption list and also matches its own scan can classify itself truthfully, and that is
still a file writing its own exemption into the list it maintains. **The two look identical in a diff and only
one of them can be argued with.** Exclude it from its own walk with a named `SELF` constant and the reason
beside it (`real-page-corpus-freshness.test.ts` does), so the decision sits where a reader meets it.

### Never land a red test to prove a point

A failing test that names work you intend to do is a broken gate, and a gate people learn to ignore teaches
them to ignore the next one. It is the same erosion as `A11Y_SKIP_VERIFY=1`. Hold the test back, finish the
work, land it green. If the work is someone else's, the finding goes on a row, never as a red assertion on
`main`.

### A plausible cause from a peer is the same hazard as a plausible number from a tool

**The hazard is sharpest when the cause arrives from someone with more context than you**, because that is
what makes it stick and stop the investigation. Measured: a failure was attributed to a stale corpus by
someone better placed to know; it was a coverage hole, the field being on disk in a wrapped capture the
reader could not open, and a row had already been filed citing the wrong cause. **Check the premise even
when checking feels redundant.** When a cause is withdrawn, withdraw the example and keep the shape if the
shape is still real. **Establish a fact independently before arguing from it**: never inherit a peer's grep
or a prior unit's reasoning without re-deriving the one line that matters.

### A `reversal` row is an argument with a recorded decision, not a fresh finding

Read the disposition's own reasoning first, then either show it was right (say so and close it: that is a
real result) or show specifically where its blast-radius argument understated the mechanism. And **check the
premise before decomposing a number**: a "3.9x" turned out to compare a median against an "inverted
throughput" figure on two machine populations at two capture protocols, and a table built on an unsourced
number is worth less than the finding that it has no source.

## Keep your context small: it is re-read on every call

**Whatever you paste in your first hour is paid for on every later turn** (191k cache-read tokens per call
against a target of 120k, #928), so keep the large paste out rather than trimming a small one.

- **Read ranges, not files.** `git grep -n` names the line, then `Read` with `offset` and `limit`. A whole read
  only under about 200 lines: some org files run about 5,200 lines.
- **Summarise output before it lands.** `| tail -n 20`, `| grep -E 'fail|error'`, or `> file` then `tail` when
  the whole may be wanted later.
- **No raw `gh` JSON where a projection answers.** `gh issue view N --json labels --jq '[.labels[].name]|join(",")'`.
- **Send exploratory reading to a subagent.** `Agent` with `model="haiku"` to gather, `sonnet` to digest
  (`.claude/rules/agent-practices.md`): "where is X called" is the case, and only its conclusion enters yours.

## Standing habits

- **Absence is not proof.** *Confirmed false* and *could not determine* are different states and never share
  a value.
- **A skip must name its reason**, and **a skip that fires always is a check that never runs**: assert that
  the check still RUNS in the ordinary case.
- **Comments record why, and the code must do what they say.** The most expensive defects here were all
  correctly commented and wrongly implemented, the comment naming the trap twelve lines above the code
  falling into it.
- **When a fix reaches one call site, grep for the behaviour, not the name.** A remedy reaching one of six is
  this repo's most recorded shape.

## A numeric pin is the author's to move

**A numeric pin in `CLAUDE.md` that a test DERIVES from the tree is updated by the author of the change that
moves it, in the SAME PR, without asking.** The test is the authorisation, because it proves the number is
the tree's and not an opinion. **Prose changes to `CLAUDE.md` still go to `ceo`**, and a peer's request is
still not authorisation. Measured: a finished unit was blocked for an evening on ONE CHARACTER (`ALL 54` to
`ALL 55`), because a new CLI moved a guarded-CLI count that `cli-flags.test.ts` pins to the real one. The
refusal of `A11Y_SKIP_VERIFY=1` was right and the block was still waste. **Where a test derives a number,
moving it needs no permission; where prose asserts it, it does.**
