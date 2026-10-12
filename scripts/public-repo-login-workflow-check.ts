#!/usr/bin/env node
// command: refuse a workflow in THIS public repository that passes login secrets to an authenticated capture (#5274, from #5114)
//
//   node scripts/public-repo-login-workflow-check.ts [root]     scan <root>/.github/workflows/*.yml (default: this checkout); exit 1 and name each refusal
//
// WHY AT REVIEW. The product refuses a run that logs in on a repository that is not private (`auth-refused-public-repository`, ADR 0038
// amendment 3), but only when the run starts. auth0-e2e.yml was built here, set its secrets and spent a runner before that refusal fired,
// and the nightly failed a day late. This is the same refusal, moved to the pull request that would add the next one.
//
// WHAT IT READS. Three signals, each a login reaching a scan in this repository:
//   - a step or job whose `with:` gives the Action a `login-flow:` input;
//   - a `flows:` input, or a literal `--flows <path>` in a script, naming a file with a top-level `login:` block (#5054);
//   - a login secret (AUTH0_* or APP_TEST_*) in the env of a step that runs a scan.
// A flows path built from a variable is not read. This check says what it can see; "could not tell" is not a pass, and the Action
// refuses on the same ground.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parse } from "yaml";

const LOGIN_SECRET = /\$\{\{\s*secrets\.(AUTH0_|APP_TEST_)[A-Z0-9_]*\s*\}\}/;
const FLOWS_FLAG = /--flows[ =]+["']?([^\s"']+)/g;
const SCAN_COMMAND = /\ba11ign\b|--flows\b/;
const SCAN_ACTION = /^(\.\/|a11ign\/a11ign)/;
const WORKFLOW_FILE = /\.ya?ml$/;
const REFUSAL_HINT = "a11ign/auth-capture-check, see docs/try-it.md section 1";

type Env = Record<string, unknown>;
interface Step { uses?: string; run?: string; with?: Record<string, unknown>; env?: Env }
interface Job extends Step { steps?: Step[] }
interface Workflow { env?: Env; jobs?: Record<string, Job> }
export interface Refusal { file: string; reason: string }
export type ReadFile = (path: string) => string | undefined;

const nonEmpty = (value: unknown): boolean => typeof value === "string" && value.trim() !== "";

function flowsPathsOf(step: Step): string[] {
  const input = step.with?.flows;
  const fromInput = typeof input === "string" ? [input] : [];
  const fromRun = [...(step.run ?? "").matchAll(FLOWS_FLAG)].map((match) => match[1]);
  return [...fromInput, ...fromRun].filter((path) => !path.includes("$"));
}

function hasLoginBlock(text: string | undefined): boolean {
  if (text === undefined) return false;
  const flows = parse(text) as { login?: unknown } | null;
  return flows?.login !== undefined;
}

function loginSecretsIn(env: Env): string[] {
  return Object.entries(env)
    .filter(([, value]) => typeof value === "string" && LOGIN_SECRET.test(value))
    .map(([name]) => name);
}

function runsScan(step: Step): boolean {
  return SCAN_COMMAND.test(step.run ?? "") || SCAN_ACTION.test(step.uses ?? "");
}

function reasonsForStep(step: Step, env: Env, readFile: ReadFile): string[] {
  const reasons: string[] = [];
  if (nonEmpty(step.with?.["login-flow"])) reasons.push("gives the Action a login-flow: input");
  for (const path of flowsPathsOf(step)) {
    if (hasLoginBlock(readFile(path))) reasons.push(`names ${path}, a flows file with a login: block`);
  }
  const secrets = loginSecretsIn(env);
  if (secrets.length > 0 && runsScan(step)) reasons.push(`passes ${secrets.join(", ")} to a step that runs a scan`);
  return reasons;
}

/** Every reason a workflow's text passes login secrets to a scan. An empty list is a reading, not an absence of the check. */
export function loginReasonsOf(workflowText: string, readFile: ReadFile): string[] {
  const workflow = (parse(workflowText) ?? {}) as Workflow;
  return Object.values(workflow.jobs ?? {}).flatMap((job) => {
    const jobEnv = { ...workflow.env, ...job.env };
    const jobReasons = nonEmpty(job.with?.["login-flow"]) ? ["gives the Action a login-flow: input"] : [];
    const stepReasons = (job.steps ?? []).flatMap((step) => reasonsForStep(step, { ...jobEnv, ...step.env }, readFile));
    return [...jobReasons, ...stepReasons];
  });
}

export function refusalMessage(file: string, reason: string): string {
  return `${file}: ${reason}. This repository is public, so a run that logs in here would publish text from behind the login ` +
    `(auth-refused-public-repository, ADR 0038 amendment 3). Run the login in a private repository, such as ${REFUSAL_HINT}.`;
}

/** The refusals in every workflow file under `<root>/.github/workflows`, in file-name order. */
export function workflowRefusals(root: string): Refusal[] {
  const dir = join(root, ".github", "workflows");
  const readFile: ReadFile = (path) => (existsSync(join(root, path)) ? readFileSync(join(root, path), "utf8") : undefined);
  return readdirSync(dir).filter((name) => WORKFLOW_FILE.test(name)).sort().flatMap((name) => {
    const text = readFileSync(join(dir, name), "utf8");
    return loginReasonsOf(text, readFile).map((reason) => ({ file: `.github/workflows/${name}`, reason }));
  });
}

function main(argv: string[]): number {
  const root = argv[0] ?? fileURLToPath(new URL("..", import.meta.url));
  const refusals = workflowRefusals(root);
  refusals.forEach(({ file, reason }) => console.error(`::error::${refusalMessage(file, reason)}`));
  return refusals.length > 0 ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exitCode = main(process.argv.slice(2));
}
