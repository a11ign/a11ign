#!/usr/bin/env node
// @ts-check
// command: read the outside repository's verdict on the release `latest` points at, fail on red or on absent-past-the-window, and file ONE `regression` row per version
//
// THE DRIVER OF #3181's READER, AND THE PLACE THE SWAP LANDS (#3184, ADR 0042 decisions 4 and 6). `verdict.ts` is a pure decision
// over four facts and fetches nothing; this gathers them (the registry, the release tag, the outside repository's PUBLIC run list),
// turns the verdict into a pass or a fail, and files the row. `registry-consumer-gate.yml`'s `outsider` job runs it.
//
// IT NEVER REFUSES A PUBLISH. `red` fails THIS job and files a row, and nothing else reads that: a fix is itself a release, and a
// block would deadlock it behind its own defect (ADR 0041 decision 3: a block files a row and does not revert). The version that
// failed is already on the registry when this learns of it, and this says so rather than pretending to have prevented it.
//
// ONE WORD DECIDES THE EXIT: `green` and `pending` inside the window pass (pending with a notice naming the version and its age);
// `red` and `absent` past the window fail. A fact this cannot read (a malformed version, a tag that does not exist) THROWS and fails
// the job too, because a reading that guessed would be the one that says `green` on a bad day.
//
// THE FILING IS IDEMPOTENT PER VERSION, by title, over every row ever filed (open or closed): a second red reading of the same
// version, on the next day's schedule, files nothing and says so. It files through `agent-org row-file`, never `gh issue create`.
//
// KNOWN GAP (#3318): `row-file`'s board step does not resolve under `github.token`, which is the only token this job may hold. The
// row is CREATED and labelled; it may not reach the board. Said here so nobody reads a filed row as a woken one.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const { assertNoLeakInArgv, leakRefusalReason } = await toolExport("leak-patterns");
import { refuseUnknownFlags } from "@a11ign/screenreader-fleet/cli-flags";
import { sandboxGitEnv } from "../../packages/guards/src/git-env.ts";
import { pnpmCliInvocation } from "../npm-cli-executable.ts";
import { outsiderVerdict } from "./verdict.ts";
import { toolExport } from "../agent-org-newest-tag.ts";
import { promotionTimeFrom } from "../release-promote.ts";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = join(HERE, "../..");
const PRODUCT_REPO = "a11ign/a11ign";
const PACKAGE = "a11ign";
const RUN_LIST_LIMIT = 200;
const MAX_GH_OUTPUT_BYTES = 67_108_864;
const REPOSITORY_SHAPE = /^[\w.-]+\/[\w.-]+$/;

/** The session `Filed-by:` names: this job, which is nobody's session and may not be mistaken for one. */
export const FILING_SESSION = "outsider-verdict-job";
export const REGRESSION_LABEL = "regression";

/**
 * THE OUTSIDE REPOSITORY'S NAME, DECLARED ONCE in `repository.json` (#3184) and read here, so no workflow carries it as a literal.
 * Refused when it is not an `owner/name`: a misspelt value would make `gh run list` fail loudly, and one that parsed as something
 * else would read the wrong repository's runs.
 * @param {string} [file]
 * @returns {string}
 */
export function readOutsiderRepository(file: string = join(HERE, "repository.json")): string {
  const { repository } = JSON.parse(readFileSync(file, "utf8"));
  if (typeof repository !== "string" || !REPOSITORY_SHAPE.test(repository)) {
    throw new TypeError(`${file}: "repository" must be an owner/name, got ${JSON.stringify(repository)}`);
  }
  return repository;
}

/**
 * What the job does with a verdict. `fails` is the job's exit; `files` is whether a regression row is owed; `notice` is the line
 * a PASS still prints (a pending reading names its version and age, so a quiet pass is not mistaken for a green one).
 * @param {import("./verdict.ts").OutsiderVerdict} result
 * @returns {{ fails: boolean, files: boolean, notice: string | null }}
 */
export function jobDecision(result: import("./verdict.ts").OutsiderVerdict): { fails: boolean; files: boolean; notice: string | null; } {
  switch (result.verdict) {
    case "green": return { fails: false, files: false, notice: null };
    case "pending": return { fails: false, files: false, notice: result.reason };
    case "red":
    case "absent": return { fails: true, files: true, notice: null };
    default: throw new TypeError(`unknown verdict ${JSON.stringify(/** @type {any} */ (result).verdict)}`);
  }
}

