#!/usr/bin/env node
// command: check the Auth0 tenant file by name, mode and seed shape, and set its five values as repository Actions secrets from stdin
// THE TENANT'S FIVE VALUES ARRIVE AS ONE FILE ON THE HOST — #4974, part of #4084 (v3: sign-in through a hosted provider WITH MFA).
//
//   node scripts/auth0-e2e-env.ts                                        --check (the default): report by NAME, never by value
//   node scripts/auth0-e2e-env.ts --check --file <path>                  read another file than ~/.config/a11ign/auth0-e2e.env
//   node scripts/auth0-e2e-env.ts --apply-secrets --repo <owner/name>    check, then `gh secret set <NAME> --repo <owner/name>` x5
//
// ## NOT RUN AGAINST THE REAL FILE BY THE ROW THAT BUILT IT
//
// Setting an Actions secret needs repository admin, which a worker session does not hold, and the file holds the chairman's tenant
// credentials. The tests here use sentinel values in a throwaway file and a stub `gh`; the one real `--check`, then `--apply-secrets`, is
// the chairman's session's (#4084). Nothing about this row's Acceptance needs the real file.
//
// ## Why nothing can print a value
//
// The five values are credentials, the TOTP seed among them. So every message this script writes names a variable, a line NUMBER or a
// mode, never content: a malformed line is reported by its number because it may be a value pasted on the wrong side of an `=`.
// `gh`'s own output is swallowed for the same reason (it is not ours to vouch for), and a value reaches `gh` on STDIN, never in argv,
// which a process list or a shell history would keep.
//
// ## What "valid" means here, and what it does not
//
// Mode must be exactly 600: a file another user can read has already leaked. The seed must parse as RFC 4648 base32 (A-Z, 2-7,
// optional `=` padding to a multiple of eight, at least 16 characters); that says the seed is TOTP-shaped, never that the tenant accepts it.
import { readFileSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export const NAMES = ["AUTH0_DOMAIN", "AUTH0_CLIENT_ID", "AUTH0_TEST_USER", "AUTH0_TEST_PASSWORD", "AUTH0_TOTP_SEED"] as const;
export const SEED_NAME = "AUTH0_TOTP_SEED";
export const DEFAULT_FILE = join(homedir(), ".config/a11ign/auth0-e2e.env");
export const REQUIRED_MODE = 0o600;
const PERMISSION_BITS = 0o777;
const OCTAL = 8;
const BASE32_BLOCK = 8;
const MIN_SEED_CHARACTERS = 16;
const IMPOSSIBLE_REMAINDERS = [1, 3, 6];
const REPO_SHAPE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const BASE32_BODY = /^[A-Z2-7]+={0,6}$/i;
const LINE_SHAPE = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/;

export const EXIT = { OK: 0, REFUSED: 1, USAGE: 2 };

export interface Parsed {
  values: Record<string, string>;
  malformedLines: number[];
}

/** Every `NAME=value` line; a blank or `#` line is skipped, anything else is a malformed line, reported by number only. */
export function parseEnvFile(text: string): Parsed {
  const values: Record<string, string> = {};
  const malformedLines: number[] = [];
  text.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) return;
    const match = LINE_SHAPE.exec(line);
    if (!match) malformedLines.push(index + 1);
    else values[match[1]] = unquote(match[2].trim());
  });
  return { values, malformedLines };
}

function unquote(value: string): string {
  const quoted = value.length >= 2 && (value[0] === '"' || value[0] === "'") && value.endsWith(value[0]);
  return quoted ? value.slice(1, -1) : value;
}

/** RFC 4648 base32: the alphabet, `=` padding only at the end and only to a multiple of eight, and long enough to be a seed. */
export function isBase32Seed(value: string): boolean {
  if (!BASE32_BODY.test(value)) return false;
  const padded = value.includes("=");
  if (padded && value.length % BASE32_BLOCK !== 0) return false;
  const characters = value.replace(/=+$/, "").length;
  // 1, 3 and 6 characters past a block of eight cannot come from whole bytes: RFC 4648 unpadded lengths are 0, 2, 4, 5 or 7 mod 8.
  return characters >= MIN_SEED_CHARACTERS && !IMPOSSIBLE_REMAINDERS.includes(characters % BASE32_BLOCK);
}

