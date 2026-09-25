/**
 * `::add-mask::` lines for every `from-env` value of the login flow (ADR 0038, Constraint 3, "The Action masks more than
 * GitHub does"), run at the start of the step that calls the CLI.
 *
 * GitHub masks a secret's EXACT value in logs and nothing derived from it. The screen reader can announce a value URL-
 * encoded (in a link's address) and a page can carry one base64-encoded (a Basic auth header), and the job log prints the
 * worker's stdout and stderr when the worker does not start. So the Action adds a mask for each of those other forms of
 * every value. The masks do not apply to FILES, which is why `auth:leak-check` exists.
 *
 * The raw value is left to GitHub. A multi-line secret's raw form is the only one with a line break in it (JSON-escaped and
 * URL-encoded forms escape it, and base64 has none), so leaving the raw value out is also what keeps every command one line: a
 * workflow command is a single line, and a mask split by the runner would mask a fragment.
 *
 * Prints ONLY commands, and never a value on any other line: this runs in a public log.
 */
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { realpathSync } from "node:fs";

import { credentialForms } from "../auth/leak-detector.js";
import { FlowsError, parseFlowsFile, resolveLoginFlow } from "../auth/flows.js";
import { requiredEnvNames } from "../auth/interpreter.js";
import { readCredential } from "../auth/interpreter.js";

type Environment = Readonly<Record<string, string | undefined>>;

/** The mask commands for a set of values: every form the detector knows, except the raw value GitHub already masks. */
export function maskLines(values: readonly string[]): string[] {
  const forms = values.flatMap((value) => credentialForms(value).filter(({ form }) => form !== "raw").map(({ text }) => text));
  return [...new Set(forms)].map((form) => `::add-mask::${form}`);
}

/** The mask lines for a flows file's login flow, reading each named variable from `env`. A missing variable is an error, not a silent skip. */
export async function loginMaskLines(
  { flows, loginFlow, env, readText }: { flows: string; loginFlow: string; env: Environment; readText: (path: string) => Promise<string> },
): Promise<string[]> {
  const file = parseFlowsFile(await readText(flows), flows);
  const login = resolveLoginFlow(file, loginFlow);
  const names = requiredEnvNames({ login: login.steps });
  return maskLines(names.map((name) => readCredential(name, env)));
}

async function main(argv: string[]): Promise<number> {
  const value = (flag: string): string | null => {
    const at = argv.indexOf(flag);
    return at >= 0 ? argv[at + 1] ?? null : null;
  };
  const flows = value("--flows");
  const loginFlow = value("--login-flow");
  if (!flows || !loginFlow) {
    console.error("auth-masks needs --flows <file> and --login-flow <name>");
    return 2;
  }
  try {
    for (const line of await loginMaskLines({ flows, loginFlow, env: process.env, readText: (path) => readFile(path, "utf8") })) console.log(line);
    return 0;
  } catch (error) {
    // A flows error names a rule and a step, never a value; the message is safe to print.
    console.error(error instanceof FlowsError || error instanceof Error ? error.message : String(error));
    return 2;
  }
}

const isProgram = process.argv[1] !== undefined && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
if (isProgram) main(process.argv.slice(2)).then((code) => process.exit(code));
