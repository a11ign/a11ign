import assert from "node:assert/strict";
import { test } from "node:test";
import { stampEnvironmentFiles } from "./stamp-files.ts";

const ENTRIES = 5;

// The shape of `stamp-provision-revision.ps1` at screenreader-fleet v0.5.3 and v0.6.0: the first entry is a
// Get-LayerFile call, then two variables the stamp reads, then quoted paths with a comment between them.
const STAMP = `
$ENVIRONMENT_FILES = @(
    (Get-LayerFile -Layer 'screenreader-fleet' -Relative 'src/provisioning/provision-nvda-worker.ps1')
    $RUN_SERVER
    $FOREGROUND_LOCK
    'packages/control/ansible/roles/worker/defaults/main.yml'
    # a comment line is not an entry
    'packages/worker-fleet/src/provisioning/set-display-mode.ps1'
)
`;

test("the Get-LayerFile entry stays in the list, in its position, resolved from layers.json", () => {
  const files = stampEnvironmentFiles(STAMP);
  assert.equal(files.length, ENTRIES);
  assert.deepEqual(files, [
    "packages/worker-fleet/src/provisioning/provision-nvda-worker.ps1",
    "packages/nvda-worker/src/run-server.cmd",
    files[2],
    "packages/control/ansible/roles/worker/defaults/main.yml",
    "packages/worker-fleet/src/provisioning/set-display-mode.ps1",
  ]);
  assert.ok(files[2], "the foreground-lock entry resolved to a path");
});

test("a Get-LayerFile entry naming a layer layers.json does not declare throws", () => {
  const stamp = STAMP.replace("'screenreader-fleet'", "'no-such-layer'");
  assert.throws(() => stampEnvironmentFiles(stamp), /no-such-layer/);
});
