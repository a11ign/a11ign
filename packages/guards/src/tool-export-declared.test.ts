// no-token: gh -- builds throwaway tool directories; no `gh` or network is reached
/**
 * #4408: the tool is reached through what its `package.json` DECLARES (`exports`, `bin`), never through a path under its `src/`.
 * POSITIVE CONTROLS: a declared name resolves to the file the map names (so a rename inside the tool that keeps the name breaks nobody), and
 * an undeclared name and a tool with no `bin` are the refusals, so "resolved" is not the only outcome.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { toolBin, toolExport, toolExportPath } from "../../../scripts/agent-org-newest-tag.mjs";

async function aTool(manifest: object, files: Record<string, string>, body: (dir: string) => Promise<void> | void) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "tool-export-")));
  try {
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "agent-org", type: "module", ...manifest }));
    for (const [file, text] of Object.entries(files)) {
      mkdirSync(join(dir, file, ".."), { recursive: true });
      writeFileSync(join(dir, file), text);
    }
    await body(dir);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

for (const held of ["src/greeting.mjs", "src/lib/renamed-greeting.ts"]) {
  test(`a declared name resolves to ${held}, wherever the tool keeps it`, () =>
    aTool({ exports: { "./greeting": `./${held}` } }, { [held]: "export const word = 'hello';\n" }, (dir) => {
      assert.equal(toolExportPath("greeting", dir), join(dir, held));
    }));
}

test("toolExport imports the file the declared name maps to", () =>
  aTool({ exports: { "./greeting": "./src/greeting.mjs" } }, { "src/greeting.mjs": "export const word = 'hello';\n" }, async (dir) => {
    const saved = process.env.AGENT_ORG_TOOL;
    process.env.AGENT_ORG_TOOL = dir;
    try { assert.equal((await toolExport("greeting")).word, "hello"); } finally {
      if (saved === undefined) delete process.env.AGENT_ORG_TOOL; else process.env.AGENT_ORG_TOOL = saved;
    }
  }));

test("a name the tool does not declare is refused, naming what it does declare", () =>
  aTool({ exports: { "./greeting": "./src/greeting.mjs" } }, { "src/greeting.mjs": "export {};\n", "src/hidden.mjs": "export {};\n" }, (dir) => {
    assert.throws(() => toolExportPath("hidden", dir), (error: Error) => /does not declare `agent-org\/hidden`/.test(error.message) && /greeting/.test(error.message));
  }));

test("the bin is the one package.json declares, as an object or as a string", async () => {
  await aTool({ bin: { "agent-org": "src/cli.mjs" } }, {}, (dir) => assert.equal(toolBin(dir), join(dir, "src/cli.mjs")));
  await aTool({ bin: "bin/run.mjs" }, {}, (dir) => assert.equal(toolBin(dir), join(dir, "bin/run.mjs")));
});

test("a tool declaring no bin is refused", () => aTool({}, {}, (dir) => assert.throws(() => toolBin(dir), /declares no `agent-org`/)));
