#!/usr/bin/env node
// @ts-check
// command: resolve the newest stable release tag of agent-org and put that checkout where the CI steps below can run it
// THE ONE PLACE THAT KNOWS WHERE `agent-org` IS (#3534, chairman via `ceo`, 2026-10-04).
//
// a11ign does not DEPEND on the tool any more: no `package.json` entry, no lockfile line, no alias. The host runs the newest release tag
// of a11ign/agent-org (`update-tool` detaches its checkout there, a11ign/a11ign#3443) while a pin in this repository ran 0.7.8 for weeks, so
// two versions of the tool were running at once and a caret on `0.x` never crosses a minor. A pin cannot be made to follow; the way to make a
// second version impossible is to have nothing to pin. Every consumer therefore asks THIS file, and it answers in one of two ways:
//
//   - on the host and in a worktree: `$AGENT_ORG_TOOL`, else the `tool` of `.agent-org/host.json` (the checkout the work-tick unit keeps at the
//     newest tag). `toolRoot()` and `toolExport()` are for a script or a test that imports a declared export of the tool.
//   - in CI, where no tool checkout exists: `node scripts/agent-org-newest-tag.ts --dest=<dir>` reads the tags of the tool's repository NOW,
//     takes the newest STABLE one, clones it into `<dir>`, installs what it imports, and exports `AGENT_ORG_TOOL` (and an `agent-org` on PATH)
//     to the steps below it. Nothing is cached between runs, so a release at ANY minor is what the next run executes, with no change here.
//
// A tag list with no stable tag REFUSES; it never falls back to a branch, because `main` is not a release and a run would then execute code
// nobody had cut.
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { appendFileSync, chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { sandboxGitEnv } from "../packages/guards/src/git-env.ts";
// A relative path, not the workspace name: the tool-only CI jobs run this file with no `pnpm install`, so no workspace link exists yet.
import { npmCliInvocation } from "./npm-cli-executable.ts";
import { refuseUnknownFlags } from "./cli-flags.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TOOL_ENV = "AGENT_ORG_TOOL";
export const TOOL_REPO_URL = "https://github.com/a11ign/agent-org";
/** A release tag: `v` and three numbers. `v0.22.0-rc.1` is not one, and neither is `v0.22`. */
const STABLE_TAG = /^v(\d+)\.(\d+)\.(\d+)$/;
const VERSION_PARTS = 3;
const EXECUTABLE = 0o755;

/**
 * The newest STABLE tag, compared as numbers (`v0.9.0` is older than `v0.22.0`, which a string sort gets backwards) and never as text.
 * @param {readonly string[]} tags
 * @returns {string}
 */
export function newestStableTag(tags: readonly string[]): string {
  const stable = tags.flatMap((tag) => {
    const parts = STABLE_TAG.exec(tag.trim());
    return parts ? [{ tag: tag.trim(), numbers: parts.slice(1, 1 + VERSION_PARTS).map(Number) }] : [];
  });
  if (stable.length === 0) {
    throw new Error(`agent-org-newest-tag: none of the ${tags.length} tag(s) is a stable release (vX.Y.Z), so there is nothing to run. `
      + "It does not fall back to a branch: `main` is not a release.");
  }
  const newest = stable.reduce((best, next) => (isNewer(next.numbers, best.numbers) ? next : best));
  return newest.tag;
}

/** @param {number[]} candidate @param {number[]} best */
function isNewer(candidate: number[], best: number[]) {
  const at = candidate.findIndex((n, i) => n !== best[i]);
  return at !== -1 && candidate[at] > best[at];
}

/**
 * Where the tool is: `$AGENT_ORG_TOOL`, else the `tool` the host file declares. REFUSES when neither says, naming both: a guess from where
 * this file sits would be the second version of the tool this file exists to prevent.
 * @param {{ env?: Record<string, string | undefined>, root?: string }} [where]
 * @returns {string}
 */
export function toolRoot({ env = process.env, root = ROOT }: { env?: Record<string, string | undefined>; root?: string; } = {}): string {
  const named = env[TOOL_ENV];
  if (named !== undefined && named !== "") return named;
  const hostFile = join(root, ".agent-org/host.json");
  /** @type {{ tool?: unknown }} */
  const host: { tool?: unknown; } = JSON.parse(readFileSync(hostFile, "utf8"));
  if (typeof host.tool === "string" && isAbsolute(host.tool)) return host.tool;
  throw new Error(`agent-org-newest-tag: the tool is nowhere: $${TOOL_ENV} is unset and ${hostFile} has no absolute \`tool\`. `
    + "In CI, run `node scripts/agent-org-newest-tag.ts --dest=<dir>` first.");
}

/** The tool's own `package.json`: what it DECLARES (`exports`, `bin`) is the only contract a consumer may read, and never the layout of its `src/`. @param {string} root @returns {{ exports?: Record<string, unknown>, bin?: unknown }} */
function manifestOf(root: string): { exports?: Record<string, unknown>; bin?: unknown; } {
  return JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
}

/**
 * The file a DECLARED subpath of the tool's `exports` names (`leak-patterns` -> `<tool>/src/lib/leak-patterns.mjs`), as a path.
 *
 * Resolved through the tool's `package.json` `exports` and not through a path under it, so a rename or a move inside agent-org (`.mjs` -> `.ts`, agent-org#435, #4389)
 * that keeps the declared name breaks nobody (#4408, a11ign/a11ign#4407). A name the tool does not declare REFUSES, naming what it does: a guess at a `src/` file
 * would be the reach this exists to end.
 * @param {string} subpath the part after `agent-org/` in a specifier (`pr-open`, not `src/pr-open.ts`)
 * @param {string} [root]
 * @returns {string}
 */
export function toolExportPath(subpath: string, root: string = toolRoot()): string {
  try {
    // The platform's own resolution of a package's `exports` by self-reference (the tool is named `agent-org`), so a condition or a pattern in the map is read as node reads it.
    return createRequire(join(root, "package.json")).resolve(`agent-org/${subpath}`);
  } catch (cause) {
    const declared = Object.keys(manifestOf(root).exports ?? {}).map((key) => key.slice(2));
    throw new Error(`agent-org-newest-tag: the tool at ${root} does not declare \`agent-org/${subpath}\` in its package.json \`exports\`. `
      + `It declares: ${declared.join(", ") || "nothing"}. Ask agent-org to declare it; never reach for its \`src/\` by path.`, { cause });
  }
}

/**
 * A declared export of the tool, imported. A computed `import()`, so the caller names the shape it uses; the target may be `.ts`, so the importer runs under tsx or a
 * node that strips types, as `bin.mjs` runs its programs.
 * @param {string} subpath
 * @returns {Promise<any>}
 */
export function toolExport(subpath: string): Promise<any> {
  return import(pathToFileURL(toolExportPath(subpath)).href);
}

/**
 * The tool's one executable, from the `bin` its `package.json` declares (`agent-org`), as a path. A string `bin` is the package's own name, an object names it.
 * @param {string} [root]
 * @returns {string}
 */
export function toolBin(root: string = toolRoot()): string {
  const { bin } = manifestOf(root);
  const target = typeof bin === "string" ? bin : (bin && typeof bin === "object" ? (bin as Record<string, unknown>)["agent-org"] : undefined);
  if (typeof target === "string") return join(root, target);
  throw new Error(`agent-org-newest-tag: the tool at ${root} declares no \`agent-org\` in its package.json \`bin\`, so there is no executable to run.`);
}

/** @param {string} url @returns {string[]} */
function remoteTags(url: string): string[] {
  const listing = execFileSync("git", ["ls-remote", "--tags", "--refs", url], { encoding: "utf8", env: sandboxGitEnv() });
  return listing.split("\n").flatMap((line) => /\trefs\/tags\/(\S+)$/.exec(line)?.[1] ?? []);
}

/**
 * The tool at `tag`, in `dest`, with the three packages it imports (`yaml`, `tsx`, `typescript`: its own `devDependencies`) beside it.
 * @param {{ url: string, tag: string, dest: string }} what
 */
function fetchTool({ url, tag, dest }: { url: string; tag: string; dest: string; }) {
  execFileSync("git", ["clone", "--quiet", "--depth=1", `--branch=${tag}`, url, dest], { stdio: "inherit", env: sandboxGitEnv() });
  // STAYS npm (`no-npm-spawn.test.ts` pins this file by name): the tool's own repository declares its three dependencies for npm (its `gate` installs them
  // so), in a clone outside any workspace, and the tool-only CI jobs have no pnpm to install with.
  const install = npmCliInvocation("npm", ["install", "--no-save", "--no-package-lock", "--ignore-scripts", "--no-audit", "--no-fund"]);
  execFileSync(install.command, install.args, { cwd: dest, stdio: "inherit" });
}

/**
 * Hand the tool to the steps below: `$AGENT_ORG_TOOL`, and an `agent-org` on PATH that runs its one bin, as `host:install` leaves one on the host.
 * @param {{ dest: string, tag: string, env?: Record<string, string | undefined> }} what
 */
function exportTool({ dest, tag, env = process.env }: { dest: string; tag: string; env?: Record<string, string | undefined>; }) {
  const bin = join(dest, "..", "agent-org-bin");
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(bin, "agent-org"), `#!/usr/bin/env bash\nexec node "${toolBin(dest)}" "$@"\n`);
  chmodSync(join(bin, "agent-org"), EXECUTABLE);
  if (env.GITHUB_ENV) appendFileSync(env.GITHUB_ENV, `${TOOL_ENV}=${dest}\nAGENT_ORG_TAG=${tag}\n`);
  if (env.GITHUB_PATH) appendFileSync(env.GITHUB_PATH, `${bin}\n`);
}

