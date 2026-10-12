/**
 * ADR 0045 cut 9 (#5087): EVERY SCRIPT A SCRIPT OR A WORKFLOW STEP RUNS BY NAME IS A SCRIPT THE MANIFEST HAS.
 *
 * The cut deleted 77 script names, and four composites (`release:gate:ci`, `release:gate`, `candidate:gate`, `promote:gated`) still chained to them. Every
 * guard that read the diff was green, because each read what the diff held, and a chain that fails at its third link is not a line the diff touched:
 * `pnpm run release:gate:ci` exited 1 with `ERR_PNPM_NO_SCRIPT Missing script: scorer:verify` and the release path's `guards` job would have been the first
 * to say so. A missing link is read here, from the chain, so it cannot be a thing a reviewer must remember to run.
 *
 * What is read: the `run` links of every `package.json` script (`npm run x`, `pnpm run x`, `node scripts/pnpm.ts run x`), resolved in the manifest that
 * holds the script, and the same links in a `.github/workflows` step, resolved in the root manifest. A link that is recursive or filtered (`-r`,
 * `--filter`, `-F`, `-C`, `--dir`) runs in some other manifest, and a step with a `working-directory` is not at the root: neither is resolvable here and
 * neither is guessed at.
 *
 * POSITIVE CONTROL, in this file: the real tree is asserted to yield at least FLOOR_OF_LINKS links, among them the ones `release:gate:ci` makes, and a planted
 * tree breaks each of the two surfaces in turn and must be refused naming the caller and the missing script.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

const REPO = fileURLToPath(new URL("../../../", import.meta.url));

/** `pnpm run x`, `npm run x`, `node scripts/pnpm.ts run x`: whatever sits between the runner and `run` is group 1, the script is group 2. */
const RUN_LINK = /(?:^|[\s'"`(])(?:npm|pnpm|scripts\/pnpm\.ts)((?: [^&|;\n'"`]*?)?) run(?:-script)? (?:--silent |-s )?([A-Za-z][\w:.-]*)/g;
/** Words between the runner and `run` that put the script in a manifest other than the one the caller is in. */
const LEAVES_THIS_MANIFEST = /(?:^| )(?:-r|--recursive|-F|--filter|-C|--dir|-w|--workspace-root|exec|dlx)(?: |=|$)/;

type Link = { caller: string; script: string };
type Manifest = { scripts?: Record<string, string> };

/** The scripts a text runs by name, in the manifest it is read from; a link that leaves that manifest is not returned. */
function linksIn(text: string, caller: string): Link[] {
  return [...text.matchAll(RUN_LINK)].filter((m) => !LEAVES_THIS_MANIFEST.test(m[1] ?? "")).map((m) => ({ caller, script: m[2] }));
}

const readJson = (path: string) => JSON.parse(readFileSync(path, "utf8")) as Manifest;

function manifestsOf(root: string): { path: string; scripts: Record<string, string> }[] {
  const packages = existsSync(join(root, "packages")) ? readdirSync(join(root, "packages"), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => `packages/${e.name}/package.json`) : [];
  return ["package.json", ...packages].filter((path) => existsSync(join(root, path)))
    .map((path) => ({ path, scripts: readJson(join(root, path)).scripts ?? {} }));
}

type Step = { name?: string; run?: string; "working-directory"?: string };
type Workflow = { jobs?: Record<string, { steps?: Step[] }> };

/** The links of every workflow step that runs at the root: the file, the job and the step are the caller. */
function workflowLinks(root: string): Link[] {
  const dir = join(root, ".github/workflows");
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((file) => /\.ya?ml$/.test(file)).flatMap((file) => {
    const workflow = parseYaml(readFileSync(join(dir, file), "utf8")) as Workflow | null;
    return Object.entries(workflow?.jobs ?? {}).flatMap(([job, { steps }]) => (steps ?? [])
      .filter((step) => typeof step.run === "string" && step["working-directory"] === undefined)
      .flatMap((step) => linksIn(step.run!, `.github/workflows/${file} job ${job}${step.name ? ` step "${step.name}"` : ""}`)));
  });
}

/** Everything a tree runs by name, and every link of it that its manifest does not define: one sentence each. */
function readTree(root: string): { links: Link[]; unresolved: string[] } {
  const manifests = manifestsOf(root);
  const rootScripts = manifests.find((m) => m.path === "package.json")?.scripts ?? {};
  const fromManifests = manifests.flatMap(({ path, scripts }) => Object.entries(scripts).flatMap(([name, body]) =>
    linksIn(body, `${path} script ${name}`).map((link) => ({ link, defined: scripts }))));
  const fromWorkflows = workflowLinks(root).map((link) => ({ link, defined: rootScripts }));
  const all = [...fromManifests, ...fromWorkflows];
  return {
    links: all.map(({ link }) => link),
    unresolved: all.filter(({ link, defined }) => !Object.hasOwn(defined, link.script))
      .map(({ link }) => `${link.caller} runs \`${link.script}\`, which that manifest does not define`),
  };
}

const FLOOR_OF_LINKS = 15;

test("every script a manifest script or a root workflow step runs by name is one the manifest defines", () => {
  const { links, unresolved } = readTree(REPO);
  assert.ok(links.length >= FLOOR_OF_LINKS, `the read found ${links.length} links: it is not reading the manifests and workflows`);
  assert.ok(links.some((l) => l.caller === "package.json script release:gate:ci" && l.script === "gate:isolation"),
    "POSITIVE CONTROL: the chain the release path runs is among the links read, so the check is looking at the composites");
  assert.deepEqual(unresolved, []);
});

test("POSITIVE CONTROL: a composite that chains to a deleted script and a workflow step that runs one are each REFUSED, naming the caller and the script", () => {
  const root = mkdtempSync(join(tmpdir(), "package-scripts-resolve-"));
  mkdirSync(join(root, ".github/workflows"), { recursive: true });
  mkdirSync(join(root, "packages/inner"), { recursive: true });
  writeFileSync(join(root, "package.json"), JSON.stringify({ scripts: {
    "release:gate:ci": "node scripts/pnpm.ts run scorer:verify && node scripts/pnpm.ts run gate:isolation",
    "gate:isolation": "node isolation.ts",
    build: "node scripts/pnpm.ts -r run build && pnpm --filter inner run elsewhere && pnpm exec tsc",
    prepare: "node hooks.ts && npm run --silent build",
  } }));
  writeFileSync(join(root, "packages/inner/package.json"), JSON.stringify({ scripts: { build: "tsc", pretest: "npm run build && npm run gone" } }));
  writeFileSync(join(root, ".github/workflows/w.yml"), [
    "jobs:",
    "  a:",
    "    steps:",
    "      - name: gate",
    "        run: pnpm run release:gate:ci && pnpm run lab:job",
    "      - name: elsewhere",
    "        working-directory: packages/inner",
    "        run: pnpm run not-at-root",
    "      - run: ${{ inputs.cover && 'pnpm run build' || 'pnpm run gate:isolation' }}",
  ].join("\n"));
  assert.deepEqual(readTree(root).unresolved, [
    "package.json script release:gate:ci runs `scorer:verify`, which that manifest does not define",
    "packages/inner/package.json script pretest runs `gone`, which that manifest does not define",
    '.github/workflows/w.yml job a step "gate" runs `lab:job`, which that manifest does not define',
  ]);
});
