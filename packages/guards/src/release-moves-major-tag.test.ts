/**
 * THE ACTION'S MAJOR TAG MOVES ONLY TO A VERSION THE PROMOTION HAS QUALIFIED, AND NEVER ON A `next` PUBLISH
 * (#3948, outcome 3 of #3911, design item 4; the promotion itself is #3947).
 *
 * A user of the Action writes `uses: a11ign/a11ign@<ref>`. A moving `v0` follows `latest`, so a fix reaches that user once the fleet's
 * qualification has passed and not before. Two halves, as `release-promotes-by-evidence.test.ts`:
 *
 * 1. THE WORKFLOW, parsed: the job that writes the tag `needs` the promotion job, holds `contents: write` and nothing else (no `id-token`:
 *    the npm token stays in the promotion job), and writes no ref but the major tag and the CREATION of the exact `v<version>` tag (#4058).
 * 2. THE STEP, run: the job's own script is extracted from the parsed YAML and executed under `bash` against a stub `git` and a stub `gh`,
 *    so what the tag does on a first move, a re-run, an older version, a tag it cannot account for and a registry it cannot read is
 *    OBSERVED, not read off the text. Nothing here reaches the network.
 *
 * ## Positive controls for the refusals
 *
 * "It does not move the tag backwards" is true of a job that never moves it. So the table has the rows that MUST move it, and
 * `scenarioFaults` is run against a script that always moves (refused by the older, equal, unaccounted and unreadable rows) and one that never
 * moves (refused by the moving rows). `workflowFaults` is run against four mutants of the real workflow: no `needs` edge, `id-token: write`,
 * a deletion of a per-version tag, a write that names a per-version tag, and a MOVE of the exact `v<version>` tag.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const REPO = fileURLToPath(new URL("../../..", import.meta.url));
const WORKFLOW = join(REPO, ".github/workflows/release.yml");

interface Step { id?: string; name?: string; run?: string; uses?: string; env?: Record<string, string> }
interface Job { needs?: string | string[]; if?: string; permissions?: Record<string, string>; steps?: Step[]; uses?: string }
interface Workflow { jobs: Record<string, Job> }

const load = (): Workflow => parse(readFileSync(WORKFLOW, "utf8")) as Workflow;
const needsOf = (job: Job): string[] => ([] as string[]).concat(job.needs ?? []);
const text = (value: unknown): string => JSON.stringify(value);

const PROMOTION_MARK = /dist-tag add/;
const TAG_WRITE_MARK = /refs\/tags\/v/;

// ---- the workflow, parsed ----------------------------------------------------------------------------------------------------

/** What the workflow must be, for ANY workflow handed in. Returns the faults; empty is a pass. */
function workflowFaults(workflow: Workflow): string[] {
  const jobs = Object.entries(workflow.jobs);
  const promotion = jobs.filter(([, job]) => PROMOTION_MARK.test(text(job)));
  if (promotion.length !== 1) return [`expected exactly one job running \`npm dist-tag add\`, found ${promotion.length}`];
  const [promotionName] = promotion[0];
  const tagJobs = jobs.filter(([name, job]) => name !== promotionName && TAG_WRITE_MARK.test(text(job)));
  if (tagJobs.length !== 1) return [`expected exactly one job writing a \`refs/tags/v\` ref, found ${tagJobs.length}`];
  const [, tagJob] = tagJobs[0];
  const faults: string[] = [];
  if (!needsOf(tagJob).includes(promotionName)) faults.push(`the tag job does not \`needs\` the promotion job (${promotionName})`);
  if (JSON.stringify(tagJob.permissions) !== JSON.stringify({ contents: "write" })) faults.push(`the tag job's permissions are ${text(tagJob.permissions)}, not \`contents: write\` alone`);
  if (/\buses:\s*actions\/checkout/.test(text(tagJob.steps?.map((s) => s.uses)))) faults.push("the tag job checks the repository out: it runs no repository code");
  faults.push(...tagWriteFaults(scriptOf(tagJob)));
  return faults;
}

