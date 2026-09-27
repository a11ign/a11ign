---
"@a11ign/nvda-worker": patch
"@a11ign/worker-fleet": patch
---

**`/health` no longer runs `powershell.exe` for `windowsVersion`, `screenReaderVersion` or `browserVersion` either (#2684) -- the #2673 stall again, for the three reads #2678 left.** `runtimeEnvironment`'s 5 s rebuild called `bootConstant`/`fileProductVersion` for these three straight from `/health`'s request path, and neither memoises a failure: a version that had not yet been read, or a binary that had changed on disk, re-ran `powershell.exe` SYNCHRONOUSLY on every rebuild for as long as it could not answer, blocking Node's event loop for the whole call on every route. The three facts are now sampled by a timer (`createVersionSampler`, `file-version.mjs`) with ASYNCHRONOUS PowerShell, so they are still re-read under a running worker and a change stays visible, and a request only reads the last sample. **The sample carries its age:** `environment.versionsSampledMsAgo`, computed at read time. The version-changed warning, the fields' meaning and their `"unknown"` fallback are unchanged; the capture cache key is unchanged. It is worker code, so it reaches the boxes with `fleet:deploy`.

`@a11ign/worker-fleet`'s `fleet-consistency.test.ts` is a no-op for a consumer: its own `workerReportedFieldsSource` helper, which scans `nvda-worker`'s source for the field names `/health` sends, now also reads `file-version.mjs`'s `current()` block, since the three fields above moved out of the block it already read.
