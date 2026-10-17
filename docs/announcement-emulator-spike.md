# Announcement-emulator spike (row #5661)

**Status: in progress. Q1 answered (yes, with gaps). Q2 stage 1 passed (NVDA's own Python imports and speaks on Linux); Q2 stage 2 is
running: 18 of the 47 system tests, 71 exact-speech assertions, 56 exact, 12 tests exact on every assertion (see Q2; a fit to fixtures read, not the gate number). Q3 not run.** This page is the spike's deliverable ([ADR 0047](./adr/0047-an-nvda-faithful-announcement-emulator-is-a-separate-repository-and-its-predictions-are-advisory.md), Decision 7). The spike's code
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
- **Sufficiency for layers 2 and 3, reading so far** (*measured* in Q2 stage 2, 18 tests): for roles, states, names, descriptions,
  levels, links, landmarks, relations (labelled-by, error message, details) and text-field state the fields were enough to match 56 of 71
  exact-speech assertions. What the run found missing or different: (1) node identity is not exposed (`node.id` is undefined), so relations
  are resolved by object identity within one walk (the extractor numbers nodes and emits `labelledByIx`, `labelForIx`, `errorMessageForIx`);
  (2) there is no author `role` string, so IA2 `xml-roles` cannot be read and is reconstructed (see Q2); (3) there are no text-attribute
  runs in the API as IAccessibleText gives them (spelling and grammar markers), so `ARIAInvalid_spellingAndGrammar` is not matched; (4)
  `textSelStart`/`textSelEnd` give the caret in a text field, but a rich editable's text interleaved with child objects is not
  reconstructed yet; (5) the tree differs from what Chrome gives NVDA on Windows where the browser consults the OS (the image-description
  prompt). The 507-test check against `ax_platform_node_win.cc` has **not** been run.

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
  functions** (and `getTextFromIAccessible`, `findContentDescendant` for objects), and two of the pieces the first count treated as stubs are not inert: `IAccessibleHandler`'s role and state tables
  (`_normalizeControlField` calls them, so the stand-in has to feed NVDA the real `oleacc`/`IAccessible2` constants and let that module
  import), and the speech synth (`getSynth().name` is read by spelling speech). Three build artefacts are absent from the source tree
  and had to be supplied: the generated `comInterfaces`, `locale/en/cldr.dic` (an **empty** file in the spike's overlay `appDir`, so
  emoji and CLDR symbol names are not covered), and the test run's NVDA settings.
- **Stage 2 (*measured*, 2026-10-17): 18 of the 47 system tests run, 71 exact-speech assertions, 56 exact; 12 tests agree on every assertion.**
  What runs, layer by layer (the code is `~/spikes/announcement-emulator-5661/emu/` on the spike host, outside every a11ign repository):
  - **Layer 0, driver:** a live Chrome 155 launched with the allowlisted companion extension, keys sent over the DevTools protocol
    (`Input.dispatchKeyEvent`: Tab, Shift+Tab, Enter, Space move focus in the real browser), the tree and `getFocus()` re-read after each key.
  - **Layer 2, Windows mapping:** `standin.py` maps a `chrome.automation` node to what Chromium's `AXPlatformNodeWin` gives NVDA. Role
    tables are **generated** from Chromium 155.0.8059.84 `ax_platform_node_win.cc` (205 MSAA roles, 83 IA2 overrides) and the IA2 constants
    from `ia2_api_all.idl`; leaf, hypertext, state and attribute rules are ported with the C++ line cited. It is also presented as an
    IAccessible/IAccessible2 object (27 members, `objlayer.py`) so that **NVDA's own `NVDAObjects.IAccessible` Chrome classes
    (`chromium`, `ia2Web`) instantiate unmodified** and pick the same overlay classes (`Document`, `Editor`, `Ia2Web`).
  - **Layer 3, buffer builder:** a port of `gecko_ia2.cpp` `fillVBuf` (including aria details and error message) and `storage.cpp`
    (markup, offsets, line offsets, `findNodeByAttributes`).
  - **Layer 4, NVDA unmodified** (*measured*: `git status` over the checkout is clean): `ChromeVBuf`, `virtualBuffers`, `textInfos`,
    `cursorManager`, `browseMode` (including `event_gainFocus` and `_set_selection`), `speech` and `speechDictHandler`, `characterProcessing`
    with the pinned `nvda-cldr` `cldr.dic`, and the tests' own speech spy synth driver.
  - **Layer 5, event bridge, minimal:** after Tab the new tree is read, the buffer is rebuilt, the focus line is worked out as
    `api.setFocusObject` does (ported), and NVDA's own `event_gainFocus` runs. The buffer is **rebuilt per tree rather than updated
    incrementally**, and the caret offset is carried over by offset.
  - **The oracle** is the tests' own: pages, keys and expected strings are read from `tests/system/robot/chromeTests.py` by AST (the 47
    cases listed in `chromeTests.robot`), the page wrapper is `ChromeLib._writeTestFile`, the settings are
    `standard-dontShowWelcomeDialog.ini`, speech is captured as `speechSpyGlobalPlugin` does, and **each test runs in a fresh process**
    because NVDA is restarted for each test.

  | test | exact / asserted | what a miss is |
  |---|---|---|
  | `test_focusTargetReporting` | 9 / 9 | |
  | `test_ariaErrorMessage` | 10 / 10 | |
  | `test_i13307`, `test_ariaDescription_browseMode` | 4 / 4 each | |
  | `test_ariaRoleDescription_focus`, `_block_browseMode`, `preventDuplicateSpeechFromDescription_focus`, `test_quickNavTargetReporting` | 3 / 3 each | |
  | `test_mark_focus`, `test_i12147`, `test_focus_mode_on_focusable_read_only_lists`, `test_preventDuplicateSpeechFromDescription_browse_tab` | 2 / 2 each | |
  | `test_ariaDescription_focusMode` | 3 / 4 | the line text read by the IA2 text interface in an editable (see below) |
  | `test_ariaRoleDescription_block_contentEditable` | 4 / 5 | same |
  | `test_ariaRoleDescription_inline_contentEditable` | 1 / 5 | one of the same, three of the image prompt |
  | `test_i7562` | 1 / 5 | the IA2 text interface in a rich editable: line text, the list marker, "out of list" |
  | `test_ariaRoleDescription_inline_browseMode` | 0 / 3 | the image prompt |
  | `ARIAInvalid_spellingAndGrammar` | 0 / 2 | text attributes ("spelling error") |
  | **total, 18 tests** | **56 / 71** | |

  **The 15 misses are of three kinds, none yet a measured Windows-only behaviour:**
  (a) **6 are the browser's output differing**: the expected line carries Chrome's image-description prompt ("To get missing image
  descriptions, open the context menu."), which the headless Linux tree does not (its cause, probably Chrome's screen-reader detection
  and an image-label preference, is not isolated); (b) **7 are the emulator being incomplete**: `IAccessibleText` is implemented for a node
  whose hypertext is its own text, not for a rich editable whose text interleaves embedded children (`MozillaCompoundTextInfo` reads
  child offsets); (c) **2 are text attributes** (`IAccessibleText::attributes`, spelling and grammar markers) not yet mapped.

  **56 of 71 is a fit to fixtures I read, not a prediction, and it is not the gate.** Everything below was added or changed **after
  reading the expected strings**: the tests' NVDA settings, `description-from`, the `ChromeVBuf` buffer class (the first runs used the
  Firefox class), the real `cldr.dic` (an empty one gave "list    frogs" for a bullet), related-element lookups, aria details and error
  messages, `IAccessibleText`, and non-atomic text fields counting as text fields. Eighteen tests is 18 of 47, 71 of 158 evaluated
  `strings_match` calls; the gate is exact agreement on real pages' top 10 shapes against fleet transcripts, which is Q3 and is not started.
