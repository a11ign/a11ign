/**
 * #5333: A RELEASE GATE'S REFUSAL NAMES AN OPEN OWNING ROW, AND THIS READER IS WHAT CHECKS IT.
 *
 * `gate:lab-held` said "whether a release may proceed without them is #5179". #5179 was closed on 2026-10-12 after fixing a DIFFERENT gate, so for six
 * hours the two failed releases had an owner on paper and no open row behind it, and nobody was looking. The class is "a refusal names an owner that
 * has stopped owning it"; `gate:isolation`, `scorer:migration` and every future held stage inherit it.
 *
 * WHAT IS READ. Every `REFUSED` string in `package.json` scripts, and in `.github/workflows/release.yml` every line carrying `REFUSED` or `::error`:
 * the text after the marker to the end of the string (or line) is the refusal. A bare `#<n>` in it is the owner the refusal sends a reader to.
 *
 * A `(#<n>)` IS A CITATION, NOT AN OWNER. The refusal above also says "since ADR 0045 cut 9 (#5087)": the row that made the change, closed for good,
 * and a reader is not sent there. The parenthesised form is this repository's idiom for that and the only one exempted. The exemption has its
 * compensating control: a `REFUSED` string with NO bare owner is itself a finding, so rewording an owner into parentheses cannot make it pass.
 *
 * ONE VERDICT PER OWNER, and only `OPEN` passes. An issue that could not be read is `CANNOT_TELL`, never open (absence is not proof): the reader takes
 * the state through `readState`, so a test drives it on fixtures and the live read is `readIssueState`, run in `ci.yml`'s `refusalOwners` job.
 *
 * EXPORTED so `a11ign/lab`'s CI can drive the same reader over its own `gate:core-held`: it needs only `refusalsInPackageJson`, `findings` and
 * `readIssueState` with its own repository.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export type RefusalKind = "REFUSED" | "::error";
export type Refusal = { file: string; where: string; kind: RefusalKind; text: string };
export type IssueState = "OPEN" | "CLOSED" | "CANNOT_TELL";
export type StateRead = { code: IssueState; why: string };
export type Finding = {
  refusal: Refusal;
  /** `null` only for a `REFUSED` string that names no bare owner at all. */
  number: number | null;
  code: IssueState | "NAMES_NO_OWNER";
  why: string;
};