/** Every command that writes a ref must name the major tag, or CREATE (POST) the exact `v<version>` tag: a per-version tag is never moved. */
function tagWriteFaults(script: string): string[] {
  const faults: string[] = [];
  if (/--delete|-X\s*DELETE|--method\s*DELETE|git push|git tag\b|update-ref/.test(script)) faults.push("the tag job deletes, pushes or tags by another route than the one write");
  const joined = script.replace(/\\\n\s*/g, " ");
  const writes = [...joined.matchAll(/gh api[^\n]*git\/refs[^\n]*/g)].map((m) => m[0]);
  if (writes.length === 0) faults.push("the tag job has no `gh api … git/refs` write");
  const createsVersionTag = (write: string) => /-X\s*POST/.test(write) && /refs\/tags\/\$\{?version_tag\}?/.test(write);
  for (const write of writes) if (!/refs\/tags\/\$\{?major_tag\}?/.test(write) && !createsVersionTag(write)) faults.push(`a ref write that does not name $major_tag: ${write.trim()}`);
  if (!writes.some(createsVersionTag)) faults.push("the tag job never creates the exact v<version> tag (#4058)");
  if (!/version_tag="v\$version"/.test(script)) faults.push("the exact tag is not derived as v<version> of the promoted version");
  if (!/major_tag="v\$\{version%%\.\*\}"/.test(script)) faults.push("the major tag is not derived as v<major> of the promoted version");
  return faults;
}

function scriptOf(job: Job): string {
  return (job.steps ?? []).filter((s) => /git ls-remote/.test(s.run ?? "")).map((s) => s.run).join("\n");
}

/** A copy of the real workflow with one thing changed in the tag job. */
function mutated(change: (job: Job, script: string) => void): Workflow {
  const workflow = load();
  const [, job] = Object.entries(workflow.jobs).find(([name, j]) => TAG_WRITE_MARK.test(text(j)) && !PROMOTION_MARK.test(text(j)) && name !== "release")!;
  change(job, scriptOf(job));
  return workflow;
}

const withScript = (job: Job, edit: (script: string) => string) => {
  const step = job.steps!.find((s) => /git ls-remote/.test(s.run ?? ""))!;
  step.run = edit(step.run!);
};

test("the workflow: a job that `needs` the promotion job writes the major tag with `contents: write` alone", () => {
  assert.deepEqual(workflowFaults(load()), []);
});

test("positive control: the real tag job is found, so the empty fault list above is not a search that found nothing", () => {
  const workflow = load();
  const found = Object.entries(workflow.jobs).filter(([name, job]) => TAG_WRITE_MARK.test(text(job)) && name !== "release");
  assert.equal(found.length, 1);
  assert.deepEqual(needsOf(found[0][1]).length, 1);
  assert.ok(Object.entries(workflow.jobs).some(([, job]) => PROMOTION_MARK.test(text(job))));
});

test("a tag job that does not `needs` the promotion job is refused", () => {
  const faults = workflowFaults(mutated((job) => { job.needs = ["release"]; }));
  assert.ok(faults.some((f) => /does not `needs` the promotion job/.test(f)), faults.join("; "));
});

test("a tag job holding `id-token: write` is refused", () => {
  const faults = workflowFaults(mutated((job) => { job.permissions = { contents: "write", "id-token": "write" }; }));
  assert.ok(faults.some((f) => /not `contents: write` alone/.test(f)), faults.join("; "));
});

test("a tag job that deletes a per-version tag is refused", () => {
  const faults = workflowFaults(mutated((job) => withScript(job, (s) => `${s}\ngh api -X DELETE "repos/$GH_REPO/git/refs/tags/a11ign@$version"\n`)));
  assert.ok(faults.some((f) => /deletes, pushes or tags/.test(f)), faults.join("; "));
});

test("a tag job that writes a per-version tag is refused", () => {
  const faults = workflowFaults(mutated((job) => withScript(job, (s) => `${s}\ngh api -X PATCH "repos/$GH_REPO/git/refs/tags/v$version" -f sha="$new" -F force=true\n`)));
  assert.ok(faults.some((f) => /does not name \$major_tag/.test(f)), faults.join("; "));
});

