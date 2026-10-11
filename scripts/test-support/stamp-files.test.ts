import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PUBLISHED_LAUNCHER, declaredLayerPath, stampEnvironmentFiles } from "./stamp-files.ts";

const ENTRIES = 5;
const REPO = join(dirname(fileURLToPath(import.meta.url)), "../..");

// The shape of `stamp-provision-revision.ps1` at screenreader-fleet v0.5.3 and v0.6.0: the first entry is a
// Get-LayerFile call, then two variables the stamp reads, then quoted paths with a comment between them.
const STAMP = `
$ENVIRONMENT_FILES = @(
    (Get-LayerFile -Layer 'screenreader-fleet' -Relative 'src/provisioning/provision-nvda-worker.ps1')
    $RUN_SERVER
    $FOREGROUND_LOCK
    'packages/control/ansible/roles/worker/defaults/main.yml'
    # a comment line is not an entry
    'scripts/provisioning/set-display-mode.ps1'
)
`;

test("the Get-LayerFile entry stays in the list, in its position, resolved from layers.json", () => {
  const files = stampEnvironmentFiles(STAMP);
  assert.equal(files.length, ENTRIES);
  assert.deepEqual(files, [
    `${declaredLayerPath("screenreader-fleet")}/src/provisioning/provision-nvda-worker.ps1`,
    PUBLISHED_LAUNCHER,
    files[2],
    "packages/control/ansible/roles/worker/defaults/main.yml",
    "scripts/provisioning/set-display-mode.ps1",
  ]);
  assert.ok(files[2], "the foreground-lock entry resolved to a path");
});

test("POSITIVE CONTROL: $RUN_SERVER resolves to the launcher the worker publishes, inside the installed package, and that file is there", () => {
  const runServer = stampEnvironmentFiles(STAMP)[1];
  assert.ok(runServer.startsWith("node_modules/@a11ign/screenreader-worker/"), `resolved to ${runServer}`);
  assert.ok(existsSync(join(REPO, runServer)), `the installed package holds no ${runServer}: the stamp would hash nothing`);
});

test("NEGATIVE CONTROL: a stamp listing a path under the worker's laid source is refused by name; the quoted form of the launcher is not", () => {
  const laid = ["packages", "nvda-worker", "src/run-server.cmd"].join("/");
  assert.throws(() => stampEnvironmentFiles(STAMP.replace("$RUN_SERVER", `'${laid}'`)), new RegExp(`stamp lists '${laid}'`));
  assert.deepEqual(stampEnvironmentFiles(STAMP.replace("$RUN_SERVER", `'${PUBLISHED_LAUNCHER}'`))[1], PUBLISHED_LAUNCHER);
});

test("a Get-LayerFile entry naming a layer layers.json does not declare throws", () => {
  const stamp = STAMP.replace("'screenreader-fleet'", "'no-such-layer'");
  assert.throws(() => stampEnvironmentFiles(stamp), /no-such-layer/);
});