const REFUSED = "REFUSED";
const ERROR_ANNOTATION = "::error";
const CITATION = /\(\s*#\d+(?:\s*[,;]\s*#\d+)*\s*\)/g;
/** Not a `$#`, a path fragment or the tail of a word: those are never an issue number. */
const ISSUE_REFERENCE = /(?<![\w$&/-])#(\d+)\b/g;
const WORKFLOW_FILE = ".github/workflows/release.yml";
const PACKAGE_FILE = "package.json";
const DEFAULT_REPO = "a11ign/a11ign";

/** The `scripts` of a `package.json`, one refusal per script whose command holds `REFUSED`. */
export function refusalsInPackageJson(file: string, content: string): Refusal[] {
  const scripts = (JSON.parse(content) as { scripts?: Record<string, string> }).scripts ?? {};
  return Object.entries(scripts)
    .filter(([, command]) => command.includes(REFUSED))
    .map(([name, command]) => ({
      file, where: `script "${name}"`, kind: REFUSED, text: command.slice(command.indexOf(REFUSED) + REFUSED.length),
    }));
}

/** A workflow's `REFUSED` and `::error` lines. A YAML comment that says the word is prose about a refusal, not one. */
export function refusalsInWorkflow(file: string, content: string): Refusal[] {
  return content.split("\n").flatMap((line, index): Refusal[] => {
    if (line.trimStart().startsWith("#")) return [];
    const kind: RefusalKind | null = line.includes(REFUSED) ? REFUSED : line.includes(ERROR_ANNOTATION) ? ERROR_ANNOTATION : null;
    if (kind === null) return [];
    const marker = kind === REFUSED ? REFUSED : ERROR_ANNOTATION;
    return [{ file, where: `line ${index + 1}`, kind, text: line.slice(line.indexOf(marker) + marker.length) }];
  });
}

/** Every refusal of the tree rooted at `root`, from the two places the row names. */
export function refusalsInTree(root: string): Refusal[] {
  return [
    ...refusalsInPackageJson(PACKAGE_FILE, readFileSync(join(root, PACKAGE_FILE), "utf8")),
    ...refusalsInWorkflow(WORKFLOW_FILE, readFileSync(join(root, WORKFLOW_FILE), "utf8")),
  ];
}

/** The issue numbers a refusal's text names as its owner: every bare `#<n>`, once, with `(#<n>)` citations removed first. */
export function ownersOf(text: string): number[] {
  const bare = text.replace(CITATION, " ");
  return [...new Set([...bare.matchAll(ISSUE_REFERENCE)].map((match) => Number(match[1])))];
}

function findingsOf(refusal: Refusal, readState: (number: number) => StateRead): Finding[] {
  const owners = ownersOf(refusal.text);
  if (owners.length === 0) {
    // A `::error` line is mostly not a pointer to anybody; a REFUSED string is the one a person acts on, and it must send them somewhere.
    if (refusal.kind === ERROR_ANNOTATION) return [];
    return [{ refusal, number: null, code: "NAMES_NO_OWNER", why: "the refusal names no row as its owner (a `(#n)` citation is not one)" }];
  }
  return owners.map((number) => ({ refusal, number, ...readState(number) }));
}

/** One finding per owner a refusal names, read through `readState`; a state is asked for once however many refusals name the issue. */
export function findings(refusals: Refusal[], readState: (number: number) => StateRead): Finding[] {
  const memo = new Map<number, StateRead>();
  const cached = (number: number): StateRead => {
    if (!memo.has(number)) memo.set(number, readState(number));
    return memo.get(number)!;
  };
  return refusals.flatMap((refusal) => findingsOf(refusal, cached));
}

/** What did not pass: everything but an `OPEN` owner, `CANNOT_TELL` and a refusal naming no owner included. */
export function failures(all: Finding[]): Finding[] {
  return all.filter((finding) => finding.code !== "OPEN");
}

/** One line, naming the file, the script or line, and the number: what the reader of a red job needs in order to act. */
export function describe(finding: Finding): string {
  const at = `${finding.refusal.file} ${finding.refusal.where}`;
  if (finding.number === null) return `${at}: ${finding.why}`;
  return `${at}: ${finding.refusal.kind} names #${finding.number} as its owner, and #${finding.number} is ${finding.code}${finding.code === "CANNOT_TELL" ? ` (${finding.why})` : ""}`;
}

/** `gh` with these arguments, as its stdout. Injectable so a test reads every answer GitHub can give without spawning anything. */
export type GhRunner = (args: string[]) => string;
const runGh: GhRunner = (args) => execFileSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

/** The live instrument: GitHub's own issue endpoint (the core pool, which `gh issue view` is not), as the asking token sees it. */
export function readIssueState(
  repo: string = process.env.A11Y_REFUSAL_OWNERS_REPO ?? process.env.GITHUB_REPOSITORY ?? DEFAULT_REPO,
  run: GhRunner = runGh,
) {
  return (number: number): StateRead => {
    try {
      const state = run(["api", `repos/${repo}/issues/${number}`, "--jq", ".state"]).trim();
      if (state === "open") return { code: "OPEN", why: `${repo}#${number} is open` };
      if (state === "closed") return { code: "CLOSED", why: `${repo}#${number} is closed` };
      return { code: "CANNOT_TELL", why: `${repo}#${number} answered state ${JSON.stringify(state)}, which is neither open nor closed` };
    } catch (cause) {
      return { code: "CANNOT_TELL", why: `${repo}#${number} could not be read: ${String(cause).split("\n")[0]}` };
    }
  };
}