test("a tag job that MOVES the exact v<version> tag is refused", () => {
  const faults = workflowFaults(mutated((job) => withScript(job, (s) => `${s}\ngh api -X PATCH "repos/$GH_REPO/git/refs/tags/$version_tag" -f sha="$new" -F force=true\n`)));
  assert.ok(faults.some((f) => /does not name \$major_tag/.test(f)), faults.join("; "));
});

test("a tag job that never creates the exact v<version> tag is refused", () => {
  const faults = workflowFaults(mutated((job) => withScript(job, (s) => s.replace(/-f ref="refs\/tags\/\$version_tag"/, '-f ref="refs/tags/$major_tag"'))));
  assert.ok(faults.some((f) => /never creates the exact v<version> tag/.test(f)), faults.join("; "));
});

test("the tag job is NOT started by a `next` publish: it follows the promotion's own success, and reads what the promotion moved", () => {
  const [, job] = Object.entries(load().jobs).find(([name, j]) => TAG_WRITE_MARK.test(text(j)) && name !== "release")!;
  assert.match(job.if ?? "", /needs\.promote\.result == 'success'/);
  assert.match(text(job.steps), /needs\.promote\.outputs\.promoted/);
  assert.doesNotMatch(text(job.steps), /needs\.release\./);
});

// ---- the step, run ------------------------------------------------------------------------------------------------------------

const C = (n: number) => String(n).repeat(40).slice(0, 40);
const [C1, C2, C3, OTHER] = [C(1), C(2), C(3), C(9)];
const line = (sha: string, ref: string) => `${sha}\trefs/tags/${ref}`;

interface Scenario {
  name: string;
  remote: string[];
  promoted: { tag: string; sha: string }[];
  lsRemoteFails?: boolean;
  /** The one write the step must make: `create` or `move` of this tag to this commit; none when absent. */
  writes?: { kind: "create" | "move"; tag: string; sha: string };
  /** The exact `v<version>` tag the step must CREATE (#4058), never move; none when it is present or the step stops before it. */
  versionTag?: { tag: string; sha: string };
  exits: "ok" | "fail";
  says: RegExp;
}

