# Announcement-emulator spike (row #5661)

**Status: in progress. Q1 answered (yes, with gaps). Q2 stage 1 passed (NVDA's own Python imports and speaks on Linux); stage 2 not
started. Q3 not run.** This page is the spike's deliverable ([ADR 0047](./adr/0047-an-nvda-faithful-announcement-emulator-is-a-separate-repository-and-its-predictions-are-advisory.md), Decision 7). The spike's code
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
- **Not yet tested**: that these fields are *sufficient* for layers 2 and 3. Q1 so far shows what the API offers, not that the mapping built
  on it reproduces `ax_platform_node_win.cc` (the 507-test check). That is the next step before Q3.

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
- **Stage 2 (not started):** that stand-in (layers 2 and 3), then those tests' pages driven through it, with the pass count and each
  failed exact-speech assertion pasted here.

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