/** One row per VERSION, whichever of `red` or `absent` it was: the title names the version and nothing else. @param {string} version */
export const regressionTitle = (version: string) => `Outsider job did not pass for ${PACKAGE} v${version}`;

/**
 * THE FILING IS IDEMPOTENT: a list already holding this version's title files nothing, and says so.
 * @param {{ version: string, existingTitles: string[] }} input
 * @returns {{ file: boolean, title: string, reason: string }}
 */
export function filingPlan({ version, existingTitles }: { version: string; existingTitles: string[]; }): { file: boolean; title: string; reason: string; } {
  const title = regressionTitle(version);
  return existingTitles.includes(title)
    ? { file: false, title, reason: `a row titled "${title}" already exists, so nothing is filed` }
    : { file: true, title, reason: `no row titled "${title}" exists, so one is filed` };
}

/**
 * The row's body: what failed, which run, and what is NOT being done about it. Born valid under the filing contract (a row that
 * fixes nothing in place declares its Region as none, in the sentence `row-file`'s `declaresNoCommit` looks for), which is why the diagnosis and the fix are the next row's.
 * @param {{ version: string, tagSha: string, result: import("./verdict.ts").OutsiderVerdict, outsiderRepository: string, runUrl: string }} input
 */
export function regressionBody({ version, tagSha, result, outsiderRepository, runUrl }: { version: string; tagSha: string; result: import("./verdict.ts").OutsiderVerdict; outsiderRepository: string; runUrl: string; }) {
  const seen = result.run
    ? `its newest answering run was created ${result.run.createdAt} and ended \`${result.run.conclusion}\``
    : "no run answered for it";
  return [
    "## What it is", "",
    `The outsider job read **${result.verdict}** for \`${PACKAGE}@${version}\` (tag commit \`${tagSha}\`): ${result.reason}. `
      + `The reader says ${seen}. Read the outside repository's run list at https://github.com/${outsiderRepository}/actions and `
      + `the reading that filed this at ${runUrl}.`, "",
    "**This version is already on the registry**: a post-publish check cannot prevent THAT publish, and a version cannot be unpublished "
      + "after 72 hours. **It does not stop the next publish** (a fix is itself a release; ADR 0041 decision 3, ADR 0042 decision 4), "
      + "so the row asks for a diagnosis and a fix-forward, never a revert.", "",
    "## Region", "", "none -- its deliverable is not a commit: this row asks for a diagnosis; the fixing row's Region is written when the cause is known", "",
    "## Acceptance: none — the deliverable is the diagnosis on this row and the row that fixes it, filed `ready`", "",
    "## Open-check", "", "```",
    `$ gh issue list --repo ${PRODUCT_REPO} --state all --search "${regressionTitle(version)} in:title" --json number --jq length`,
    "0", "```", "",
    "Measured by the filing run: no row of this title existed.",
  ].join("\n");
}

/**
 * The registry facts `outsiderVerdict` takes, from the registry's packument (the promotion time comes from the Release, `readPromotedAt`). Refused when `latest` has no publish time:
 * an age nobody can read would make `absent` unreachable, which is the reader saying `pending` forever.
 * @param {{ "dist-tags"?: { latest?: string }, time?: Record<string, string> }} packument
 * @returns {{ latest: string, publishedAt: string }}
 */
export function latestFromPackument(packument: { "dist-tags"?: { latest?: string; }; time?: Record<string, string>; }): { latest: string; publishedAt: string; } {
  const latest = packument["dist-tags"]?.latest;
  if (!latest) throw new TypeError(`the registry's ${PACKAGE} packument names no \`latest\` dist-tag`);
  const publishedAt = packument.time?.[latest];
  if (!publishedAt) throw new TypeError(`the registry's ${PACKAGE} packument has no publish time for ${latest}`);
  return { latest, publishedAt };
}

// ---- reading and filing: the only I/O -------------------------------------------------------------------

/** @param {string[]} args @returns {string} */
const gh = (args: string[]): string => (assertNoLeakInArgv("gh", args), execFileSync("gh", args, { encoding: "utf8", cwd: REPO_ROOT, maxBuffer: MAX_GH_OUTPUT_BYTES }));