const SCENARIOS: Scenario[] = [
  { name: "the first move: `v0` is absent, read from ls-remote, and is created at the promoted version's tag",
    remote: [line(C1, "a11ign@0.1.0"), line(C2, "a11ign@0.2.0")], promoted: [{ tag: "a11ign@0.2.0", sha: OTHER }],
    writes: { kind: "create", tag: "v0", sha: C2 }, versionTag: { tag: "v0.2.0", sha: C2 }, exits: "ok", says: /v0: was absent, now C2 for 0\.2\.0/ },
  { name: "a newer version: `v0` follows 0.1.0 and moves to 0.2.0, naming the old target, the new one and the version",
    remote: [line(C1, "a11ign@0.1.0"), line(C2, "a11ign@0.2.0"), line(C1, "v0")], promoted: [{ tag: "a11ign@0.2.0", sha: OTHER }],
    writes: { kind: "move", tag: "v0", sha: C2 }, versionTag: { tag: "v0.2.0", sha: C2 }, exits: "ok", says: /v0: was C1.* now C2 for 0\.2\.0/ },
  { name: "an ANNOTATED per-version tag is read through its peeled commit, not the tag object",
    remote: [line(OTHER, "a11ign@0.2.0"), line(C2, "a11ign@0.2.0^{}"), line(C1, "v0"), line(C1, "a11ign@0.1.0")], promoted: [{ tag: "a11ign@0.2.0", sha: OTHER }],
    writes: { kind: "move", tag: "v0", sha: C2 }, versionTag: { tag: "v0.2.0", sha: C2 }, exits: "ok", says: /now C2/ },
  { name: "ten is newer than nine: the order is by version, not by text",
    remote: [line(C1, "a11ign@0.9.0"), line(C2, "a11ign@0.10.0"), line(C1, "v0")], promoted: [{ tag: "a11ign@0.10.0", sha: OTHER }],
    writes: { kind: "move", tag: "v0", sha: C2 }, versionTag: { tag: "v0.10.0", sha: C2 }, exits: "ok", says: /for 0\.10\.0/ },
  { name: "a re-run: `v0` is already at the version's commit, so nothing is written and the log says so",
    remote: [line(C2, "a11ign@0.2.0"), line(C2, "v0.2.0"), line(C2, "v0")], promoted: [{ tag: "a11ign@0.2.0", sha: OTHER }],
    exits: "ok", says: /already at C2/ },
  { name: "a re-run before `v0` moved: `v0.2.0` is present at the commit, so it is left and only `v0` moves",
    remote: [line(C1, "a11ign@0.1.0"), line(C2, "a11ign@0.2.0"), line(C2, "v0.2.0"), line(C1, "v0")], promoted: [{ tag: "a11ign@0.2.0", sha: OTHER }],
    writes: { kind: "move", tag: "v0", sha: C2 }, exits: "ok", says: /v0\.2\.0: already at C2; left/ },
  { name: "`v0.2.0` exists at ANOTHER commit: CANNOT_TELL, red, and neither it nor `v0` is written",
    remote: [line(C1, "a11ign@0.1.0"), line(C2, "a11ign@0.2.0"), line(C3, "v0.2.0"), line(C1, "v0")], promoted: [{ tag: "a11ign@0.2.0", sha: OTHER }],
    exits: "fail", says: /CANNOT_TELL.*v0\.2\.0.*never moved/ },
  { name: "an OLDER version than the one `v0` follows is left, and the log says it never moves backwards",
    remote: [line(C1, "a11ign@0.2.0"), line(C3, "a11ign@0.3.0"), line(C3, "v0")], promoted: [{ tag: "a11ign@0.2.0", sha: OTHER }],
    versionTag: { tag: "v0.2.0", sha: C1 }, exits: "ok", says: /never moves backwards.*0\.2\.0.*0\.3\.0/ },
  { name: "`v0` points at a commit no version tag names: CANNOT_TELL, red, nothing moved",
    remote: [line(C2, "a11ign@0.2.0"), line(C3, "v0")], promoted: [{ tag: "a11ign@0.2.0", sha: OTHER }],
    versionTag: { tag: "v0.2.0", sha: C2 }, exits: "fail", says: /CANNOT_TELL.*v0/ },
  { name: "the promoted version has no tag yet: CANNOT_TELL, red, nothing moved",
    remote: [line(C1, "a11ign@0.1.0"), line(C1, "v0")], promoted: [{ tag: "a11ign@0.2.0", sha: OTHER }],
    exits: "fail", says: /CANNOT_TELL.*a11ign@0\.2\.0/ },
  { name: "the tags cannot be listed: CANNOT_TELL, red, and an absent tag is not assumed",
    remote: [], promoted: [{ tag: "a11ign@0.2.0", sha: OTHER }], lsRemoteFails: true,
    exits: "fail", says: /CANNOT_TELL/ },
  { name: "only a package other than the Action was promoted: the major tag stays, and the log says why",
    remote: [line(C2, "@a11ign/evidence@0.3.0"), line(C1, "v0"), line(C1, "a11ign@0.1.0")], promoted: [{ tag: "@a11ign/evidence@0.3.0", sha: OTHER }],
    exits: "ok", says: /no version of the Action was promoted/ },
  { name: "nothing was promoted: the major tag stays",
    remote: [line(C1, "v0"), line(C1, "a11ign@0.1.0")], promoted: [],
    exits: "ok", says: /no version of the Action was promoted/ },
  { name: "a 1.x version moves `v1` and never `v0`",
    remote: [line(C1, "a11ign@0.9.0"), line(C1, "v0"), line(C2, "a11ign@1.0.0")], promoted: [{ tag: "a11ign@1.0.0", sha: OTHER }],
    writes: { kind: "create", tag: "v1", sha: C2 }, versionTag: { tag: "v1.0.0", sha: C2 }, exits: "ok", says: /v1: was absent/ },
];

