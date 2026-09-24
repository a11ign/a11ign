/**
 * The decisions of `npm run auth:leak-check` — ADR 0038, Constraint 4's COMMAND, with its positive controls.
 *
 * The script (`scripts/auth-leak-check.mjs`) is the I/O: it serves a fixture, drives a real capture through a worker on
 * this machine, and hands the response here. Everything it DECIDES is here so it has tests that need no worker:
 *
 * - **`raw`** examines the worker's response BEFORE the scrub. It is the positive control: against the fixture whose
 *   account page echoes the username, it must find it and exit EXACTLY 1 (2 means the command could not run, which is
 *   not a pass).
 * - **`written`** runs the response through the scrub the run would use, WRITES what that produces, reads it back from
 *   disk, and examines the files. Against the echoing fixture it must exit 0 with a redaction count of at least 1, so
 *   the scrub demonstrably had work to do; against the quiet fixture it must exit 0 with a non-zero examined count.
 *
 * The exit code is the contract from `leak-detector.ts`: `0` clean, `1` a leak, `2` could not examine anything, and
 * examining zero is `2` — so a capture that produced nothing, or a scan of an empty directory, cannot read as clean.
 * **A run the containment REFUSED to write (`auth-credential-in-artifact`) is exit 1**: the credential reached the
 * transcript in a form the scrub will not touch, which is a leak the containment caught and the check must not soften.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  LEAK_EXIT, describeExamined, findLeaks, leakCheckExit, stringArraysIn,
  type Credential, type LeakCheckReport, type LeakExit,
} from "./leak-detector.js";
import { MIN_SCRUBBED_LENGTH, ScrubError, buildScrubSet, redactionNotice, writeScrubbed } from "./scrub.js";

export const FIXTURES = ["login-quiet", "login-echo"] as const;
export type Fixture = (typeof FIXTURES)[number];
export const STAGES = ["raw", "written"] as const;
export type Stage = (typeof STAGES)[number];

export interface LeakCheckArgs {
  fixture: Fixture;
  stage: Stage;
  userEnv: string;
  secretEnv: string;
  worker: string;
}

/** A usage or environment problem: the command could not run, so it is exit 2 and never a verdict. */
export class LeakCheckUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LeakCheckUsageError";
  }
}

const FLAGS = ["--fixture", "--stage", "--user-env", "--secret-env", "--worker"] as const;
const DEFAULT_WORKER = "http://127.0.0.1:8765";

/**
 * `--flag value` and `--flag=value`, both: the ADR writes the first and the repo's other commands write the second.
 * An unknown flag is REFUSED by name (a mistyped `--stag raw` running the default and reporting success is the defect
 * `cli-flags.mjs` exists for), and so is a missing or repeated one.
 */
export function parseLeakCheckArgs(argv: readonly string[]): LeakCheckArgs {
  const found = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const [name, inline] = argv[index].split(/=(.*)/s);
    if (!(FLAGS as readonly string[]).includes(name)) throw new LeakCheckUsageError(`unknown argument ${JSON.stringify(argv[index])}; the flags are ${FLAGS.join(", ")}`);
    if (found.has(name)) throw new LeakCheckUsageError(`${name} was given twice`);
    const value = inline ?? argv[index + 1];
    if (value === undefined || value.startsWith("--")) throw new LeakCheckUsageError(`${name} needs a value`);
    if (inline === undefined) index += 1;
    found.set(name, value);
  }
  const need = (name: string): string => {
    const value = found.get(name);
    if (value === undefined) throw new LeakCheckUsageError(`${name} is required`);
    return value;
  };
  const fixture = need("--fixture");
  const stage = need("--stage");
  if (!(FIXTURES as readonly string[]).includes(fixture)) throw new LeakCheckUsageError(`--fixture must be ${FIXTURES.join(" or ")}, not ${JSON.stringify(fixture)}`);
  if (!(STAGES as readonly string[]).includes(stage)) throw new LeakCheckUsageError(`--stage must be ${STAGES.join(" or ")}, not ${JSON.stringify(stage)}`);
  return {
    fixture: fixture as Fixture, stage: stage as Stage, userEnv: need("--user-env"), secretEnv: need("--secret-env"),
    worker: found.get("--worker") ?? DEFAULT_WORKER,
  };
}

