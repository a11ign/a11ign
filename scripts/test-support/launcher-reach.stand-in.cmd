@echo off
rem A STAND-IN, NOT THE LAYER'S FILE (#3447). `launcher-reach.cmd` belongs to the worker layer (a11ign/screenreader-worker), whose
rem main does not carry it yet (it was written in this repository by #3397 and left behind when the package was deleted). The provision stamp
rem READS two values from the real one, so the tests that follow the stamp's list read these lines instead. They are the declaration's
rem `set` lines verbatim as of d8952882f. What stands in for deleting this file (#3758): a NIGHTLY check,
rem packages/guards/nightly/launcher-reach-drift.test.ts, reads the layer's src/launcher-reach.cmd from the layer's main and fails when
rem its three `set` lines differ from these; a red there means the layer's file moved, and the answer is a core row that updates these lines.
rem This file goes, and `stamp-files.ts` reads the layer's own, only if the layer publishes the file in its package or the core gains a layer
rem checkout for another reason.
set "CHECKOUT_ROOT=%~dp0..\..\.."
set "FLT=packages\worker-fleet\src\provisioning\apply-foreground-lock-timeout.ps1"
set "CAPTURE_CHECK=packages\lab\src\harnesses\capture-check.mjs"
