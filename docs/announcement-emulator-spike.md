# Announcement-emulator spike (row #5661)

**Status: in progress. Q1 answered (yes, with gaps). Q2 stage 1 passed (NVDA's own Python imports and speaks on Linux); Q2 stage 2 is
running: a first slice of 4 system tests, 13 exact-speech assertions, 10 exact matches (see Q2; this is not the gate number). Q3 not run.** This page is the spike's deliverable ([ADR 0047](./adr/0047-an-nvda-faithful-announcement-emulator-is-a-separate-repository-and-its-predictions-are-advisory.md), Decision 7). The spike's code
lives **outside any a11ign repository**, on the host that ran it at `~/spikes/announcement-emulator-5661`; nothing here is a prediction
and nothing was written to an evidence field.

**Where a number comes from is marked on the number:** *measured* (run in this row, output pasted), *quoted* (copied, not re-run) or *not
checked*. A reading is a moment.

## Dates

| | |
|---|---|
| Row claimed, first command run | 2026-10-17 |
| Chairman's direction dropping the wait on #2568 | 2026-10-17, on #5661 |
| Budget | 3 weeks from the first commit: until 2026-11-07 |
| Q3 start | when the fleet captures on one build and one Edge version (#4405, #5311) |

## Q1. Can a browser we launch on Linux give the full tree through `chrome.automation`?

**Yes, in a build with the allowlist switch, through `chrome.automation.getDesktop()`. Not through `getTree()`.**

- **Browser.** Chrome for Testing **149.0.7827.55** (*measured*, `--version`) and **155.0.8059.84** (*measured*; 155 is the milestone of the fleet's
  Edge **155.0.4283.45**, `worker_edge_version`; the build numbers differ because Edge and Chrome for Testing number their builds
  separately). Launched with `--headless=new`, so no X server is needed. **Chrome 155 and 149 expose the same set of node fields** (*measured*:
  union of enumerable fields over the same fixture, no field in one and not the other).
- **Does the allowlist switch work?** Yes, and it is required. The companion extension declares a top-level `automation` manifest key (not a
  `permissions` entry, which silently gives no API: `chrome.automation` was `undefined`). Launched with
  `--allowlisted-extension-id=<id>` (the id fixed by a manifest `key`), the service worker sees `chrome.automation`. **Without the switch
  the extension loads but `chrome.automation` is `undefined`** (*measured*, fresh profile, same extension: the service worker throws
  `Cannot read properties of undefined (reading 'getDesktop')` and posts nothing).
- **`getTree(tabId)` is not in this build's API surface** (*measured*: `Object.keys(chrome.automation)` lists `addTreeChangeObserver,
  getAccessibilityFocus, getDesktop, getFocus, removeTreeChangeObserver, setDocumentSelection` and the enums; no `getTree`). **`getDesktop()`
  with `"desktop": true` returns the whole browser, and the page's `rootWebArea` hangs under it** with its full subtree. The ADR's layer 1
  should say `getDesktop`, not `getTree`.
- **Fixture size.** A 10-element page gave 107 desktop nodes, 73 of them in the web area; a 30-element page with forms, a grid, a tree, live
  regions, an iframe and a contenteditable gave 127 web nodes (149) and 131 (155). Roles seen include `heading, link, button, textField,
  checkBox, popUpButton, slider, treeItem, table, row, cell, columnHeader, navigation, main, form, region, alert, legend, list, listItem,
  image, inlineTextBox, staticText`.
- **Fields present** (enumerated on the live nodes): `role, name, nameFrom, value, description, descriptionFrom, state{focusable, focused,
  linked, editable, required, expanded, collapsed, multiline, multiselectable, richlyEditable, invisible, offscreen, ...}, checked,
  hierarchicalLevel, setSize, posInSet, htmlTag, htmlId, inputType, display, language, detectedLanguage, placeholder, roleDescription,
  ariaCurrentState, invalidState, hasPopup, sortDirection, valueForRange/min/max, liveStatus, liveAtomic, liveRelevant, containerLive*,
  tableRowCount, tableColumnCount, tableCellRowIndex, tableCellColumnIndex, tableCellRowSpan/ColumnSpan, tableCellAria*Index,
  tableCellRowHeaders/ColumnHeaders, lineStartOffsets, wordStarts/Ends, sentenceStarts/Ends, activeDescendantFor, controlledBy,
  describedBy, labelFor, indexInParent, bold, italic, underline, lineThrough, fontFamily, fontSize, color, backgroundColor, location,
  url, selected, textSelStart/End` and events through `addEventListener`. **These are the table indices, set position and size, `lang`
  and `display` that the ADR says `getFullAXTree` lacks.**
- **Fields NOT present** (*measured*: `'x' in node` false or the member undefined on every node): a general `htmlAttributes` map (so the
  IA2 object attributes NVDA reads from ARIA, such as `xml-roles`, must be rebuilt from `role` plus the typed fields),
  `textAlign`/`textDirection`/`textPosition`/`textStyle`/`listStyle`, `keyShortcuts`, `ariaAtomic` as such (`liveAtomic` exists), `readOnly`
  as such (`restriction` exists). **There is no `hypertext` string**: layer 2 has to build it from `children`, `name` and `value`.
- **Sufficiency for layers 2 and 3, first reading** (*measured* in Q2 stage 2, slice 1): for the roles, states, names, descriptions,
  levels, links and landmarks in the 7 matching assertions the fields were enough. Three things the slice found: node identity is not
  exposed (`node.id` is undefined), so label and described-by relations had to be resolved by object identity within one walk (the
  extractor now numbers nodes and emits `labelledByIx`, `labelForIx`); there is no author `role` string, so the IA2 `xml-roles` attribute
  cannot be read (reconstructed for article, figure, region, switch and the landmarks; the slice needed it once, see below); and the platform tree differs from what Chrome gives NVDA on Windows where the
  browser consults the OS (the image-description prompt above). The 507-test check against `ax_platform_node_win.cc` has **not** been run.

## Q2. Does NVDA's own Python, at the fleet's release, run on Linux with stubs?

**Stage 1 (import and speak): yes.** NVDA **2026.1.1** (the fleet's release, *quoted* from `docs/capture-cost.md`) at tag
`release-2026.1.1`, commit `5d92106f17e461dac62aa48257bbbf4183e033d0` (2026-05-18), **unmodified** (*measured*: `git status` over the checkout shows
0 changed files after the runs). CPython **3.13.16**; NVDA's `pyproject.toml` requires `>=3.13,<3.14`, which is why the host's 3.14.4 was
not used.

*Measured*, one run:

```
OK   controlTypes   OK   characterProcessing   OK   speech   OK   speech.speech   OK   speech.commands
OK   textInfos      OK   browseMode            OK   virtualBuffers   OK   documentBase   OK   speechDictHandler
heading1 -> ['Welcome', 'heading']        link -> ['Home', 'link']        button -> ['Send', 'button']
checkbox -> ['Agree', 'check box', 'checked']        edit-required -> ['Name', 'edit', 'required']
```

The last five lines are NVDA's own `speech.speech.getPropertiesSpeech`, called with the properties of nodes from the Q1 fixture. They show
the speech code **executes**; they are not a comparison against anything, and `heading1` omits its level because the call did not pass one.

- **What was stubbed, and nothing else.** An import hook returns a permissive empty module for 33 names, kept in a ledger: the Windows
  standard-library modules (`winreg`, `winsound`, `msvcrt`, `ctypes.windll` and its siblings), the Windows packages (`comtypes`, `wx`),
  NVDA's own Windows-binding modules (`winBindings`, `winUser`, `winKernel`, `NVDAHelper`, `easeOfAccess`, `wasapi`), the generated COM
  interfaces (`comInterfaces`, absent from the source tree because scons generates them), the braille and GUI stack (`braille`, `louisHelper`,
  `gui`, `tones`, `nvwave`, `ui`, `vision`, `bdDetect`, `brailleInput`, `brailleViewer`, `mouseHandler`) and the object layer
  (`IAccessibleHandler`, `UIAHandler`, `JABHandler`, `oleacc`, `oleTypes`, `objidl`, `eventHandler`, `api`, `review`, `NVDAObjects`,
  `appModuleHandler`). **Speech, `browseMode`, `virtualBuffers`, `textInfos`, `documentBase`, `controlTypes`, `characterProcessing`,
  `speechDictHandler` and `config` are NVDA's real code.** `config.initialize()` and `languageHandler.setLanguage("en")` ran as NVDA's own
  unit-test bootstrap does.
- **What this does not show.** Four of the stubbed names are not inert for the real work: `NVDAObjects`, `eventHandler`, `api` and the
  virtual-buffer text source are where layers 3 and 5 plug in. Stubbed, `virtualBuffers` imports but builds no buffer. **Stage 2 is the
  buffer builder**, and it is what the 51 (below: 47) system tests need.
- **The system-test population does not match the ADR's quote** (*measured* on the checkout): `tests/system/robot/chromeTests.robot` holds
  **47** test cases and `chromeTests.py` **43** `def test_` functions, against the ADR's quoted **51**; assertion calls in `chromeTests.py`
  are **219** by grep (160 `strings_match`, 31 `speech_matches`, 2 `speech_contains`, 24 `braille_matches`, 2 `braille_contains`), so
  **193 speech and 26 braille**, against the quoted "about 220 exact-speech". The 51 may be another release; **the row's number is the
  checkout's, 47 tests and 193 speech assertions, until shown otherwise.**
- **The seam is 13 native functions plus one handle type** (*measured*: `grep -o "localLib\.VBuf[A-Za-z_]*"` over
  `source/virtualBuffers/__init__.py`): `VBuf_createBuffer, destroyBuffer, getTextLength, getTextInRange` (called with `useMarkup` true and
  false), `getLineOffsets, getFieldNodeOffsets, getSelectionOffsets, setSelectionOffsets, locateControlFieldNodeAtOffset,
  locateTextFieldNodeAtOffset, getControlFieldNodeWithIdentifier, getIdentifierFromControlFieldNode, findNodeByAttributes` and
  `VBufRemote_bufferHandle_t`. `gecko_ia2.py` itself calls none of them: everything NVDA does with a buffer goes through that one module
  object, so **stage 2 is a Python stand-in for `NVDAHelper.localLib` that builds its buffer from the Q1 tree**, and the XML parsing,
  field handling and speech above it stay NVDA's.
- **The seam is wider than the 13 above** (*measured* while building stage 2). Running a key press through NVDA's real browse-mode scripts
  also reaches `localLib.calculateWordOffsets` and `calculateCharacterOffsets` (`textInfos/offsets.py`), so the native surface is **15
  functions**, and two of the pieces the first count treated as stubs are not inert: `IAccessibleHandler`'s role and state tables
  (`_normalizeControlField` calls them, so the stand-in has to feed NVDA the real `oleacc`/`IAccessible2` constants and let that module
  import), and the speech synth (`getSynth().name` is read by spelling speech). Three build artefacts are absent from the source tree
  and had to be supplied: the generated `comInterfaces`, `locale/en/cldr.dic` (an **empty** file in the spike's overlay `appDir`, so
  emoji and CLDR symbol names are not covered), and the test run's NVDA settings.
- **Stage 2, slice 1 (*measured*, 2026-10-17).** Layers 2 and 3 are a Python stand-in, `emu/standin.py` on the spike host (about 745 lines):
  layer 2 maps a `chrome.automation` node to what Chromium's `AXPlatformNodeWin` gives NVDA, with the role tables **generated** from
  Chromium 155.0.8059.84 `ax_platform_node_win.cc` (205 MSAA roles, 83 IA2 overrides) and the IA2 constants from `ia2_api_all.idl`;
  layer 3 is a port of `gecko_ia2.cpp` `fillVBuf` and `storage.cpp` (markup, offsets, line offsets, `findNodeByAttributes`). Above the
  seam it is NVDA's own `virtualBuffers`, `textInfos`, `cursorManager`, `browseMode` and `speech` code, unmodified (*measured*:
  `git status` over the NVDA checkout is clean after the run). The pages, keys and expected strings are **taken from
  `tests/system/robot/chromeTests.py` by AST** (not retyped), the page wrapper is `ChromeLib._writeTestFile`, the speech is captured as
  `speechSpyGlobalPlugin` does (each sequence joined, stripped, sequences joined by newline), and NVDA runs under the tests' own
  `standard-dontShowWelcomeDialog.ini`.

  | test | assertions | exact | what a miss is |
  |---|---|---|---|
  | `test_ariaRoleDescription_block_browseMode` | 3 | 3 | |
  | `test_ariaDescription_browseMode` | 4 | 4 | |
  | `test_quickNavTargetReporting` | 3 | 3 | |
  | `test_ariaRoleDescription_inline_browseMode` | 3 | 0 | the expected line contains Chrome's image-description prompt ("To get missing image descriptions, open the context menu."); the Linux headless tree carries `aria-roledescription` and no prompt. This is the **browser's output differing** (it depends on Chrome's screen-reader detection and an image-label preference, cause not yet isolated), not the emulator; the next two assertions (word movement) start from that line |
  | **total** | **13** | **10** | |

  **The 10 of 13 is a fit, not a prediction, and it is not the gate.** The first run was 4 of 7 (before the fourth test was wired). Three
  fixes were made **after reading the expected strings**: the harness (the tests run with `unicodeNormalization = DISABLED` and
  `reportLinkType = False`, which I had not loaded; the extractor now also replays the tests' `set_configValue` calls), a missing
  layer-2 attribute (`description-from`, so NVDA did not speak aria-descriptions), and `xml-roles`. **`xml-roles` is reconstructed, not
  read**: it is Chromium's `kRole` string, `chrome.automation` does not expose it, and NVDA reads it to tell an article, figure, region,
  switch or landmark from a plain document or group (`gecko_ia2.py:180-200`). The stand-in fills it from the automation role for those
  roles, which over-reports where Chromium sets no `kRole` for a native element; that is an inference, not a reading, and the one
  assertion that needed it (`article  A bunch of text.`) now passes on it. Four tests is 4 of 43; the gate is exact agreement on real
  pages' top 10 shapes against fleet transcripts, which is Q3 and is not started.
- **What the 43 tests need** (*measured*, `classify.py` over the AST; 160 `strings_match`, 31 `speech_matches` and 2 `speech_contains` =
  **193 speech assertions**, as in Q2 above). A test can need several things, so these counts overlap: **16 tests (77 steps) press `tab`,
  `NVDA+space` or `enter`, which need layer 5 and an NVDAObject for the focused element**, the largest piece not yet started; 6 need
  table navigation, 4 say-all, 2 the review cursor, 4 assert braille, and 18 have a page or expectation the extractor cannot evaluate
  yet (the five `reportLanguage*` tests also depend on Windows locale names from `languageHandler.getLanguageDescription`, an OS
  dependency). Only 4 tests (13 steps) need nothing but buffer keys and quick navigation, which the stand-in now runs (all four are in the
  table above). `tab` alone is 29 of the 145 key actions.
- **A new OS dependency the ADR does not list:** word movement uses Uniscribe's `ScriptBreak` (`nvdaHelper/local/textUtils.cpp`). The
  control flow of `_calculateUniscribeOffsets` is ported; the break attributes are an approximation of Unicode word stops. Any
  word-unit result is therefore Windows-OS-dependent when it differs.

## Q3. How closely does it agree with fleet transcripts on the real-page corpus?

**Not run.** It needs a consistent oracle: the fleet has taken no capture since 2026-10-12 and #5311 is open (the chairman's direction on
#5661). It also needs the Q2 stage 2 buffer. Q3 starts when the fleet captures on one build and one Edge version.

## Gate

**Not measured.** Gate: at least 98% exact agreement on the 10 most common announcement shapes, every miss explained as an emulator bug or a
Windows-only behaviour. Measured exact agreement: **none yet; denominator: none yet.** Below the gate the spike stops and this page is the
write-up. Nothing beyond the spike is built before the gate passes.

## Reproduction (on the spike host)

- Q1: `~/spikes/announcement-emulator-5661/q1/run.mjs allow <out.json>` launches the browser with the extension and the allowlist switch
  and writes what the extension heard. The negative control is `run.mjs noallow`. Chrome needs libraries the host lacks (`libatk`,
  `libasound`, `libXdamage`, `libavahi`, ...), unpacked without root under `libs/root` and put on `LD_LIBRARY_PATH`.
- Q2: `~/spikes/announcement-emulator-5661/q2/run-import.sh <modules and script>` (the stub list is in the script).
- Q2 stage 2: `cd ~/spikes/announcement-emulator-5661/emu && ../q2/venv/bin/python run_cases.py` captures each in-scope test's page in
  Chrome 155 (`capture.py`, cached under `emu/captures/`), builds the buffer (`standin.py`), presses the test's keys through NVDA's own
  scripts (`driver.py`) and prints each exact-string comparison; `classify.py` prints the table of what the other tests need;
  `gen_tables.py` regenerates the role tables from the Chromium and NVDA sources. The code is outside every a11ign repository.