/** @param {string[]} argv @param {string} name @returns {string | undefined} */
function flag(argv: string[], name: string): string | undefined {
  return argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + "--=".length);
}

/**
 * `--tags=a,b,c` names the tags instead of reading the remote and prints the answer, which is how a test (or a person) asks the question
 * with no network. `--dest=<dir>` is the real run.
 * @param {string[]} argv @returns {number} the exit code
 */
export function main(argv: string[]): number {
  const injected = flag(argv, "tags");
  const dest = flag(argv, "dest");
  if (injected === undefined && dest === undefined) {
    console.error("usage: agent-org-newest-tag.mjs --dest=<dir>   (CI: clone the newest stable tag and export AGENT_ORG_TOOL)\n"
      + "       agent-org-newest-tag.mjs --tags=v0.9.0,v0.22.0   (print the newest stable of these; reads no remote)");
    return 2;
  }
  const tags = injected !== undefined ? injected.split(",") : remoteTags(TOOL_REPO_URL);
  const tag = newestStableTag(tags);
  console.log(tag);
  if (injected !== undefined || dest === undefined) return 0;
  const where = resolve(dest);
  fetchTool({ url: TOOL_REPO_URL, tag, dest: where });
  exportTool({ dest: where, tag });
  console.log(`::notice title=agent-org::resolved ${tag}, the newest stable of ${tags.length} tags, into ${where}`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    refuseUnknownFlags(["--tags=", "--dest="], { entry: import.meta.url, command: "node scripts/agent-org-newest-tag.ts" });
    process.exitCode = main(process.argv.slice(2));
  } catch (cause) {
    console.error(cause instanceof Error ? cause.message : String(cause));
    process.exitCode = 1;
  }
}