/** The two values under test, read from the named variables. A missing one is exit 2: there is nothing to look for. */
export function credentialsFrom(args: Pick<LeakCheckArgs, "userEnv" | "secretEnv">, env: Readonly<Record<string, string | undefined>>): Credential[] {
  return [args.userEnv, args.secretEnv].map((name) => {
    const value = env[name];
    if (value === undefined || value === "") throw new LeakCheckUsageError(`${name} is not set: the check has no credential to look for`);
    if (Array.from(value).length < MIN_SCRUBBED_LENGTH) {
      throw new LeakCheckUsageError(`${name} is shorter than ${MIN_SCRUBBED_LENGTH} characters, the floor for a value the run can hide (ADR 0038, amendment 2)`);
    }
    return { name, value };
  });
}

export interface LeakCheckOutcome {
  exit: LeakExit;
  lines: string[];
}

const announcementsIn = (artifact: unknown): number => stringArraysIn(artifact).reduce((total, list) => total + list.length, 0);

function verdictLines(report: LeakCheckReport, exit: LeakExit): string[] {
  const named = [...new Set(report.hits.map((hit) => `${hit.name} (${hit.kind === "contiguous" ? `${hit.kind}, ${hit.form}` : hit.kind})`))];
  const verdict = exit === LEAK_EXIT.clean ? "CLEAN: no credential was found"
    : exit === LEAK_EXIT.leak ? `LEAK: ${named.join(", ")}`
      : "COULD NOT EXAMINE: nothing was looked at, so this says nothing (exit 2 is not a pass)";
  return [describeExamined(report), verdict];
}

/** `--stage raw`: the worker's response as it arrived, before any scrub. */
export function examineRaw(capture: unknown, credentials: readonly Credential[]): LeakCheckOutcome {
  const report: LeakCheckReport = {
    examinedFiles: capture === undefined || capture === null ? 0 : 1,
    examinedAnnouncements: announcementsIn(capture),
    hits: findLeaks(capture, credentials),
  };
  const exit = leakCheckExit(report);
  return { exit, lines: verdictLines(report, exit) };
}

/** The `.json` files under a directory, one level down `runs/witness`-style, or the directory itself. */
function writtenFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? writtenFiles(join(dir, entry.name)) : entry.name.endsWith(".json") ? [join(dir, entry.name)] : []);
}

/**
 * `--stage written`: scrub the response as the run would, WRITE it, then read the files back and examine THEM — the
 * artifacts the tool wrote, not the object it wrote them from. `dir` is where they go (a temp directory in the script).
 */
export function examineWritten(capture: unknown, credentials: readonly Credential[], dir: string): LeakCheckOutcome {
  mkdirSync(dir, { recursive: true });
  let redactions: number;
  try {
    const set = buildScrubSet(credentials);
    redactions = writeScrubbed({ capture }, set, (text) => writeFileSync(join(dir, "witness.json"), text));
  } catch (error) {
    if (!(error instanceof ScrubError)) throw error;
    // Nothing was written, and that IS the finding: the containment refused because a value survived redaction.
    return { exit: LEAK_EXIT.leak, lines: [`the run REFUSED to write: ${error.message}`, "LEAK: the credential reached the transcript in a form the scrub will not touch"] };
  }
  const files = writtenFiles(dir).map((path) => JSON.parse(readFileSync(path, "utf8")) as unknown);
  const report: LeakCheckReport = {
    examinedFiles: files.length,
    examinedAnnouncements: files.reduce<number>((total, file) => total + announcementsIn(file), 0),
    hits: files.flatMap((file) => findLeaks(file, credentials)),
  };
  const exit = leakCheckExit(report);
  return { exit, lines: [redactionNotice(redactions), ...verdictLines(report, exit)] };
}

/** Which of the two stages, given the response the script obtained. */
export function examine(args: LeakCheckArgs, capture: unknown, credentials: readonly Credential[], dir: string): LeakCheckOutcome {
  return args.stage === "raw" ? examineRaw(capture, credentials) : examineWritten(capture, credentials, dir);
}

/** The count a redaction line carries, for the caller that must assert it is at least 1. */
export function redactionCountIn(lines: readonly string[]): number {
  const match = lines.map((line) => /^(\d+) announcements? contained/.exec(line)).find((m) => m !== null);
  return match ? Number(match[1]) : 0;
}