/** The release tag's COMMIT: the peeled ref of an annotated tag, else the tag itself. @param {string} version */
function tagShaOf(version: string) {
  const remote = `https://github.com/${PRODUCT_REPO}`;
  for (const ref of [`refs/tags/a11ign@${version}^{}`, `refs/tags/a11ign@${version}`]) {
    const sha = execFileSync("git", ["ls-remote", remote, ref], { encoding: "utf8", env: sandboxGitEnv() }).split("\t")[0].trim();
    if (sha) return sha;
  }
  throw new Error(`no release tag a11ign@${version} on ${remote}`);
}

/**
 * The registry's `latest` and its publish time, read through `pnpm view` (the repository's one package manager, and not a raw network call,
 * which the fetch-wrapper census accounts for by name). Public data, no credential.
 */
function readLatest() {
  const { command, args } = pnpmCliInvocation(["view", PACKAGE, "dist-tags", "time", "--json"]);
  return latestFromPackument(JSON.parse(execFileSync(command, args, { encoding: "utf8", cwd: REPO_ROOT, maxBuffer: MAX_GH_OUTPUT_BYTES })));
}

/**
 * When `latest` moved to this version, from the `Promoted to latest:` line of its GitHub Release (public, `github.token`), parsed by the
 * promoter's own `promotionTimeFrom`. null when the Release has no such line or does not exist: the verdict then ages from the publish
 * and says so. Any OTHER failure of `gh` propagates, because an unreadable Release is not an unpromoted one.
 * @param {string} version
 * @returns {string | null}
 */
function readPromotedAt(version: string): string | null {
  try {
    return promotionTimeFrom(gh(["release", "view", `${PACKAGE}@${version}`, "--repo", PRODUCT_REPO, "--json", "body", "--jq", ".body"]));
  } catch (error) {
    const stderr = String((error as { stderr?: unknown }).stderr ?? "");
    if (/release not found/i.test(stderr)) return null;
    throw error;
  }
}

/** @param {string} outsiderRepository */
function readFacts(outsiderRepository: string) {
  const { latest, publishedAt } = readLatest();
  const runs = JSON.parse(gh(["run", "list", "--repo", outsiderRepository, "--limit", String(RUN_LIST_LIMIT),
    "--json", "displayTitle,status,conclusion,createdAt"]));
  return { latest, tagSha: tagShaOf(latest), publishedAt, promotedAt: readPromotedAt(latest), now: new Date().toISOString(), runs };
}

/**
 * `regression` does not exist until something creates it (ADR 0041, #3135 closed without), and `gh issue create --label` of a missing label
 * files NOTHING. So the label is created here when absent, and a second run neither errors nor duplicates it: a create that loses a race
 * (the other trigger created it between our list and our create) is read back, and only a label STILL absent is a failure.
 * @param {(args: string[]) => string} run `gh`, injectable so the two cases are testable without GitHub
 */
export function ensureRegressionLabel(run: (args: string[]) => string = gh) {
  const present = () => JSON.parse(run(["label", "list", "--repo", PRODUCT_REPO, "--search", REGRESSION_LABEL, "--json", "name"]))
    .some((/** @type {{ name: string }} */ l: { name: string; }) => l.name === REGRESSION_LABEL);
  if (present()) return;
  try {
    run(["label", "create", REGRESSION_LABEL, "--repo", PRODUCT_REPO, "--color", "B60205",
      "--description", "a release that was published and then found not to work"]);
  } catch (cause) {
    if (!present()) throw new Error(`could not create the \`${REGRESSION_LABEL}\` label`, { cause });
  }
}

/** @param {string} version @returns {string[]} the titles of every row ever filed for it, open or closed */
const existingTitlesFor = (version: string): string[] => JSON.parse(gh(["issue", "list", "--repo", PRODUCT_REPO, "--state", "all",
  "--search", `"${regressionTitle(version)}" in:title`, "--limit", "100", "--json", "title"]))
  .map((/** @type {{ title: string }} */ row: { title: string; }) => row.title);

/**
 * `--label out-of-release` is the release declaration the filing contract demands: this row never blocks a publish, which is the
 * board's own test for it. `--ready` because a regression row waits in no backlog.
 * @param {string} title @param {string} bodyFile
 */
