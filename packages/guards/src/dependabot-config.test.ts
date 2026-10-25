// no-token: none -- reads this repository's files and the installed toolchain's template; no network, no GitHub.
/**
 * A11-253 (under A11-251): `.github/dependabot.yml` IS THE OUTPUT OF `dependabot-config --write`, NOT A HAND-WRITTEN FILE.
 *
 * The check generates the file in memory from the `@a11ign/toolchain` this repository installs and compares it with the committed one; it asserts nothing about versions.
 * To fix a failure run `pnpm exec dependabot-config --write` and commit the result. The repository's own choices are in `.github/dependabot-extra.json`.
 * `dependency-updates-configured.test.ts` in a11ign/lab, which pinned the old hand-written file (`daily`, no group), is deleted with this change.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { checkDependabotConfig } from "@a11ign/toolchain/dependabot-config";

test(".github/dependabot.yml is exactly what `dependabot-config --write` produces", () => {
  const result = checkDependabotConfig({ root: fileURLToPath(new URL("../../../", import.meta.url)) });
  assert.ok(result.ok, result.message);
});
