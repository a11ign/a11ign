@echo off
rem A STAND-IN, NOT THE LAYER'S FILE (#3447). `launcher-reach.cmd` belongs to the worker layer (a11ign/screenreader-worker), whose
rem main does not carry it yet (it was written in this repository by #3397 and left behind when the package was deleted). The provision stamp
rem READS two values from the real one, so the tests that follow the stamp's list read these lines instead. They are the declaration's
rem `set` lines verbatim as of d8952882f; when the layer carries the file and a checkout of it can be read here, this file is deleted
rem and `stamp-files.ts` reads the layer's own.
set "CHECKOUT_ROOT=%~dp0..\..\.."
set "FLT=packages\worker-fleet\src\provisioning\apply-foreground-lock-timeout.ps1"
set "CAPTURE_CHECK=packages\lab\src\harnesses\capture-check.mjs"