interface Ran { code: number; out: string; calls: string[] }

/** Runs a step script under bash with `git` and `gh` replaced by stubs that answer from the scenario and record what was asked. */
function run(script: string, scenario: Scenario): Ran {
  const dir = mkdtempSync(join(tmpdir(), "major-tag-"));
  try {
    const bin = join(dir, "bin");
    const remote = join(dir, "remote.txt");
    const calls = join(dir, "calls.txt");
    writeFileSync(remote, scenario.remote.join("\n") + (scenario.remote.length ? "\n" : ""));
    writeFileSync(calls, "");
    spawnSync("mkdir", ["-p", bin]);
    stub(join(bin, "git"), GIT_STUB);
    stub(join(bin, "gh"), `#!/usr/bin/env bash\nprintf '%s\\n' "$*" >> "$CALLS"\n`);
    const result = spawnSync("bash", ["-c", script], {
      encoding: "utf8",
      env: {
        PATH: `${bin}:${process.env.PATH}`, HOME: dir, REMOTE: remote, CALLS: calls, LS_REMOTE_FAILS: scenario.lsRemoteFails ? "1" : "",
        GITHUB_SERVER_URL: "https://github.com", GH_REPO: "a11ign/a11ign", GH_TOKEN: "stub", PROMOTED: JSON.stringify(scenario.promoted),
      },
    });
    const recorded = readFileSync(calls, "utf8").split("\n").filter(Boolean);
    return { code: result.status ?? -1, out: `${result.stdout}${result.stderr}`.replace(new RegExp(C1, "g"), "C1").replace(new RegExp(C2, "g"), "C2").replace(new RegExp(C3, "g"), "C3"), calls: recorded };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const stub = (path: string, body: string) => { writeFileSync(path, body); chmodSync(path, 0o755); };

/** `git ls-remote --tags <url> <pattern>...`: the fixture's lines whose ref matches a pattern, the way git matches them (a glob on the full ref). */
const GIT_STUB = `#!/usr/bin/env bash
[ "$1" = ls-remote ] || { echo "stub git: unexpected $*" >&2; exit 99; }
[ -z "$LS_REMOTE_FAILS" ] || { echo "fatal: unable to access" >&2; exit 128; }
shift; [ "$1" = --tags ] && shift; shift
while IFS=$'\\t' read -r sha ref; do
  bare="\${ref%^{\\}}"
  for pattern in "$@"; do
    # shellcheck disable=SC2053
    if [[ "$bare" == $pattern ]]; then printf '%s\\t%s\\n' "$sha" "$ref"; break; fi
  done
done < "$REMOTE"
`;

/** What each scenario demands of ANY implementation of the step. Returns the names of the scenarios it refuses. */
function scenarioFaults(script: string): string[] {
  const refused: string[] = [];
  for (const scenario of SCENARIOS) {
    const got = run(script, scenario);
    if (judge(scenario, got).length > 0) refused.push(scenario.name);
  }
  return refused;
}

/** The exact `v<version>` tag is CREATED (POST) at the commit of `a11ign@<version>` when the scenario says so, and is otherwise not written at all. */
function versionTagFaults(scenario: Scenario, written: string[]): string[] {
  const want = scenario.versionTag;
  if (!want) return written.length > 0 ? [`wrote a v<version> tag when it must not: ${written.join(" | ")}`] : [];
  if (written.length !== 1) return [`wanted exactly one v<version> write, saw ${written.length}: ${written.join(" | ")}`];
  const [write] = written;
  return [
    ...(/-X POST/.test(write) ? [] : [`a v<version> tag is created, never moved: ${write}`]),
    ...(write.includes(`refs/tags/${want.tag} `) && write.includes(want.sha) ? [] : [`wrong v<version> tag or commit: ${write}`]),
  ];
}

function judge(scenario: Scenario, got: Ran): string[] {
  const faults: string[] = [];
  if ((got.code === 0) !== (scenario.exits === "ok")) faults.push(`exit ${got.code}, wanted ${scenario.exits}`);
  if (!scenario.says.test(got.out)) faults.push(`the log does not say ${scenario.says}: ${got.out}`);
  const refWrites = got.calls.filter((c) => /git\/refs/.test(c));
  const isVersionTag = (c: string) => /ref=refs\/tags\/v\d+\.\d+\.\d+(\s|$)/.test(c);
  faults.push(...versionTagFaults(scenario, refWrites.filter(isVersionTag)));
  const writes = refWrites.filter((c) => !isVersionTag(c));
  if (!scenario.writes) {
    if (writes.length > 0) faults.push(`wrote when it must not: ${writes.join(" | ")}`);
    return faults;
  }
  if (writes.length !== 1) return [...faults, `wanted exactly one write, saw ${writes.length}: ${writes.join(" | ")}`];
  const [write] = writes;
  const method = scenario.writes.kind === "create" ? /-X POST/ : /-X PATCH/;
  if (!method.test(write)) faults.push(`wrong method for a ${scenario.writes.kind}: ${write}`);
  if (!write.includes(scenario.writes.sha)) faults.push(`wrong commit: ${write}`);
  if (!write.includes(`refs/tags/${scenario.writes.tag}`)) faults.push(`wrong tag: ${write}`);
  if (scenario.writes.kind === "move" && !/force=true/.test(write)) faults.push(`a move to a detached release commit needs force: ${write}`);
  return faults;
}

/** Empty when the tag job is absent, so a missing job is a failed assertion and not a crash at import. */
const REAL_SCRIPT = (() => {
  const found = Object.entries(load().jobs).find(([name, j]) => TAG_WRITE_MARK.test(text(j)) && name !== "release");
  return found ? scriptOf(found[1]) : "";
})();

for (const scenario of SCENARIOS) {
  test(`the step, run: ${scenario.name}`, () => {
    assert.deepEqual(judge(scenario, run(REAL_SCRIPT, scenario)), []);
  });
}

test("positive control: the table has rows that move the tag, rows that must not, and rows that must fail", () => {
  assert.ok(SCENARIOS.filter((s) => s.writes).length >= 4);
  assert.ok(SCENARIOS.filter((s) => !s.writes && s.exits === "ok").length >= 3);
  assert.ok(SCENARIOS.filter((s) => s.exits === "fail").length >= 3);
  assert.deepEqual(scenarioFaults(REAL_SCRIPT), []);
});

/** A step that moves `v<major>` to the promoted version's commit on EVERY input, ignoring what it read. */
const ALWAYS_MOVES = `
set -euo pipefail
version=$(jq -r '[.[] | .tag | select(startswith("a11ign@")) | ltrimstr("a11ign@")] | last // "0.0.0"' <<<"$PROMOTED")
major_tag="v\${version%%.*}"
new=$(git ls-remote --tags "$GITHUB_SERVER_URL/$GH_REPO" "refs/tags/a11ign@$version" | cut -f1 | tail -n1)
gh api -X PATCH "repos/$GH_REPO/git/refs/tags/$major_tag" -f sha="$new" -F force=true
echo "v0: was ?, now $new for $version"
`;

const NEVER_MOVES = `echo "no version of the Action was promoted"`;

test("a step that moves on EVERY input is refused by the older, equal, unaccounted, unreadable and not-the-Action rows", () => {
  const refused = scenarioFaults(ALWAYS_MOVES);
  for (const name of [
    "a re-run", "an OLDER version", "`v0` points at a commit no version tag names", "the tags cannot be listed", "only a package other than the Action",
    "nothing was promoted",
  ]) assert.ok(refused.some((r) => r.includes(name)), `${name} was not refused: ${refused.join(" | ")}`);
});

test("a step that never moves is refused by exactly the rows that must move the tag", () => {
  const refused = scenarioFaults(NEVER_MOVES);
  for (const scenario of SCENARIOS.filter((s) => s.writes)) assert.ok(refused.includes(scenario.name), `${scenario.name} was not refused`);
});
