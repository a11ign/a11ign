// no-token: gh -- puts a FAKE `gh` first on PATH that records its arguments and answers from the environment; the real `gh` is never run and nothing leaves this machine
/**
 * ADR 0045 cut (b) (#5459): `release-reads-qualification.ts` AND `npm-token-liveness.ts` CALL `gh` THEMSELVES.
 *
 * They used to take `gh` from the org tool's `board-data` / `merge-guard-lookups` exports. The helper each now owns is the one place the real call is made, and it was reached only
 * from CLI paths no test drove, so it is driven here against a fake `gh` on PATH: the arguments reach the binary unchanged, its stdout comes back, and a non-zero exit THROWS
 * (CANNOT ASK is never the same as "no status", which the release reads as `wait`). The failing case is the control for the passing one: a helper that swallowed the exit would
 * pass the first and fail the second.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gh as releaseGh } from "../../../scripts/release-reads-qualification.ts";
import { gh as npmTokenGh } from "../../../scripts/npm-token-liveness.ts";

const FAKE_GH = `#!/bin/sh
printf '%s\\n' "$@" > "\${FAKE_GH_ARGS:?}"
if [ "\${FAKE_GH_EXIT:-0}" != "0" ]; then
  echo "fake gh: refused" >&2
  exit "\${FAKE_GH_EXIT}"
fi
printf '%s' '{"answered":true}'
`;

let dir = "";
const saved = { PATH: process.env.PATH, FAKE_GH_ARGS: process.env.FAKE_GH_ARGS, FAKE_GH_EXIT: process.env.FAKE_GH_EXIT };

before(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), "release-scripts-call-gh-")));
  writeFileSync(join(dir, "gh"), FAKE_GH);
  chmodSync(join(dir, "gh"), 0o755);
  process.env.PATH = `${dir}:${saved.PATH}`;
  process.env.FAKE_GH_ARGS = join(dir, "args.txt");
});

after(() => {
  for (const [name, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  rmSync(`${dir}`, { recursive: true, force: true });
});

const callers = { "release-reads-qualification": releaseGh, "npm-token-liveness": npmTokenGh };

for (const [name, gh] of Object.entries(callers)) {
  test(`${name}: the arguments reach \`gh\` unchanged and its stdout is the answer`, () => {
    delete process.env.FAKE_GH_EXIT;
    assert.equal(gh(["api", "repos/a11ign/a11ign/commits/abc/statuses", "--paginate"]), '{"answered":true}');
    assert.deepEqual(readFileSync(join(dir, "args.txt"), "utf8").trim().split("\n"), ["api", "repos/a11ign/a11ign/commits/abc/statuses", "--paginate"]);
  });

  test(`${name}: a \`gh\` that exits non-zero THROWS, so a refusal is never read as an empty answer`, () => {
    process.env.FAKE_GH_EXIT = "4";
    assert.throws(() => gh(["api", "user"]), /Command failed|fake gh: refused/);
    delete process.env.FAKE_GH_EXIT;
  });
}
