# Why the pinned Edge MSI did not land on workers 7, 8 and 9 (#4732)

**The same MSI, with the same SHA-256, laid down `152.0.4191.66` on worker 11 and nothing on workers 7, 8 and 9. Edge had already updated itself past the pin on those three, and Chromium's installer declines to install over a newer build while still logging success.** The role then stopped at the Edge step, so the three boxes missed every later step and the fleet kept two `provisionRevision` stamps.

Read on 2026-10-11 over ssh as `witness`, read-only: no install, no registry write, no service change. The boxes were woken with `fleet:wake` (all four "wake proved").

## What the MSI did

Open-check, 2026-10-10, taken on the control plane:

```
worker-7:  MicrosoftEdgeEnterpriseX64-152.0.4191.66.msi 259088384 5BCF8CD57351…18DF   dirs: 152.0.4191.62,154.0.4258.62
worker-8:  MicrosoftEdgeEnterpriseX64-152.0.4191.66.msi 259088384 5BCF8CD57351…18DF   dirs: 152.0.4191.62,154.0.4258.62
worker-9:  MicrosoftEdgeEnterpriseX64-152.0.4191.66.msi 259088384 5BCF8CD57351…18DF   dirs: 152.0.4191.62,154.0.4258.62
worker-11: MicrosoftEdgeEnterpriseX64-152.0.4191.66.msi 259088384 5BCF8CD57351…18DF   dirs: 152.0.4191.66,154.0.4258.62
```

The file is identical on all four. What differs is what was already in `Application\`.

## The cause, step by step

1. **Before the window, 7, 8 and 9 had self-updated to `154.0.4258.62`.** The EdgeUpdate service and tasks are disabled by the step AFTER the Edge step, which the role never reached on them. Application dirs on worker 7 (8 and 9 have the same shape, created 07:39:52 and 07:41:16):

   ```
   154.0.4258.62   CreationTime 09/10/2026 07:39:21
   msedge.exe      LastWriteTime 08/10/2026 03:51:54   <- the launcher was never renamed: it still reads the .62 build
   ```

2. **The pin's check reads the BINARY, `msedge.exe`, which still said `152.0.4191.62`.** That is below the pin (`.66`), so `edge-version.yml` took the plain install path: no `ALLOWDOWNGRADE=1`, and the "NEWER than the pin" refusal did not fire. `152.0.4191.62` was already in `Application\` on 7-9: it is the earlier 2026-09-04 pin, not a version the current pin names. Worker 7, 2026-10-10:

   ```
   10-10 05:14:11 1033 Windows Installer installed the product. Product Name: Microsoft Edge. Product Version: 152.0.4191.66. ... status: 0.
   ```

   It is the only `MsiInstaller` event between 04:50 and 06:00: no `1040` (beginning a transaction), no `11707`, no `1042`. A success line with no transaction is the installer declining. `edge-version.yml` already documents this mechanism from worker 5 on 2026-08-25: `win_package` ran the MSI and reported ok, no directory appeared, because Chromium's installer declines to install over a newer build.

3. **The next task then threw.** `--rename-chrome-exe` runs `<dir>\152.0.4191.66\Installer\setup.exe`, and no `152.0.4191.66` directory exists on 7-9. That is the stop at the Edge step.

4. **Worker 11 differs in one fact: its `152.0.4191.66` directory already existed** (CreationTime 04/09/2026 23:43, from an earlier pin). The MSI ran a real transaction and the rename found its `setup.exe`:

   ```
   10-10 05:14:16 1033 ...152.0.4191.66...                  (the same no-transaction line)
   10-10 05:14:17 1040 Beginning a Windows Installer transaction: C:\Windows\Temp\MicrosoftEdgeEnterpriseX64-152.0.4191.66.msi
   10-10 05:15:51 11707 Installation completed successfully.   1033   1042
   152.0.4191.66   CreationTime 04/09/2026  LastWriteTime 10/10/2026 05:16:02
   ```

   Same MSI, same SHA-256, same newer `154` on disk, different result.

## It has moved since the row was filed

7, 8 and 9 now read `155.0.4283.45` (the registered product, the Uninstall key and `msedge.exe` all agree; dirs `154` and `155`, created 10-10 21:30-21:31). The updater was still live on them: `MicrosoftEdgeUpdateTaskMachineCore` is `Running` and the `edgeupdate` service is `Automatic`. On worker 11 all three EdgeUpdate tasks and both services are `Disabled`, and it reads `152.0.4191.66`. All four are on Windows 26100.9457.

So the MSI cannot go back over `155` without `worker_edge_allow_downgrade=true`, which the role refuses on purpose because a rollback risks exposure to known security issues. And 7-9 keep drifting until the updater is stopped.

## Which fix carries the cause

**a11ign#4939** carries it (product-manager ruling 2026-10-11, rule (a): follow forward, do not roll back). The pin moves to the build the enterprise index publishes at build time (`155.0.4283.45` at filing, with its SHA-256 read from the index), and the updater tasks and services are stopped BEFORE the install, so a box that stops at the Edge step cannot drift. It is a change to `edge-version.yml` and `defaults/main.yml`, so it is a control row and not part of this file.

The live window is not part of this row: workers 7, 8 and 9 reading the new `browserVersion` in `/health`, and a whole-fleet `fleet:provision` ending `failed=0` for all 15 with one `provisionRevision`. That is its own VERIFY row, filed at #4939's merge.