export interface Report {
  ok: boolean;
  lines: string[];
  values: Record<string, string>;
}

/** The whole reading of the file, pure over its path: every line is a name, a number or a mode. */
export function checkFile(path: string): Report {
  const refusal = (line: string): Report => ({ ok: false, lines: [line], values: {} });
  let mode: number;
  let text: string;
  try {
    mode = statSync(path).mode & PERMISSION_BITS;
    text = readFileSync(path, "utf8");
  } catch (cause) {
    const code = (cause as NodeJS.ErrnoException).code ?? "error";
    return refusal(`REFUSED: cannot read the tenant file (${code})`);
  }
  const parsed = parseEnvFile(text);
  const lines = [modeLine(mode), ...malformedLines(parsed), ...NAMES.map((name) => nameLine(name, parsed.values))];
  const ok = mode === REQUIRED_MODE && parsed.malformedLines.length === 0 && lines.every((line) => !line.startsWith("REFUSED"));
  return { ok, lines, values: ok ? parsed.values : {} };
}

function modeLine(mode: number): string {
  const shown = mode.toString(OCTAL).padStart(3, "0");
  return mode === REQUIRED_MODE ? `ok: file mode is ${shown}` : `REFUSED: file mode is ${shown}, it must be 600`;
}

function malformedLines(parsed: Parsed): string[] {
  return parsed.malformedLines.map((number) => `REFUSED: line ${number} is not NAME=value`);
}

function nameLine(name: string, values: Record<string, string>): string {
  const value = values[name];
  if (value === undefined) return `REFUSED: ${name} is missing`;
  if (value === "") return `REFUSED: ${name} is empty`;
  if (name === SEED_NAME && !isBase32Seed(value)) return `REFUSED: ${name} is not RFC 4648 base32`;
  return name === SEED_NAME ? `ok: ${name} is present and base32` : `ok: ${name} is present`;
}

/** One `gh secret set` per name, the value on stdin and nothing of `gh`'s output kept. Returns the lines to print. */
export function applySecrets(values: Record<string, string>, repo: string): { ok: boolean; lines: string[] } {
  const lines: string[] = [];
  let ok = true;
  for (const name of NAMES) {
    const run = spawnSync("gh", ["secret", "set", name, "--repo", repo], { input: values[name], stdio: ["pipe", "ignore", "ignore"] });
    const set = run.status === 0;
    ok = ok && set;
    lines.push(set ? `set: ${name}` : `FAILED: ${name} (gh exit ${run.status ?? "none"})`);
  }
  return { ok, lines };
}

interface Options {
  apply: boolean;
  repo?: string;
  file: string;
}

function parseArgs(argv: string[]): Options | string {
  const options: Options = { apply: false, file: DEFAULT_FILE };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === "--check") options.apply = false;
    else if (flag === "--apply-secrets") options.apply = true;
    else if (flag === "--repo" || flag === "--file") {
      const next = argv[++i];
      if (next === undefined) return `${flag} needs a value`;
      if (flag === "--repo") options.repo = next;
      else options.file = next;
    } else return `unknown argument ${flag}`;
  }
  if (options.apply && !(options.repo && REPO_SHAPE.test(options.repo))) return "--apply-secrets needs --repo <owner/name>";
  return options;
}

export function main(argv: string[], write: (line: string) => void = console.log): number {
  const options = parseArgs(argv);
  if (typeof options === "string") {
    write(`usage: ${options}`);
    return EXIT.USAGE;
  }
  const report = checkFile(options.file);
  report.lines.forEach(write);
  if (!report.ok) return EXIT.REFUSED;
  if (!options.apply || !options.repo) return EXIT.OK;
  const applied = applySecrets(report.values, options.repo);
  applied.lines.forEach(write);
  return applied.ok ? EXIT.OK : EXIT.REFUSED;
}

if (import.meta.url === pathToFileURL(process.argv[1] ? realpathSync(process.argv[1]) : "").href) {
  process.exitCode = main(process.argv.slice(2));
}
