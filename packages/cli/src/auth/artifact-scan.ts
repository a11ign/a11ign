/**
 * The decisions of `npm run auth:artifact-scan` — "no credential in any artifact" for a REAL run's output (#2560).
 *
 * `auth:leak-check` answers it for the `.json` files it wrote itself from a fixture site. A real authenticated run also
 * leaves markdown (the report and the summary), a PR comment, a job log and whatever a consumer's own upload step
 * attaches, and a credential in any of those read as clean because none was looked at. This points the SAME detector
 * (`leak-detector.ts`, deliberately the only one) at every text file under a path, whatever its extension.
 *
 * The exit contract is the detector's: `0` clean, `1` a leak, `2` could not examine. **Examining nothing is `2`**: an
 * empty directory, or one holding only files that could not be read as text, says nothing. A skipped file is NAMED, so a
 * binary artifact is never a silent pass; it does not turn an otherwise clean scan into a failure, because a run's
 * upload legitimately holds screenshots. A hit names the variable and the file and never the value or any part of it.
 *
 * What it does not cover: a credential that reached a channel it was not pointed at, and one inside a file it skipped.
 */
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";

import { LeakCheckUsageError, credentialsFrom } from "./leak-check.js";
import {
  LEAK_EXIT, describeExamined, findLeaks, leakCheckExit,
  type Credential, type LeakExit, type LeakHit,
} from "./leak-detector.js";

const FLAGS = ["--path", "--user-env", "--secret-env"] as const;

export interface ArtifactScanArgs {
  path: string;
  userEnv: string;
  secretEnv: string;
}

/**
 * `--flag value` and `--flag=value`. An unknown, missing or repeated flag is REFUSED by name, as `parseLeakCheckArgs` does:
 * a mistyped `--pth` scanning nothing and reporting success is the defect `cli-flags.mjs` exists for.
 */
export function parseArtifactScanArgs(argv: readonly string[]): ArtifactScanArgs {
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
  return { path: need("--path"), userEnv: need("--user-env"), secretEnv: need("--secret-env") };
}

interface TextFile { name: string; text: string }
interface SkippedFile { name: string; reason: string }
export interface Gathered { texts: TextFile[]; skipped: SkippedFile[] }

const NUL = "\u0000";

/** The text of a file, or why it is not text: a NUL byte, or bytes that are not valid UTF-8, mean a binary artifact. */
function readAsText(path: string): { text: string } | { reason: string } {
  let bytes: Buffer;
  try {
    bytes = readFileSync(path);
  } catch (error) {
    return { reason: `could not be read (${(error as NodeJS.ErrnoException).code ?? "error"})` };
  }
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return text.includes(NUL) ? { reason: "binary (holds a NUL byte)" } : { text };
  } catch {
    return { reason: "binary (not valid UTF-8)" };
  }
}

/** Every file under `path`, recursively, in a stable order. A symbolic link is named and not followed: it may leave the tree. */
function gatherFrom(path: string, name: string, into: Gathered): void {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink()) into.skipped.push({ name, reason: "symbolic link, not followed" });
  else if (stat.isDirectory()) {
    for (const entry of readdirSync(path).sort()) gatherFrom(join(path, entry), name === "" ? entry : join(name, entry), into);
  } else if (stat.isFile()) {
    const read = readAsText(path);
    if ("text" in read) into.texts.push({ name, text: read.text });
    else into.skipped.push({ name, reason: read.reason });
  } else into.skipped.push({ name, reason: "not a regular file" });
}

/** The text files and the skipped ones under a path. A path that is not there is exit 2: there is nothing to look at. */
export function gatherArtifacts(root: string): Gathered {
  const gathered: Gathered = { texts: [], skipped: [] };
  let isDirectory: boolean;
  try {
    isDirectory = lstatSync(root).isDirectory();
  } catch {
    throw new LeakCheckUsageError(`${JSON.stringify(root)} does not exist: there is nothing to scan`);
  }
  gatherFrom(root, isDirectory ? "" : basename(root), gathered);
  return gathered;
}

const isPresent = (line: string): boolean => line.trim() !== "";

const hitKey = (hit: LeakHit): string => JSON.stringify(hit);

/** One file's hits: its text as written, and, when it parses as JSON, the structure too (a run of one-character list items). */
function hitsIn(text: string, credentials: readonly Credential[]): LeakHit[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return findLeaks(text, credentials);
  }
  const seen = new Set<string>();
  return [...findLeaks(text, credentials), ...findLeaks(parsed, credentials)].filter((hit) => !seen.has(hitKey(hit)) && seen.add(hitKey(hit)));
}

const describeHit = (hit: LeakHit): string => `${hit.name} (${hit.kind === "contiguous" ? `${hit.kind}, ${hit.form}` : hit.kind})`;

export interface ArtifactScanOutcome {
  exit: LeakExit;
  lines: string[];
}

/** Scan what `gatherArtifacts` found. The announcements a text file gives are its non-blank lines. */
export function scanTexts(gathered: Gathered, credentials: readonly Credential[]): ArtifactScanOutcome {
  const perFile = gathered.texts.map(({ name, text }) => ({ name, hits: hitsIn(text, credentials), lines: text.split("\n").filter(isPresent).length }));
  const report = {
    examinedFiles: gathered.texts.length,
    examinedAnnouncements: perFile.reduce((total, file) => total + file.lines, 0),
    hits: perFile.flatMap((file) => file.hits),
  };
  const exit = leakCheckExit(report);
  const skipped = gathered.skipped.map(({ name, reason }) => `SKIPPED ${name}: ${reason}`);
  const leaks = perFile.filter((file) => file.hits.length > 0).map((file) => `LEAK in ${file.name}: ${[...new Set(file.hits.map(describeHit))].join(", ")}`);
  const verdict = exit === LEAK_EXIT.clean ? "CLEAN: no credential was found in what was examined"
    : exit === LEAK_EXIT.leak ? "LEAK: a credential reached an artifact"
      : "COULD NOT EXAMINE: no text file was looked at, so this says nothing (exit 2 is not a pass)";
  return { exit, lines: [...skipped, describeExamined(report), ...leaks, verdict] };
}

/** The whole command's decision: the credentials from the environment, the files under the path, the verdict. */
export function scanArtifacts(args: ArtifactScanArgs, env: Readonly<Record<string, string | undefined>>): ArtifactScanOutcome {
  const credentials = credentialsFrom(args, env);
  return scanTexts(gatherArtifacts(args.path), credentials);
}
