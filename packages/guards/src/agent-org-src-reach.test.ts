/**
 * #4410 (c of #4407): NO FILE HERE MAY REACH INTO AGENT-ORG'S `src/` BY PATH, AND THE FILES THAT STILL DO ONLY GO DOWN.
 *
 * WHY. agent-org#435 renamed `src/*.mjs` to `.ts` and every a11ign PR's `acceptance / run` threw `ERR_MODULE_NOT_FOUND`, because
 * `reusable-acceptance.yml` imported `src/acceptance-commands.mjs` by file path (#4400, #4407). A file path under another repository's
 * `src/` is not an interface: the owner may rename it at any release. agent-org now DECLARES an `exports` map (agent-org#445) and a `bin`,
 * and a11ign reaches the tool only through those.
 *
 * WHAT COUNTS AS A REACH, per source line, once comments are gone (a comment that NAMES a path is a mention, and stripping is what
 * separates the two; `stripComments` for code, whole `#` lines for YAML and systemd units):
 *   - a call to `toolPath(` / `toolModule(` / `toolUrl(` / `toolRoot(` (the resolvers in `scripts/agent-org-newest-tag.mjs`, each of which
 *     takes a path under the tool), a DEFINITION `function toolPath(` excepted;
 *   - `AGENT_ORG_TOOL` and a `/src/` on the same line;
 *   - a literal `agent-org/src/<file>.mjs|ts`.
 * An import through a declared export (`agent-org/pr-open`) is none of these and does not count.
 *
 * WHAT IT CANNOT SEE, stated rather than left to be found: a path assembled from a checkout directory the file obtained elsewhere
 * (`join(provisionAgentOrg(), "src/suite-slots.mjs")` in `scripts/verify.ts`) names no resolver and no `agent-org/src` text, and a bare
 * `"src/x.mjs"` literal is too common in this tree (lay-layer, mutate-diff, ci-changed fixtures) to charge. That reach is #4408's to remove
 * and to find, in the file the baseline already lists.
 *
 * THE RATCHET, in the shape of `mjs-ratchet.test.ts`: `agent-org-src-reach.baseline.json` maps each file to the number of reaching lines it
 * has. A file not in the baseline, or one above its number, FAILS naming it. A file below its number passes and says the baseline can be
 * lowered. The migration rows (#4408 `scripts/`, #4409 `packages/`, #4411 workflows) take every entry out; at `{}` this pins zero.
 *
 * THE POSITIVE CONTROLS ARE FIXTURES, not the tree: the tree's own population is meant to reach zero, and a control that needs it
 * non-empty would then have to be deleted. Each shape above is shown reaching, and each declared-export shape is shown not reaching, so
 * a detector that went blind (or one that matched `import` itself) fails here and not by passing quietly over the real tree.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { stripComments } from "@a11ign/evidence/source-text";

import { sandboxGitEnv } from "./git-env.mjs";

const HERE = fileURLToPath(import.meta.url);
const REPO_ROOT = join(dirname(HERE), "..", "..", "..");
const BASELINE_PATH = join(dirname(HERE), "agent-org-src-reach.baseline.json");

/** This file quotes every shape it hunts, in fixtures, so it is out of its own walk by CODE and not by an entry in the list it maintains. */
/** A floor, not a count: the tree holds well over a thousand source files, and a walk that found a handful has read the wrong directory. */
const MIN_FILES_READ = 100;

const SELF = relative(REPO_ROOT, HERE);

const CODE_EXTENSIONS = new Set([".mjs", ".cjs", ".js", ".ts", ".tsx"]);
/** Files whose only comment form is a `#` line: the workflows, composite actions and systemd units that name the tool by path. */
const HASH_COMMENT_EXTENSIONS = new Set([".yml", ".yaml", ".service", ".sh"]);