- **Reconstructed, not read:** IA2 `xml-roles` is Chromium's `kRole` string, `chrome.automation` does not expose it, and NVDA reads it to
  tell an article, figure, region, switch or landmark from a plain document or group (`gecko_ia2.py:180-200`). The stand-in fills it from
  the automation role for those roles, which over-reports where Chromium sets no `kRole` for a native element; it is an inference, and
  `test_quickNavTargetReporting` needs it. `getTextFromIAccessible` (the error message's text) and `findContentDescendant` are
  approximations of native routines, flagged in the code.
- **What the other 29 tests need** (*measured*, `classify.py`/`run_cases.py` over the AST): table navigation (`control+alt+arrows`, 8 tests
  or so, which needs the table half of `fillVBuf` and `IAccessibleTable2`), say-all (`NVDA+downArrow` and the table say-all keys), the review
  cursor (`numpad` keys), tests whose page or expectation the extractor cannot evaluate yet (including the five `reportLanguage*` tests,
  which also depend on Windows locale names from `languageHandler.getLanguageDescription`), and tests that assert braille.
- **A new OS dependency the ADR does not list:** word movement uses Uniscribe's `ScriptBreak` (`nvdaHelper/local/textUtils.cpp`). The
  control flow of `_calculateUniscribeOffsets` is ported; the break attributes are an approximation of Unicode word stops. Any word-unit
  result is therefore Windows-OS-dependent when it differs.

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
- Q2 stage 2: `cd ~/spikes/announcement-emulator-5661/emu && ../q2/venv/bin/python run_cases.py` runs each in-scope test in its own process:
  it starts a live Chrome 155 (`session.py`, `session.mjs`, the companion extension in `ext2/`), loads the test's wrapped page, replays the
  test's keys (`live.py`, `driver.py`), builds the buffer from the tree (`standin.py`, `objlayer.py`) and prints each exact-string comparison.
  `run_cases.py --one <test>` runs one; `classify.py` prints what the others need; `gen_tables.py` regenerates the role tables from the
  Chromium and NVDA sources. Needs `nvda-appdir/` (a symlink overlay of `source/` whose `locale/en/cldr.dic` is the pinned `nvda-cldr`
  data) and the settings file from the checkout. The code is outside every a11ign repository.
