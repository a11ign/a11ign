# ADR 0047: an NVDA-faithful announcement emulator is a separate repository, and its predictions are advisory

## Status

**Proposed, 2026-10-16.** Row #5659, precondition 3 of the announcement-emulator spike and the spike's first deliverable. The decision is
**the chairman's** (direction relayed on #928, comment 6222449096, 2026-10-16, Part B); this ADR states it, tests it against the ADRs it
touches, and says what would falsify it. It does not re-decide it. **It changes no code in any repository and creates no repository:** the
repository is created by the spike's own row, after #2568. `ceo` reviews.

**Where a number comes from is marked on the number:** *measured* (the author ran a command in this row), *quoted* (copied from the
chairman's direction or from a script header, and not re-run by the author) or *not checked*. A reading is a moment.

## Context

**No public tool models a specific screen reader** (quoted from the direction, not checked by the author): Guidepup's virtual screen reader,
Silktide's simulator and Fangs use generic rules, and say so. The product's claim is that *a real screen reader announced this*
(the `nvda-speech` README); a tool that predicts what NVDA would say, on any
operating system, with a **measured, published agreement rate against the fleet**, would let a Linux runner or a Mac say something about the
words without a Windows worker. It would also be the thing most able to damage that claim, because a prediction reads exactly like an
observation.

Three facts frame the choice:

- **Licences allow it** (quoted, not checked): NVDA is GPL-2.0-or-later and Chromium is BSD-3. `nvda-speech` already takes NVDA's code under
  GPL-3.0 (its `package.json` declares `GPL-3.0-or-later`, *measured*: read in a worktree copy of the package on 2026-10-16) and its README says
  "or later" is what makes the port combinable with this repository's AGPL-3.0 engine.
- **NVDA still reads Chrome through IA2** (quoted): its UIA setting defaults to "only when necessary" (nvaccess/nvda#19276). So what must be
  rebuilt is what sits below NVDA's virtual buffer, and NVDA's own code can do the speaking above it.
- **`nvda-speech` exists and is small.** It is a pure function, accessibility node in and announcement string out, ported from
  `controlTypes/role.py`, `controlTypes/state.py`, `locale/en/symbols.dic` and `speech/speech.py`. Its own script header records *"18,371
  announcements, 33 distinct shapes, top 10 covering 94.3%"* (`scripts/measure_announcement_shapes.py:10`; **quoted**, the author did not re-run
  it). Its README requires a guard test, *"a test that fails if predicted text appears in an evidence field"*, and that test exists in
  neither repository today (the chairman's precondition 1, **not checked** by the author beyond the direction's statement).

### What the existing decisions say

- **[ADR 0021](./0021-the-layer-that-decides-must-be-the-layer-allowed-to-claim.md)**: the layer that decides a subtype must be the layer
  allowed to claim it. A claim rests on evidence that is **decisive**, and the tool's asserted findings read what NVDA *said*. A prediction is
  not what NVDA said. ADR 0021 is therefore the reason predictions cannot decide a subtype, and nothing in it is changed here.
- **[ADR 0032](./0032-the-scorer-runs-as-a-subprocess-in-a-python-venv.md)**: the trained scorer runs out-of-process, chosen by the caller,
  and `@a11ign/scorer` ships paths and provenance, no `score()`. That is the precedent for data crossing a process boundary rather than a
  library import. Its stated reasons are weight and venv, not licence; this ADR borrows the *shape*, and says so, rather than claiming 0032
  decided a licence boundary.
- **[ADR 0045](./0045-a-repository-uses-another-only-through-its-published-package.md)**: a repository uses another only through its
  published package, at a declared version, with no exceptions, and a new edge in the graph is a change to that ADR. The emulator is a new
  repository and so a new node; Decision 3 below adds its edge to 0045's graph.
- **[Outcome 10](../outcomes/outcome-10-linux-path.md)** decided: build the rule-layer-only path on Linux, build no Linux accessibility-tree
  census, and **keep every screen-reader reading on Windows**. **[Outcome 11](../outcomes/outcome-11-playwright-suite.md)** decided that a DOM
  or accessibility-tree snapshot handed in by an adopter is *"not worth building"* because *"the capture is NVDA reading a live browser
  window, so a snapshot is a different product (no script, no focus, no live region) and could not be what NVDA announces"*
  (`outcome-11-playwright-suite.md:30`). Both are read here at the text, not from memory.

## Decision

### Decision 1: the layer, and what it is

**An emulator that predicts the exact words NVDA would speak while browsing a page in Chromium on Windows, runnable on any operating system,
with an agreement rate against the fleet that is measured and published.** Seven layers, numbered from the driver up (the chairman's):

| # | Layer | What it is |
|---|---|---|
| 0 | **Driver** | Edge at the fleet's pinned version, so the oracle and the emulator see the same engine (the Chrome preset has never taken a capture, quoted). Launched with `--force-renderer-accessibility`, since Blink otherwise leaves out content a screen reader would get. Windows user agent, 1024x768 window, keys sent over CDP. |
| 1 | **Tree source** | `chrome.automation` through a companion extension allowlisted with `--allowlisted-extension-id`, read with `chrome.automation.getDesktop()`: nearly the full internal tree, plus events. CDP `getFullAXTree` is a **fallback only**; it lacks table indices, set position and size, hypertext, text attributes, `lang` and `display` (quoted). *Corrected 2026-10-23 (A11-177):* the call is `getDesktop()`, under which the page's tree hangs; `getTree()` is not in the API of Chrome for Testing 155, the fleet Edge's milestone (*measured* in the [spike's write-up](https://github.com/a11ign/announcement-emulator/blob/40b2d3bb19b7a39546001272bd003de3d655f528/docs/announcement-emulator-spike.md), Q1). |
| 2 | **Windows mapping** | The subset of Chromium's `ax_platform_node_win.cc` and `ax_platform_node_base.cc` that NVDA reads: IA2 role, states, object attributes, hypertext. Checked against the **507** Chromium accessibility tests that carry both `-expected-blink.txt` and `-expected-win.txt` (quoted). |
| 3 | **Buffer builder** | The line logic of NVDA's `gecko_ia2.cpp` `fillVBuf` and `vbufBase/storage.cpp`, emitting the marked-up text `VBuf_getTextInRange(useMarkup=True)` returns. **That text is the seam.** |
| 4 | **NVDA's own code, above the seam** | NVDA's Python, **unmodified**, at the fleet's NVDA release, with its Windows modules stubbed: `browseMode`, `speech`, `virtualBuffers`, `controlTypes`, `characterProcessing` with its symbol and CLDR data, `speechDictHandler` with `builtin.dic`, `configSpec`. **It is not translated:** NVDA ships three or four releases a year and a translation drifts, so a new release is a version bump followed by a re-measure. |
| 5 | **Event bridge** | Focus, browse/focus mode switching, page load and busy state, live regions (`ia2LiveRegions.cpp`), the speech queue. |
| 6 | **Prediction record** | Its own `Report` field; it **never writes to `transcript`**. |

Layers 2 to 5 are the work; none of it is built by this ADR.

### Decision 2: predictions are advisory, never evidence

**No subtype is decided by a prediction.** A prediction is a different kind of thing from a transcript, and the emulator's output is
structurally distinct from observed output: its own record, its own field names, and a guard test that fails if predicted text appears in an
evidence field (precondition 1, owed before the spike starts). This is ADR 0021 applied to a new source: the asserting layer's four subtypes
read what NVDA *said*, and what a model said NVDA would say is not that. It is also the `nvda-speech` README's boundary, "this package
predicts, it does not observe", carried over whole.

**Revisiting this needs a year of agreement data, and the call is the chairman's.** Neither an agreement rate nor a gate pass in the spike
reopens it.

### Decision 3: its own repository, GPL-3.0, used only through its published package

- **A separate repository, licence GPL-3.0.** It **absorbs `nvda-speech`** (which already declares `GPL-3.0-or-later`; the new repository's
  licence is the chairman's GPL-3.0, and the spike row states whether it is "only" or "or later").
- **Other repositories use it only through its published package, at a declared version** (ADR 0045, Decision 1). Its edge in 0045's graph is
  *a consumer -> emulator, by version, and the emulator depends on nothing of ours except what it declares*; **adding that edge is this ADR's
  amendment to 0045's Decision 2**, as rule 5 requires ("a new edge is a change to this ADR, not to a baseline"). Which consumer holds the
  edge is the spike's decision; this ADR only says there is at most one direction.
- **Apache-2.0 packages never import it.** `@a11ign/evidence` is Apache-2.0 so third parties can write capture backends without inheriting a
  copyleft obligation (ADR 0006, as the `nvda-speech` README cites it). **Data crosses a process boundary**, as the scorer's does (ADR 0032):
  a consumer spawns the emulator and reads what it writes, and never links it.
- **The name.** See "The name, and NV Access's position" below.

### Decision 4: outcomes 10 and 11 are superseded for this layer only

- **Outcome 11's objection** ("no script, no focus, no live region", for a *snapshot*) is answered for this layer: the emulator **drives a
  live browser** (layer 0), so there is a script, there is focus, and layer 5 carries live regions. The sentence's premise was a static tree
  handed in; that is not what this layer takes.
- **Outcome 10's "keep every screen-reader reading on Windows" still stands, for evidence.** A prediction is not a reading. A Linux run
  using the emulator reports predictions in the prediction record and claims no reading, so outcome 10's `--no-screen-reader` honesty rule
  (the report says no screen reader ran) is unchanged and applies in full.
- **Nothing else in either document is touched.** Outcome 11's refusal to accept a snapshot from an adopter's suite stands.

### Decision 5: ARIA-AT's recorded outputs are for measurement only

The W3C Document License restricts derivatives. ARIA-AT's recorded screen-reader outputs may be **compared against**; they are never copied
into the emulator's data, its symbol or expectation tables, or its tests as fixtures that ship. (Quoted from the direction; the licence text is
**not checked** by the author, and the spike row checks it before the first comparison.)

### Decision 6: the agreement rate is published from the first CI release

From the first release the emulator's CI publishes its measured agreement rate against the fleet's transcripts, with the population it was
measured on and the NVDA release and Edge version it ran at. A number that is not published is an opinion, and a rate quoted without its
population is the failure this repository's other ADRs record.

### Decision 7: the spike's gate

A spike of **2 to 3 weeks, after #2568** (quoted), asking:

- **Q1.** Can a browser we launch on Linux give the full tree through `chrome.automation`? Does the allowlist switch work in the build used?
  Do the fields cover what layers 2 and 3 need?
- **Q2.** Does NVDA's own Python, at the fleet's release, run on Linux with stubs? It must pass NVDA's own Chrome system tests
  (`tests/system/robot/chromeTests.py`: **47 tests, 193 speech assertions (227 exact-speech assertion executions)**, quoted from
  the [spike's write-up](https://github.com/a11ign/announcement-emulator/blob/40b2d3bb19b7a39546001272bd003de3d655f528/docs/announcement-emulator-spike.md), Q2, where they are *measured* at NVDA 2026.1.1;
  *corrected 2026-10-23 (A11-177)* from the "51 tests, about 220 exact-speech assertions" first quoted here, not checked), under the settings those tests use.
- **Q3.** How closely does it agree with fleet transcripts on the real-page corpus, for headings, links, buttons, form fields, landmarks, lists?

**Gate: at least 98% exact agreement on the 10 most common announcement shapes** (`nvda-speech` counts 33 shapes; the top 10 make up **94.3%**
of announcements, quoted from its script header), **every miss explained as either an emulator bug or a Windows-only behaviour, and below the
gate the work stops and is written up.** **Nothing beyond the spike is built before the gate passes:** no CI engine, no listen mode, no
extension.

**What 98% on those shapes does and does not say.** The 10 shapes are 94.3% of announcements, so 98% of them is at most about 92.4% of all
announcements *if every other shape were wrong* (`0.98 x 0.943`, **inferred** arithmetic, not a measurement). The gate is deliberately
narrow; the published rate (Decision 6) is the honest number, and the gate is the permission to keep building.

### Preconditions (the chairman's, owed before the spike starts)

1. The guard test described in Decision 2. 2. The fleet on one Edge version (#4405): on 2026-10-10 it was split 12/3 (quoted), and an oracle on
two versions measures noise. 3. This ADR.

## The name, and NV Access's position

**Checked on 2026-10-16** by fetching, through a research subagent (the author read its quotations, not the pages): nvaccess.org
(`/about-nv-access/`, `/about-nvda/`, `/corporate-government/`, the product page) and the `nvaccess/nvda` repository (`readme.md`,
`copying.txt`, `.github/CONTRIBUTING.md`, `projectDocs/dev/contributing.md`, `projectDocs/product_vision.md`, `projectDocs/community/readme.md`,
`projectDocs/dev/readme.md`, and a search of the tree for trademark, fork, derivative, brand, logo and rename).

- **Found:** NV Access asserts registered marks, and only for the logos. `https://www.nvaccess.org/about-nv-access/`: *"The NV Access logo and
  NVDA logo are both ® Registered Trade Marks of NV Access Limited."* The NVDA logo is also marked ® on `/about-nvda/`. Neither page sets out
  any rule for using them.
- **Not found:** a published position on the **word** "NVDA" in a third party's package or product name, on "NVDA-compatible" wording, or
  on forks and derived products. In those words: **not found.** The only "fork" text in the repository is GitHub workflow advice.
- **Licence wording, which is not a naming rule.** `readme.md`: *"NVDA is available under a modified GNU General Public License version 2 or
  later."* `copying.txt`: *"...version 2 or later, with two special exceptions"* (non-GPL components in plugins and drivers, and Microsoft
  distributable code). The Microsoft exception restricts use of **Microsoft's** trademarks in program names, not NVDA's. The "or later"
  holds in both files, which is what Decision 3's GPL-3.0 relies on; the word "modified" is not explained in either, and the spike row reads
  the two exceptions before layer 4 stubs anything.

**Absence is not permission.** Not finding a policy is *could not determine*, and a registered mark on a logo says nothing either way about
the word. So the ADR decides on the safe side and leaves the question open to the one party who can close it:

1. **The package and repository are not named with "NVDA" as their identifier.** The working name is `announcement-emulator` (repository
   `a11ign/announcement-emulator`, package `@a11ign/announcement-emulator`); the spike row confirms the name is free on the registry
   (**not checked**). Documentation may say, factually, that it *predicts what NVDA would speak*; it does not use the NVDA logo, and does not
   say it is NVDA, endorsed by NV Access, or "NVDA-compatible".
2. **Someone asks NV Access** before the first published release, and the answer goes on the spike's row. That is an outward-facing message
   from the organisation, so it is `ceo`'s to send or delegate; this ADR does not send it.
3. If NV Access replies that the name is welcome, renaming to include it is a one-row change. If it objects to the use at all, that is a
   falsifier (below).

## Consequences

- **A new repository, a new licence boundary and a new release train to keep, for an advisory output.** The cost is paid before the benefit:
  the gate decides whether any of it continues, and below it the repository is not built beyond the spike.
- **The advisory rule limits the product's upside on purpose.** Even at 100% agreement, no subtype changes owner, and the asserting count
  (`asserting-subtypes.test.ts`) does not move. What the emulator buys is *triage and coverage on runners without a worker*, never a claim.
- **A drift cost per NVDA release**, paid as a bump and a re-measure (Decision 1, layer 4). If the fleet and the emulator are on different NVDA
  releases the agreement rate measures the release gap, which is why the rate is published with both versions.
- **Layers 2 and 3 are a re-implementation of C++ in another language and will drift from Chromium and NVDA.** Layer 2's 507-test check bounds
  Chromium drift; nothing bounds layer 3's drift except the agreement rate.
- **`nvda-speech` stops being a package in `screenreader-worker`'s lineage** once absorbed, and its consumers move to the emulator's published
  package under ADR 0045. Which cut and in what order is the spike's row, not this ADR's.
- **ADR 0045's graph gains a node and an edge** (Decision 3).

## Alternatives rejected

- **Keep predicting inside `nvda-speech`, in the existing repository.** Rejected: a pure function from a node to a string cannot model the
  buffer, browse mode or the event stream, which are most of what decides the words; and growing a GPL-derived package inside an
  Apache-2.0-adjacent repository puts the licence boundary one import away from the evidence layer.
- **Translate NVDA's Python to another language.** Rejected by the chairman: NVDA ships three or four releases a year, so a translation
  drifts; running NVDA's own code unmodified turns a release into a version bump and a re-measure.
- **Generic rules, as Guidepup's virtual screen reader, Silktide's simulator and Fangs do.** Rejected: they do not model a specific screen
  reader (quoted), which is the only claim worth the tool.
- **Use CDP `getFullAXTree` as the primary tree source.** Rejected: it lacks table indices, set position and size, hypertext, text attributes,
  `lang` and `display`. Kept as a fallback.
- **Let a prediction decide a subtype once the rate is high.** Rejected, and reopened only on a year of agreement data by the chairman
  (Decision 2). ADR 0021's reason is not a rate: a prediction is not what NVDA said.
- **Link it as a library from the Apache-2.0 packages.** Rejected: copyleft would reach the packages that exist so third parties need not
  inherit it. Process boundary instead (ADR 0032's shape).
- **Copy ARIA-AT's recorded outputs in as expectations.** Rejected: the W3C Document License restricts derivatives (Decision 5). Measurement
  only.
- **Build a Linux accessibility-tree census instead (outcome 10's rejected path).** Not reopened: outcome 10 found no rules-owned subtype can
  use a tree alone; the emulator is a different product that does not assert.

## What would falsify this

- **The spike's gate failing** (Decision 7): below 98% on the top 10 shapes, or a miss that is neither an emulator bug nor a Windows-only
  behaviour. The work stops and is written up; this ADR's status becomes *superseded by the write-up*, not silently ignored.
- **The agreement rate falling when the fleet's NVDA release moves**, by more than the bump-and-re-measure the design promises. That would say
  layer 4's "unmodified" does not hold in practice, and the translation alternative should be re-argued.
- **A prediction appearing in an evidence field.** The guard test of Decision 2 exists to catch it; one escape means the structural separation
  failed and Decision 2 needs a stronger form.
- **`chrome.automation` not giving the fields layers 2 and 3 need** (Q1): layer 1 falls back to a tree that lacks them, and the design's
  premise about the tree source is false.
- **NV Access objecting to the name or the derived use** (see above): the name changes; the architecture does not depend on it.
- **A year of agreement data** is the condition on which Decision 2 may be revisited by the chairman. It is not a falsifier of the decision;
  it is the stated condition for a new one.