const REACHES = [
  /(?<!function\s)\b(?:toolPath|toolModule|toolUrl|toolRoot)\(/,
  /AGENT_ORG_TOOL[^\n]*\/src\//,
  /agent-org\/src\/[a-z][\w.-]*\.(?:mjs|ts)\b/,
];

type Baseline = Record<string, number>;
type Files = ReadonlyMap<string, string>;

function withoutComments(path: string, text: string): string {
  const extension = extname(path);
  if (CODE_EXTENSIONS.has(extension)) return stripComments(text);
  if (HASH_COMMENT_EXTENSIONS.has(extension)) return text.split("\n").filter((line) => !line.trimStart().startsWith("#")).join("\n");
  return "";
}

/** The lines of `text` (comments already gone) that reach into the tool's `src/` by path. */
function reachingLines(path: string, text: string): number {
  return withoutComments(path, text).split("\n").filter((line) => REACHES.some((reach) => reach.test(line))).length;
}

function populationOf(files: Files): Baseline {
  const found: Baseline = {};
  for (const [path, text] of files) {
    if (path === SELF) continue;
    const count = reachingLines(path, text);
    if (count > 0) found[path] = count;
  }
  return found;
}

type Verdict = { ok: boolean; message: string; population: Baseline };

/** Compare the reaches `files` hold with `baseline`: a new file or a higher count fails, naming it; a lower one passes and says so. */
function checkSrcReach(files: Files, baseline: Baseline): Verdict {
  const population = populationOf(files);
  const refused = Object.entries(population)
    .filter(([path, count]) => count > (baseline[path] ?? 0))
    .map(([path, count]) => `${path}: ${count} line(s) reach into an agent-org src/ path, baseline allows ${baseline[path] ?? 0}`);
  if (refused.length > 0) {
    return { ok: false, population, message: `${refused.join("\n")}\nImport through a declared export of agent-org (its package.json \`exports\`) or run its \`bin\`; never a src/ path.` };
  }
  const lowered = Object.keys(baseline).filter((path) => (population[path] ?? 0) < baseline[path]!);
  const note = lowered.length > 0 ? `the baseline can be lowered for: ${lowered.join(", ")}` : "";
  return { ok: true, population, message: note };
}

function readBaseline(): Baseline {
  return JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as Baseline;
}

/** Every tracked or new-and-unignored file, so a file written in this working tree is seen before it is committed. */
function readTree(): Files {
  const listed = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { cwd: REPO_ROOT, encoding: "utf8", env: sandboxGitEnv() });
  const files = new Map<string, string>();
  for (const path of listed.split("\0").filter(Boolean)) {
    const extension = extname(path);
    if (!CODE_EXTENSIONS.has(extension) && !HASH_COMMENT_EXTENSIONS.has(extension)) continue;
    try { files.set(path, readFileSync(join(REPO_ROOT, path), "utf8")); } catch (cause) {
      // Listed but gone: a deletion not yet staged. Nothing to read, nothing to reach.
      if ((cause as NodeJS.ErrnoException).code !== "ENOENT") throw new Error(`cannot read ${path}`, { cause });
    }
  }
  return files;
}

test("no file reaches into an agent-org src/ path beyond the committed baseline", () => {
  const files = readTree();
  // The scan must have READ the tree: an `ok` over nothing is the vacuous pass.
  assert.ok(files.size > MIN_FILES_READ, `the walk read ${files.size} source files: it read nothing`);
  const baseline = readBaseline();
  const result = checkSrcReach(files, baseline);
  assert.ok(result.ok, result.message);
  if (result.message) console.log(result.message);
});

test("every baseline entry is a file the walk can see and a positive count", () => {
  const files = readTree();
  for (const [path, count] of Object.entries(readBaseline())) {
    assert.ok(files.has(path), `${path} is in the baseline but is not a scanned file: delete the entry`);
    assert.ok(Number.isInteger(count) && count > 0, `${path} has count ${count}: an entry at zero is deleted, not kept`);
  }
});

const REACHING_SHAPES: Record<string, [string, string]> = {
  "a toolModule call": ["scripts/x.mjs", 'const { gh } = await toolModule("src/board-data.mjs");'],
  "a toolPath call": ["packages/guards/src/y.test.ts", 'const script = toolPath("src/worktree-owner.mjs");'],
  "a toolUrl call": ["scripts/z.mjs", 'const url = toolUrl("src/pr-open.mjs");'],
  "a toolRoot call": ["scripts/z.mjs", 'const file = join(toolRoot(), "src/suite-slots.mjs");'],
  "AGENT_ORG_TOOL plus /src/ in a workflow": [".github/workflows/w.yml", "          import('file://' + process.env.AGENT_ORG_TOOL + '/src/acceptance-commands.ts')"],
  "a literal agent-org/src path in a unit": [".agent-org/units/u.service", "ExecStart=/usr/bin/node %h/repos/agent-org/src/bin.mjs row-file"],
  "a spawn of a file under agent-org/src": ["packages/guards/src/q.mjs", 'spawnSync("node", ["/home/agent/repos/agent-org/src/bin.mjs", "row-file"]);'],
};

