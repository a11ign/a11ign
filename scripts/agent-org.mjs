// @ts-check
/**
 * RUN ONE OF THE TOOL'S PROGRAMS FROM WHERE THE TOOL LIVES NOW: `node scripts/agent-org.mjs <program>.mjs [args...]`.
 *
 * The tool (`a11ign/agent-org`) left this repository in the 2026-10-02 cut-over (a11ign/a11ign#2974-#2977, chairman's ruling),
 * and every `package.json` script, command-catalogue entry and hook that ran `node packages/agent-org/src/<x>.mjs` now runs
 * `node scripts/agent-org.mjs <x>.mjs` instead, so the path to the tool is stated ONCE, here, and a move of the checkout is one
 * edit in `.agent-org/host.json`'s `tool` key (a11ign/a11ign#2975).
 *
 * WHERE THE TOOL IS, IN THIS ORDER, AND NOTHING AFTER IT (chairman, 2026-09-24: no fallback): `$AGENT_ORG_TOOL`, then the `tool` key
 * of the host declaration (`$AGENT_ORG_HOST`, else `.agent-org/host.json` in the checkout this file sits in). A host file that
 * names no tool, or a tool directory that is not there, REFUSES by name. It never walks up to a sibling directory and guesses.
 *
 * `$AGENT_ORG_HOST` IS SET FOR THE CHILD when the caller left it empty, because the tool resolves the project it serves from
 * that file and, outside the monorepo layout, refuses without it (a11ign/a11ign#3039). The value is the declaration this file
 * already read, so the child serves the same project the launcher found the tool through.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const CHECKOUT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const HOST_FILE_IN_CHECKOUT = ".agent-org/host.json";
const REFUSED = 2;

/** A refusal that names what to fix, thrown to the caller and printed by the CLI half. */
export class ToolNotFound extends Error {}

/** @param {Record<string, string | undefined>} env @param {string} checkout */
export function hostFilePath(env = process.env, checkout = CHECKOUT) {
  return env.AGENT_ORG_HOST ? env.AGENT_ORG_HOST : join(checkout, HOST_FILE_IN_CHECKOUT);
}

/** The `tool` key of the host declaration, read and checked; every failure names the file. @param {string} hostFile */
function toolFromHostFile(hostFile) {
  let host;
  try {
    host = JSON.parse(readFileSync(hostFile, "utf8"));
  } catch (cause) {
    throw new ToolNotFound(`the host declaration ${hostFile} cannot be read as JSON (${cause instanceof Error ? cause.message : cause})`, { cause });
  }
  const tool = host?.tool;
  if (typeof tool !== "string" || !isAbsolute(tool)) {
    throw new ToolNotFound(`the host declaration ${hostFile} has no absolute \`tool\` path (a11ign/agent-org's checkout); set it, or set $AGENT_ORG_TOOL`);
  }
  return tool;
}

/**
 * The directory of the tool's checkout, which holds `src/`.
 * @param {{ env?: Record<string, string | undefined>, checkout?: string }} [where]
 */
export function toolDirectory({ env = process.env, checkout = CHECKOUT } = {}) {
  const tool = env.AGENT_ORG_TOOL ? env.AGENT_ORG_TOOL : toolFromHostFile(hostFilePath(env, checkout));
  if (!existsSync(join(tool, "src"))) {
    throw new ToolNotFound(`the tool checkout ${tool} has no src/ -- clone a11ign/agent-org there, or point $AGENT_ORG_TOOL / the host declaration's \`tool\` at it`);
  }
  return tool;
}

/** One program of the tool as an absolute path; a name that climbs out of `src/` is refused. @param {string} program @param {{ env?: Record<string, string | undefined>, checkout?: string }} [where] */
export function toolProgram(program, where = {}) {
  const src = join(toolDirectory(where), "src");
  const path = resolve(src, program);
  if (!path.startsWith(src + sep)) throw new ToolNotFound(`${program} is not inside the tool's src/`);
  if (!existsSync(path)) throw new ToolNotFound(`${path} does not exist in the tool checkout`);
  return path;
}

/**
 * A tool module imported by a script of this repository, resolved the same way a program is.
 * @param {string} module the file under the tool's `src/`, e.g. `board-data.mjs`
 */
export async function importFromTool(module) {
  return import(pathToFileURL(toolProgram(module)).href);
}

/** @param {string[]} argv `[program, ...args]` */
function run([program, ...args]) {
  if (program === undefined) {
    process.stderr.write("usage: node scripts/agent-org.mjs <program>.mjs [args...]   (runs <tool>/src/<program>.mjs)\n");
    return REFUSED;
  }
  try {
    const env = { ...process.env, AGENT_ORG_HOST: hostFilePath() };
    const child = spawnSync(process.execPath, [toolProgram(program), ...args], { stdio: "inherit", env });
    return child.status ?? 1;
  } catch (error) {
    if (!(error instanceof ToolNotFound)) throw error;
    process.stderr.write(`agent-org launcher: ${error.message}\n`);
    return REFUSED;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ? realpathSync(process.argv[1]) : "").href) {
  process.exitCode = run(process.argv.slice(2));
}
