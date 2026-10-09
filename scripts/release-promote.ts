#!/usr/bin/env node
// @ts-check
// command: decide which versions published to `next` become `latest`, and print the plan release.yml's `promote` job carries out
//
// #3947 (outcome 3 of #3911: release channels and promotion by evidence; #3946 is the publish side). A push publishes to the dist-tag
// `next` with the fleet's verdict off the path; THIS reads that verdict afterwards, through the decider that already exists
// (`qualificationDecision`, #3136), and says which versions may move to `latest`. It MOVES NOTHING ITSELF: the plan goes to
// `$GITHUB_OUTPUT` and the workflow runs `npm dist-tag add`, so what is decided here can be run on a laptop with no token and no
// effect, and what is changed is a line of the workflow a reviewer reads.
//
// WHAT IT READS, with no event payload: the registry's dist-tags for every public package here. A package whose `next` is STRICTLY
// newer than its `latest` is a candidate, so the event that woke the job (a status on some sha, or the release's own push) is only a
// reason to look, and a status on an EARLIER commit that qualifies a later release (`nearestVerdict`) is found like any other.
// The release sha of a candidate is the parent of the commit its tag `name@version` points at: the release commit is detached and
// sits on top of the main sha the lab qualified. Candidates at one sha are decided together, as the release was published together.
//
// FOUR OUTCOMES, as the decider says them: `proceed` promotes every package of the group; `wait` and `rerun` change nothing and are
// read again at the next status; `regression` leaves `latest` where it is, which IS the rollback, and names ONE row. A wait past the
// bound names its row too. Nothing here widens that: a missing status is `wait`, a status in a state nobody defined THROWS, and a
// registry answer or tag that cannot be read blocks that group and is reported, never read as a pass. A tag that does not EXIST yet
// is the one unreadable thing that waits instead (#3969): the version is on the registry and the called workflow's tag job has not cut it.
//
// WHERE IT RUNS (#3969): in the `decide` job, which holds no `id-token`, because this script imports the `agent-org` tool cloned from
// another repository. The job that can mint an npm token receives only the validated `name@x.y.z` list and checks it again.
//
// `latest` NEVER MOVES BACKWARDS: `promotionPlan` refuses a version older than the registry's latest for any package of the group,
// and holds the whole group with it. A candidate is newer by construction; the refusal is for the day the registry changed between
// the reading and the move.
import { realpathSync, appendFileSync, readFileSync, readdirSync, existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { refuseUnknownFlags } from "./cli-flags.ts";
import { sandboxGitEnv } from "../packages/guards/src/git-env.ts";
import { qualificationDecision, gatherHistory, WAIT_BOUND_MINUTES, QUALIFICATION_CONTEXT } from "./release-reads-qualification.ts";

type Released = { name: string, version: string, directory: string };
type Decision = { outcome: "proceed" | "wait" | "rerun" | "regression", reason: string, overdue: boolean };
type Row = { title: string, labels: string[], body: string };

const REGISTRY = "https://registry.npmjs.org";
const PLAIN_VERSION = /^(\d+)\.(\d+)\.(\d+)$/;
const SECONDS_PER_MINUTE = 60;
const MS_PER_SECOND = 1000;
const HTTP_NOT_FOUND = 404;

/** @param {string} version @returns {[number, number, number]} */
function triple(version: string): [number, number, number] {
  const match = PLAIN_VERSION.exec(version);
  if (!match) throw new Error(`CANNOT_TELL: ${version} is not a plain x.y.z version`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** @param {string} a @param {string} b */
function isNewer(a: string, b: string) {
  const [left, right] = [triple(a), triple(b)];
  for (let i = 0; i < left.length; i++) if (left[i] !== right[i]) return left[i] > right[i];
  return false;
}

/** ADR 0040 reserves an extracted package's name with `0.0.0-reserved.0`: a name held, not a release, so the floor `0.0.0` (release.yml's own reading).
 * @param {string | undefined} latest */
function floorOf(latest: string | undefined) {
  if (latest === undefined || /^0\.0\.0-reserved\.\d+$/.test(latest)) return "0.0.0";
  return latest;
}

/**
 * What the registry's `latest` is for a name, and the plan for a release whose decision is already made. PURE.
 * @param {{ decision: Decision, released: Released[], registryLatest: Record<string, string | undefined> }} input
 * @returns {{ promote: Released[], refused: { name: string, version: string, latest: string }[], already: string[] }}
 */
export function promotionPlan({ decision, released, registryLatest }: { decision: Decision; released: Released[]; registryLatest: Record<string, string | undefined>; }): { promote: Released[]; refused: { name: string; version: string; latest: string; }[]; already: string[]; } {
  if (decision.outcome !== "proceed") return { promote: [], refused: [], already: [] };
  /** @type {Released[]} */ const promote: Released[] = [];
  /** @type {string[]} */ const already: string[] = [];
  /** @type {{ name: string, version: string, latest: string }[]} */ const refused: { name: string; version: string; latest: string; }[] = [];
  for (const release of released) {
    if (!(release.name in registryLatest)) throw new Error(`CANNOT_TELL: no registry reading of ${release.name}, so whether ${release.version} is older is unknown`);
    const latest = floorOf(registryLatest[release.name]);
    if (isNewer(latest, release.version)) refused.push({ name: release.name, version: release.version, latest });
    else if (isNewer(release.version, latest)) promote.push(release);
    else already.push(`${release.name}@${release.version}`);
  }
  return refused.length > 0 ? { promote: [], refused, already } : { promote, refused, already };
}

/**
 * The ONE row a promotion raises, or null: `regression` (two failures) and an overdue `wait`. The title carries the whole sha and is
 * the row's identity, which the filing job looks up before it files, so a re-evaluation at the next status files none. Both bodies say
 * `latest` stays: the rollback is that the move never happened.
 * @param {Decision} decision @param {string} releaseSha @param {Released[]} released @param {string} [runUrl]
 * @returns {Row | null}
 */
function promotionRow({ outcome, reason, overdue }: Decision, releaseSha: string, released: Released[], runUrl?: string): Row | null {
  const named = released.map((r) => `${r.name}@${r.version}`).join(", ");
  const head = `Release sha: ${releaseSha}\nPublished to \`next\`: ${named}\n${runUrl ? `Run: ${runUrl}\n` : ""}\n`;
  const stays = "`latest` stays on the last qualified version. Nothing is skipped to get a pass, no threshold moves, and there is no revert (fix forward). "
    + `The writer of the \`${QUALIFICATION_CONTEXT}\` status is #3289; the contract is #3136.\n`;
  if (outcome === "regression") {
    return { title: `promotion ${releaseSha}: qualification regression confirmed, latest stays`, labels: ["regression", "answer:orchestrator"],
      body: `${head}The fleet part failed TWICE on this sha: ${reason}\n\n${stays}` };
  }
  if (outcome === "wait" && overdue) {
    return { title: `promotion ${releaseSha}: qualification wait overdue, latest stays`, labels: ["qualification-overdue", "answer:orchestrator"],
      body: `${head}No verdict inside the ${WAIT_BOUND_MINUTES} minute bound (a measured maximum and not a guarantee): ${reason}\n\n${stays}Once the lab has posted, the next status re-reads it.\n` };
  }
  return null;
}

/**
 * Does this release promote? The decider's outcome, then the plan, then the row. PURE: `history` is gathered by the caller.
 * @param {{ releaseSha: string, released: Released[], history: Parameters<typeof qualificationDecision>[0]["history"],
 *   waitedMinutes: number, registryLatest: Record<string, string | undefined>, runUrl?: string }} input
 */
export function decidePromotion({ releaseSha, released, history, waitedMinutes, registryLatest, runUrl }: {
        releaseSha: string; released: Released[]; history: Parameters<typeof qualificationDecision>[0]["history"];
        waitedMinutes: number; registryLatest: Record<string, string | undefined>; runUrl?: string;
    }) {
  const decision = qualificationDecision({ releaseSha, packages: released.map((r) => r.directory), history, waitedMinutes });
  const row = promotionRow(decision, releaseSha, released, runUrl);
  return { decision, ...promotionPlan({ decision, released, registryLatest }), rows: row ? [row] : [] };
}

// ---- the registry's side ----------------------------------------------------------------------------------------------------

/**
 * A package's dist-tags, or null when the registry has never heard of it. Anything else that is not an answer THROWS: "could not ask" must
 * never read as "nothing is waiting", though here the cost of that is a promotion late rather than one early.
 * @param {string} name @param {typeof fetch} [fetchImpl]
 * @returns {Promise<{ latest?: string, next?: string } | null>}
 */
export async function readDistTags(name: string, fetchImpl: typeof fetch = fetch): Promise<{ latest?: string; next?: string; } | null> {
  const response = await fetchImpl(`${REGISTRY}/${name.replace("/", "%2F")}`, { headers: { accept: "application/vnd.npm.install-v1+json" } });
  if (response.status === HTTP_NOT_FOUND) return null;
  if (!response.ok) throw new Error(`CANNOT_TELL: the registry answered ${response.status} for ${name}`);
  const tags = (await response.json())["dist-tags"];
  if (!tags || typeof tags !== "object") throw new Error(`CANNOT_TELL: the registry's answer for ${name} carries no dist-tags`);
  return tags;
}

/**
 * The packages whose `next` is strictly newer than their `latest`: published, and not yet promoted. A `next` that is not a plain
 * x.y.z THROWS, and a `next` that is not newer is none, so a version can never be promoted backwards from here.
 * @param {{ name: string, directory: string, tags: { latest?: string, next?: string } }[]} readings
 * @returns {{ name: string, directory: string, version: string, latest: string }[]}
 */
export function candidatesFrom(readings: { name: string; directory: string; tags: { latest?: string; next?: string; }; }[]): { name: string; directory: string; version: string; latest: string; }[] {
  const found = [];
  for (const { name, directory, tags } of readings) {
    if (tags.next === undefined) continue;
    const latest = floorOf(tags.latest);
    if (isNewer(tags.next, latest)) found.push({ name, directory, version: tags.next, latest });
  }
  return found;
}

// ---- item 5: the promotion's time, in the GitHub Release body, readable with no token ---------------------------------------

const PROMOTION_LINE = /^Promoted to latest: (\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z) \(qualification read on [0-9a-f]{40}\)$/m;

/** The line the workflow's record step appends to a Release's notes. @param {string} at ISO-8601 UTC, seconds and `Z` @param {string} sha */
export function promotionLine(at: string, sha: string) {
  return `Promoted to latest: ${at} (qualification read on ${sha})`;
}

/** When the dist-tag moved, from a Release's notes: what `dora` reads from the unauthenticated Releases API. null when never recorded.
 * @param {string} body */
export function promotionTimeFrom(body: string) {
  return PROMOTION_LINE.exec(body)?.[1] ?? null;
}

// ---- the command ------------------------------------------------------------------------------------------------------------

/** @param {string[]} args */
function git(args: string[]) {
  return execFileSync("git", args, { encoding: "utf8", env: sandboxGitEnv() }).trim();
}

/** @returns {{ name: string, directory: string }[]} the public packages of this tree */
function publicPackages(): { name: string; directory: string; }[] {
  return readdirSync("packages").flatMap((directory) => {
    const path = `packages/${directory}/package.json`;
    if (!existsSync(path)) return [];
    const manifest = JSON.parse(readFileSync(path, "utf8"));
    return manifest.private ? [] : [{ name: manifest.name, directory }];
  });
}

/** The main sha a version was released on top of: the parent of the commit its tag `name@version` points at. null when the tag does not exist
 * YET: the publish is on the registry and the called workflow's tag job has not cut the tag, which is a `wait` and not a fault. Every other
 * failure THROWS, so a tag that exists and cannot be read still blocks.
 * @param {string} name @param {string} version @param {(args: string[]) => string} [run] git, injectable so a test can use a repository of its own
 * @returns {string | null} */
export function releaseShaOf(name: string, version: string, run: (args: string[]) => string = git): string | null {
  const tag = `${name}@${version}`;
  if (!tagExists(tag, run)) return null;
  try {
    return run(["rev-parse", `refs/tags/${tag}^`]);
  } catch (cause) {
    throw new Error(`CANNOT_TELL: tag ${tag} exists and its release sha (the parent of the commit it names) cannot be read`, { cause });
  }
}

/** `rev-parse --verify --quiet` exits 1 and prints nothing for a ref that is not there; any other status is git failing, not the tag absent.
 * @param {string} tag @param {(args: string[]) => string} run */
function tagExists(tag: string, run: (args: string[]) => string) {
  try {
    run(["rev-parse", "--verify", "--quiet", `refs/tags/${tag}`]);
    return true;
  } catch (cause) {
    if ((cause as { status?: number }).status === 1) return false;
    throw new Error(`CANNOT_TELL: git could not say whether tag ${tag} exists`, { cause });
  }
}

/** @param {string} sha */
function minutesSince(sha: string) {
  const committed = Number(git(["show", "-s", "--format=%ct", sha]));
  return Math.round((Date.now() / MS_PER_SECOND - committed) / SECONDS_PER_MINUTE);
}

function currentRunUrl() {
  const { GITHUB_SERVER_URL: server, GITHUB_REPOSITORY: repository, GITHUB_RUN_ID: run } = process.env;
  return server && repository && run ? `${server}/${repository}/actions/runs/${run}` : undefined;
}

/** @param {Record<string, string>} values one line each: every value is single-line JSON or a space-separated list of validated specs */
function writeOutputs(values: Record<string, string>) {
  const text = Object.entries(values).map(([name, value]) => `${name}=${value}`).join("\n");
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${text}\n`);
  else console.log(text);
}

type Candidate = { name: string, directory: string, version: string, latest: string };
type Group = { sha: string, released: Released[], latest: Record<string, string | undefined> };

/**
 * The candidates grouped by the sha they were released on, and the ones that WAIT because their tag is not cut yet (`shaOf` says null).
 * @param {Candidate[]} candidates @param {(name: string, version: string) => string | null} shaOf
 * @returns {{ groups: Group[], waiting: Candidate[] }}
 */
export function groupBySha(candidates: Candidate[], shaOf: (name: string, version: string) => string | null): { groups: Group[]; waiting: Candidate[]; } {
  /** @type {Map<string, Group>} */ const bySha: Map<string, Group> = new Map();
  /** @type {Candidate[]} */ const waiting: Candidate[] = [];
  for (const candidate of candidates) {
    const sha = shaOf(candidate.name, candidate.version);
    if (sha === null) {
      waiting.push(candidate);
      continue;
    }
    const group = bySha.get(sha) ?? { sha, released: [], latest: {} };
    group.released.push({ name: candidate.name, version: candidate.version, directory: candidate.directory });
    group.latest[candidate.name] = candidate.latest;
    bySha.set(sha, group);
  }
  return { groups: [...bySha.values()], waiting };
}

/** @returns {Promise<{ groups: Group[], waiting: Candidate[] }>} */
async function candidateGroups(): Promise<{ groups: Group[]; waiting: Candidate[]; }> {
  const readings = [];
  for (const { name, directory } of publicPackages()) {
    const tags = await readDistTags(name);
    if (tags) readings.push({ name, directory, tags });
  }
  return groupBySha(candidatesFrom(readings), (name, version) => releaseShaOf(name, version));
}

/** @param {{ sha: string, released: Released[], latest: Record<string, string | undefined> }} group */
function decideGroup(group: { sha: string; released: Released[]; latest: Record<string, string | undefined>; }) {
  const result = decidePromotion({ releaseSha: group.sha, released: group.released, registryLatest: group.latest,
    history: gatherHistory(group.sha), waitedMinutes: minutesSince(group.sha), runUrl: currentRunUrl() });
  process.stdout.write(`release-promote: outcome=${result.decision.outcome} sha=${group.sha} packages=${group.released.map((r) => `${r.name}@${r.version}`).join(",")} -- ${result.decision.reason}\n`);
  for (const refused of result.refused) process.stderr.write(`::error::release-promote: ${refused.name}@${refused.version} is OLDER than latest ${refused.latest} on the registry: latest never moves backwards\n`);
  return { sha: group.sha, ...result };
}

const SPEC = /^(@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*@\d+\.\d+\.\d+$/;

async function main() {
  refuseUnknownFlags([], { entry: import.meta.url, command: "node scripts/release-promote.ts" });
  const promote = [];
  const promoted = [];
  const rows = [];
  let blocked = 0;
  const { groups, waiting } = await candidateGroups();
  // A version on `next` whose tag is not cut yet is a WAIT, and the next status or push reads it again. It is not counted in `blocked`.
  for (const candidate of waiting) process.stdout.write(`release-promote: outcome=wait packages=${candidate.name}@${candidate.version} -- published, and the tag job has not cut the tag yet\n`);
  for (const group of groups) {
    try {
      const result = decideGroup(group);
      blocked += result.refused.length > 0 ? 1 : 0;
      for (const release of result.promote) {
        promote.push(`${release.name}@${release.version}`);
        promoted.push({ tag: `${release.name}@${release.version}`, sha: group.sha });
      }
      rows.push(...result.rows);
    } catch (error) {
      blocked += 1;
      process.stderr.write(`::error::release-promote: ${group.sha}: ${error instanceof Error ? error.message : String(error)}\n`);
    }
  }
  for (const spec of promote) if (!SPEC.test(spec)) throw new Error(`CANNOT_TELL: ${spec} is not a name@x.y.z the workflow may hand to npm`);
  writeOutputs({ promote: promote.join(" "), promoted: JSON.stringify(promoted), rows: JSON.stringify(rows), blocked: String(blocked) });
  if (promote.length === 0) process.stdout.write("release-promote: nothing to promote\n");
}

// REALPATH'D, per `entry-points.test.ts` (#1086): reached through a symlink, the plain form skips main() and exits 0 silently.
if (import.meta.url === pathToFileURL(process.argv[1] ? realpathSync(process.argv[1]) : "").href) await main();
