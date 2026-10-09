/**
 * #4394: a caller that names a tool module by one spelling still loads it when the tool holds the other.
 *
 * agent-org#435 turned most of `src/*.mjs` into `.ts`, and `toolModule("src/pr-open.mjs")` threw `ERR_MODULE_NOT_FOUND` against the tool as
 * it is, so `pnpm run verify` could not run. The resolver tolerates the rename in BOTH directions, because #4389 renames three more and a
 * fix pinned to one spelling would break again at that merge.
 *
 * CONSTRUCTED TOOLS, real files: the resolver's content is which file exists, so a stub of `existsSync` would test nothing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { toolModule, toolPath } from "../../../scripts/agent-org-newest-tag.mjs";

const TOOL_ENV = "AGENT_ORG_TOOL";

/** A tool directory holding `files` (path under the tool -> source), pointed at by `$AGENT_ORG_TOOL` for the body, then removed. */
async function withTool(files: Record<string, string>, body: (tool: string) => Promise<void> | void) {
  const tool = realpathSync(mkdtempSync(join(tmpdir(), "tool-module-renamed-")));
  const before = process.env[TOOL_ENV];
  for (const [relative, source] of Object.entries(files)) {
    mkdirSync(dirname(join(tool, relative)), { recursive: true });
    writeFileSync(join(tool, relative), source);
  }
  process.env[TOOL_ENV] = tool;
  try { await body(tool); } finally {
    if (before === undefined) delete process.env[TOOL_ENV]; else process.env[TOOL_ENV] = before;
    rmSync(tool, { recursive: true, force: true });
  }
}

const SOURCE = "export const answer = 42;\n";

for (const held of ["src/x.mjs", "src/x.ts"]) {
  for (const named of ["src/x.mjs", "src/x.ts"]) {
    test(`toolModule("${named}") loads from a tool holding ${held}`, async () => {
      await withTool({ [held]: SOURCE }, async (tool) => {
        const loaded = await toolModule(named);
        assert.equal(loaded.answer, 42);
        assert.equal(toolPath(named), join(tool, held));
      });
    });
  }
}

test("a tool holding neither spelling refuses, naming both", async () => {
  await withTool({ "src/other.mjs": SOURCE }, (tool) => {
    assert.throws(() => toolPath("src/x.mjs"), (error: Error) =>
      error.message.includes(join(tool, "src/x.mjs")) && error.message.includes(join(tool, "src/x.ts")));
    assert.throws(() => toolPath("src/x.ts"), /neither/);
  });
});

test("a file that is not a module is returned as named, present or not", async () => {
  await withTool({ "host/gh": "#!/bin/sh\n" }, (tool) => {
    assert.equal(toolPath("host/gh"), join(tool, "host/gh"));
    assert.equal(toolPath("host/absent"), join(tool, "host/absent"));
  });
});