for (const [shape, [path, line]] of Object.entries(REACHING_SHAPES)) {
  test(`CONTROL, new caller: ${shape} is a reach, and a file holding it that is not in the baseline FAILS naming it`, () => {
    assert.equal(reachingLines(path, line), 1, `the detector missed ${shape}`);
    const result = checkSrcReach(new Map([[path, line]]), {});
    assert.equal(result.ok, false);
    assert.ok(result.message.includes(path), `the failure does not name ${path}: ${result.message}`);
  });
}

const NOT_REACHES: Record<string, [string, string]> = {
  "an import through a declared export": ["scripts/x.mjs", 'const { checkBody } = await import("agent-org/pr-open");'],
  "a declared export in a workflow": [".github/workflows/w.yml", "          import('agent-org/acceptance-commands').then((m) => m.run())"],
  "the bin": ["scripts/x.mjs", 'spawnSync("agent-org", ["owned-path-signoff", diff]);'],
  "the toolchain import (a package, not agent-org's src)": ["scripts/x.mjs", 'import { defineToolchainConfig } from "@a11ign/toolchain/rstest-config";'],
  "a bare import of the resolver module, which calls nothing": ["scripts/x.mjs", 'import { toolModule } from "./agent-org-newest-tag.mjs";'],
  "the DEFINITION of a resolver": ["scripts/x.mjs", "export function toolPath(relative) {"],
  "AGENT_ORG_TOOL set with no src path": ["packages/guards/src/t.test.ts", 'const env = { AGENT_ORG_TOOL: join(dir, "tool") };'],
};

for (const [shape, [path, line]] of Object.entries(NOT_REACHES)) {
  test(`CONTROL, moved caller: ${shape} is not a reach, and a clean file passes`, () => {
    assert.equal(reachingLines(path, line), 0, `the detector charged ${shape}`);
    assert.ok(checkSrcReach(new Map([[path, line]]), {}).ok);
  });
}

test("CONTROL, mentions: a path named in a comment is not a reach, in code or in YAML", () => {
  const code = '// see `packages/agent-org/src/merge-guard.mjs` and toolPath("src/x.mjs")\n/* AGENT_ORG_TOOL/src/y.ts */\nconst a = 1;\n';
  const yaml = "# `packages/agent-org/src/trunk-red.mjs` has the rest\n  # toolModule(\"src/x.mjs\")\nname: x\n";
  assert.equal(reachingLines("scripts/c.mjs", code), 0);
  assert.equal(reachingLines(".github/workflows/c.yml", yaml), 0);
});

test("CONTROL, ratchet: a caller moved to a declared export brings its file under the baseline, and a file at its baseline passes", () => {
  const before = new Map([["scripts/a.mjs", 'await toolModule("src/board-data.mjs");\nawait toolModule("src/pr-open.mjs");\n']]);
  const baseline = { "scripts/a.mjs": 2 };
  assert.ok(checkSrcReach(before, baseline).ok);
  const moved = new Map([["scripts/a.mjs", 'await toolModule("src/board-data.mjs");\nawait import("agent-org/pr-open");\n']]);
  const result = checkSrcReach(moved, baseline);
  assert.ok(result.ok, result.message);
  assert.match(result.message, /baseline can be lowered for: scripts\/a\.mjs/);
});

test("CONTROL, ratchet: one more reach in a file already in the baseline FAILS", () => {
  const grown = new Map([["scripts/a.mjs", 'await toolModule("src/board-data.mjs");\nawait toolModule("src/pr-open.mjs");\n']]);
  const result = checkSrcReach(grown, { "scripts/a.mjs": 1 });
  assert.equal(result.ok, false);
  assert.match(result.message, /scripts\/a\.mjs: 2 line\(s\).*baseline allows 1/);
});

test("CONTROL, self: this test is out of its own walk by name, and a copy of it elsewhere is not", () => {
  const quoting = 'const x = toolModule("src/board-data.mjs");';
  assert.equal(checkSrcReach(new Map([[SELF, quoting]]), {}).ok, true);
  assert.equal(checkSrcReach(new Map([["packages/guards/src/copy.test.ts", quoting]]), {}).ok, false);
});