export const rowFileArgs = (title: string, bodyFile: string) => ["exec", "agent-org", "row-file", `--session=${FILING_SESSION}`, "--ready",
  "--label", "out-of-release", "--label", REGRESSION_LABEL, "--title", title, "--body-file", bodyFile];

/** @param {string} title @param {string} body */
export function fileThroughRowFile(title: string, body: string) {
  const leak = leakRefusalReason(body); // row-file reads a FILE, which `assertNoLeakInArgv` cannot see, so the text is checked here
  if (leak) throw new Error(leak);
  const dir = mkdtempSync(join(tmpdir(), "outsider-verdict-"));
  try {
    const file = join(dir, "body.md");
    writeFileSync(file, body);
    const { command, args } = pnpmCliInvocation(rowFileArgs(title, file));
    execFileSync(command, args, { cwd: REPO_ROOT, stdio: "inherit" });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * The filing, in its order: the existing rows decide, and only a version with none gets the label ensured and then the row filed.
 * @param {{ version: string, body: string }} row
 * @param {{ titlesFor: (version: string) => string[], ensureLabel: () => void, file: (title: string, body: string) => void }} io
 *   everything that touches GitHub, injectable so the order and the idempotency are testable
 * @returns {{ filed: boolean, title: string }}
 */
export function fileOnce({ version, body }: { version: string; body: string; }, io: { titlesFor: (version: string) => string[]; ensureLabel: () => void; file: (title: string, body: string) => void; } = { titlesFor: existingTitlesFor, ensureLabel: () => ensureRegressionLabel(), file: fileThroughRowFile }): { filed: boolean; title: string; } {
  const plan = filingPlan({ version, existingTitles: io.titlesFor(version) });
  process.stdout.write(`${plan.reason}\n`);
  if (!plan.file) return { filed: false, title: plan.title };
  io.ensureLabel();
  io.file(plan.title, body);
  return { filed: true, title: plan.title };
}

/**
 * A filing that failed does not change the exit (the job is red already) and must not be mistaken for a reading that failed, so it is
 * named: `row-file` may have created the row and then failed its board step (#3318), and the next run's idempotency check sees it.
 * @param {() => void} file
 */
function reportFilingFailure(file: () => void) {
  try {
    file();
  } catch (error) {
    process.stdout.write(`::error::the regression row was not filed cleanly (it may exist without a board item, #3318): ${
      error instanceof Error ? error.message : String(error)}\n`);
  }
}

const runUrl = () => process.env.GITHUB_RUN_ID
  ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
  : "(a run outside Actions)";

/**
 * `A11Y_OUTSIDER_FACTS` names a JSON file holding the facts and the run list, read INSTEAD of the network, so the command can be
 * driven end to end by a test (`docs/proving-a-gate.md` step 2). A fixture never files: it prints the plan and stops, because a test
 * must not be able to create a row.
 * @returns {number} process exit code
 */
function main(): number {
  const outsiderRepository = readOutsiderRepository();
  const fixture = process.env.A11Y_OUTSIDER_FACTS;
  const facts = fixture ? JSON.parse(readFileSync(fixture, "utf8")) : readFacts(outsiderRepository);
  const result = outsiderVerdict(facts);
  const decision = jobDecision(result);
  process.stdout.write(`outsider verdict for ${PACKAGE}@${facts.latest}: ${result.verdict} -- ${result.reason}\n`);
  if (decision.notice) process.stdout.write(`::notice::${decision.notice}\n`);
  if (!decision.files) return 0;
  const body = regressionBody({ version: facts.latest, tagSha: facts.tagSha, result, outsiderRepository, runUrl: runUrl() });
  if (fixture) process.stdout.write(`would file: ${filingPlan({ version: facts.latest, existingTitles: [] }).title}\n`);
  else reportFilingFailure(() => fileOnce({ version: facts.latest, body }));
  process.stdout.write("::error::the outsider job did not pass for the release `latest` points at. "
    + "This does not refuse a publish: a fix is itself a release.\n");
  return 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ? realpathSync(process.argv[1]) : "").href) {
  refuseUnknownFlags([], { entry: import.meta.url, command: "pnpm run outsider:verdict" });
  try {
    process.exit(main());
  } catch (error) {
    process.stderr.write(`::error::the outsider verdict could not be read: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
