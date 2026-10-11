/**
 * HOW THE TOOL'S DEPENDENCIES ARE INSTALLED IN CI: FROM THE TAG'S LOCKFILE WHEN IT HAS ONE (#4988).
 *
 * `scripts/agent-org-newest-tag.ts` installed agent-org v0.155.0 with `npm install --no-package-lock`, a fresh resolution that crashed
 * (`edgesOut`, then `ERESOLVE`) and minutes later installed the same tree, so every a11ign PR and `auto-arm` went red. The choice is now
 * made by whether the tag carries `pnpm-lock.yaml`, and this file pins the choice with the installer injected, so no test here installs
 * anything or reaches a network:
 *
 *   - a lockfile in the tag runs `npx pnpm@10.34.5 install --frozen-lockfile --ignore-scripts` in the tag's directory, 10.34.5 being the
 *     version agent-org's `release.yml` pins. NOT the job's own pnpm: CI's `corepack pnpm` resolved 12.11.2 on the first run of this change, and
 *     its `minimumReleaseAge` refused a lockfile entry a day old (`ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION`);
 *   - no lockfile runs the npm `--no-package-lock` install, the path an older tag still needs;
 *   - each way logs which path ran, because a CI log is where a later crash gets read.
 *
 * The positive control for "the lockfile branch is taken" is the first test (the pnpm argv is asserted, not merely "something ran");
 * the control for "the npm branch is still reachable" is the second. Removing the lockfile check sends the first to npm and fails it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { installToolDependencies, TOOL_PNPM_VERSION } from "../../../scripts/agent-org-newest-tag.ts";
import { tempDir } from "./test-tmp.ts";

type Invocation = { command: string; args: string[] };

/** A tag directory as `git clone` leaves it: a manifest, and a lockfile only when asked. */
function tagDirectory({ lockfile }: { lockfile: boolean }): string {
  const dir = tempDir("newest-tag-install-");
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "agent-org", version: "0.0.0" }));
  if (lockfile) writeFileSync(join(dir, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
  return dir;
}

/** Run `installToolDependencies` with the installer and the CLI resolution injected, so nothing is installed. */
function install(dir: string) {
  const ran: { invocation: Invocation; cwd: string }[] = [];
  const logged: string[] = [];
  const path = installToolDependencies({
    dest: dir,
    run: (invocation, cwd) => void ran.push({ invocation, cwd }),
    log: (line) => void logged.push(line),
    npmCli: (name, args) => ({ command: `/job/node/${name}`, args }),
  });
  return { path, ran, logged };
}

test("a tag WITH pnpm-lock.yaml is installed `npx pnpm@10.34.5 install --frozen-lockfile --ignore-scripts`, in the tag's directory, and says so", () => {
  const dir = tagDirectory({ lockfile: true });
  const { path, ran, logged } = install(dir);
  assert.equal(path, "pnpm-frozen-lockfile");
  assert.deepEqual(ran, [{
    invocation: { command: "/job/node/npx", args: ["pnpm@10.34.5", "install", "--frozen-lockfile", "--ignore-scripts"] },
    cwd: dir,
  }]);
  assert.equal(logged.length, 1);
  assert.match(logged[0], /install path: npx pnpm@10\.34\.5 --frozen-lockfile/);
});

test("a tag WITHOUT a lockfile keeps `npm install --no-package-lock`, and says so", () => {
  const dir = tagDirectory({ lockfile: false });
  const { path, ran, logged } = install(dir);
  assert.equal(path, "npm-fresh-resolution");
  assert.deepEqual(ran, [{
    invocation: { command: "/job/node/npm", args: ["install", "--no-save", "--no-package-lock", "--ignore-scripts", "--no-audit", "--no-fund"] },
    cwd: dir,
  }]);
  assert.equal(logged.length, 1);
  assert.match(logged[0], /install path: npm, fresh resolution/);
});

test("the pinned pnpm is the version agent-org's own release.yml declares, not a number this file chose", () => {
  assert.equal(TOOL_PNPM_VERSION, "10.34.5");
  // a11ign's own `packageManager` is the same pnpm today; if they drift apart on purpose, this line is the one to move, with the reason.
  const manifest = JSON.parse(readFileSync(fileURLToPath(new URL("../../../package.json", import.meta.url)), "utf8")) as { packageManager?: string };
  assert.equal(manifest.packageManager, `pnpm@${TOOL_PNPM_VERSION}`);
});
