// no-token: gh -- every test below reads files in this checkout and calls a pure decider; nothing reaches GitHub.
/**
 * THE OUTSIDE REPOSITORY'S PIN REFRESHES ITSELF ON EACH RELEASE (#4359, found by #4349).
 *
 * Three releases in a row left the outsider run red until a person regenerated the pin, because Dependabot never opened a pin pull request.
 * `release.yml`'s `refresh-outsider-pin` job now writes it. Three things have to stay true, and each is pinned here:
 *
 *   1. THE DECISION (`refresh-pin.ts`): write a differing file, leave an equal one, and never move the pin to an older release.
 *   2. THE JOB mints for the repository `repository.json` names, with the identity whose policy this repository keeps, `needs` the promotion,
 *      and holds no `contents: write` of its own (the write is the minted token's).
 *   3. THE POLICY grants the two permissions the write needs, to the same workflow-on-`main` that `promote-action-tag` binds, and is NOT in
 *      `.github/chainguard/`, where Octo STS would read it as a policy for this repository.
 *
 * The whole chain is hand-observed on the first release after merge (the row's Acceptance); until then these tests are all that pins it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parse as parseYaml } from "yaml";
import { refreshDecision, pinnedVersion, WRITE, CURRENT, NEWER } from "../../../scripts/outsider/refresh-pin.ts";

const REPO = fileURLToPath(new URL("../../..", import.meta.url));
const read = (path: string) => readFileSync(`${REPO}${path}`, "utf8");

const { generateOutsiderJob } = await import("../../../scripts/outsider/generate.ts");

const readme = read("README.md");
const SHA_OLD = "bc2103de99d8f6aa5ab1f505ef3482143bb5c194";
const SHA_NEW = "d92e97384b11edb7bf1cdfcf150394af46a9a2f6";
const jobAt = (sha: string, version: string): string => generateOutsiderJob(readme, sha, version);

test("a file pinned to an older release is WRITTEN, and the pin it names is read from the `# v` comment", () => {
  const decision = refreshDecision({ currentText: jobAt(SHA_OLD, "0.5.0"), generatedText: jobAt(SHA_NEW, "0.5.1"), version: "0.5.1" });
  assert.equal(decision.action, WRITE);
  assert.equal(pinnedVersion(jobAt(SHA_OLD, "0.5.0")), "0.5.0");
});

test("a file that already equals the generated one is CURRENT: a re-run of the release step commits nothing", () => {
  const same = jobAt(SHA_NEW, "0.5.1");
  assert.equal(refreshDecision({ currentText: same, generatedText: same, version: "0.5.1" }).action, CURRENT);
});

test("the pin never moves backwards: a re-run of an older promotion against a newer pin is NEWER, and compares numerically (0.10.0 > 0.9.0)", () => {
  const older = refreshDecision({ currentText: jobAt(SHA_NEW, "0.5.1"), generatedText: jobAt(SHA_OLD, "0.5.0"), version: "0.5.0" });
  assert.equal(older.action, NEWER);
  const numeric = refreshDecision({ currentText: jobAt(SHA_NEW, "0.10.0"), generatedText: jobAt(SHA_OLD, "0.9.0"), version: "0.9.0" });
  assert.equal(numeric.action, NEWER, "a string comparison would put 0.10.0 before 0.9.0 and move the pin backwards");
});

test("a pin that names no release is rewritten rather than left: not being able to read it is not a reason to leave it", () => {
  const unversioned = generateOutsiderJob(readme, SHA_OLD, undefined);
  assert.equal(pinnedVersion(unversioned), undefined, "the control needs a pin with no `# v` comment");
  assert.equal(refreshDecision({ currentText: unversioned, generatedText: jobAt(SHA_NEW, "0.5.1"), version: "0.5.1" }).action, WRITE);
});

test("a version that is not x.y.z is refused, not decided", () => {
  assert.throws(() => refreshDecision({ currentText: "a", generatedText: "b", version: "latest" }), /not an x\.y\.z/);
});

type Step = { id?: string; uses?: string; with?: Record<string, string>; env?: Record<string, string>; run?: string };
type Job = { if?: string; needs?: string[]; outputs?: Record<string, string>; permissions?: Record<string, string>; steps?: Step[] };
const release = parseYaml(read(".github/workflows/release.yml")) as { jobs: Record<string, Job> };
const refresh = release.jobs["refresh-outsider-pin"];
const mint = refresh?.steps?.find((step) => step.uses?.startsWith("octo-sts/action@"));
const policy = parseYaml(read("scripts/outsider/outsider-pin-write.sts.yaml")) as {
  subject: string;
  claim_pattern: Record<string, string>;
  permissions: Record<string, string>;
};
const promoteTagPolicy = parseYaml(read(".github/chainguard/promote-action-tag.sts.yaml")) as typeof policy;

const decide = release.jobs["decide-outsider-pin"];

test("both jobs exist, in order, and only the minting one holds id-token (positive control for every job assertion below)", () => {
  assert.ok(decide, "release.yml has no decide-outsider-pin job");
  assert.ok(refresh, "release.yml has no refresh-outsider-pin job");
  assert.deepEqual(decide.needs, ["promote"]);
  assert.deepEqual(refresh.needs, ["decide-outsider-pin"]);
  assert.deepEqual(decide.permissions, { contents: "read" }, "the job that runs repository code holds no id-token");
  assert.deepEqual(refresh.permissions, { contents: "read", "id-token": "write" });
  assert.ok(mint, "the job has no octo-sts/action step: the token would be GITHUB_TOKEN, which cannot write .github/workflows");
});

test("THE JOB HOLDING id-token RUNS NO REPOSITORY CODE: no checkout, no install, no node, no pnpm (ceo, the review of #4365)", () => {
  const steps = refresh.steps ?? [];
  assert.ok(steps.length > 0);
  const uses = steps.map((step) => step.uses ?? "");
  assert.deepEqual(uses.filter((u) => u !== "" && !u.startsWith("octo-sts/action@")), [], "the only action the minting job uses is the mint");
  const scripts = steps.map((step) => step.run ?? "").join("\n");
  assert.doesNotMatch(scripts, /\b(pnpm|npm|npx|node|tsx|yarn)\b|scripts\//, "a run step of the minting job reaches repository code or a package manager");
  assert.match(scripts, /gh api -X PUT/, "positive control: the scan reads the step that writes");
  // The control the scan must not miss: the deciding job DOES run them.
  const decideText = JSON.stringify(decide.steps);
  assert.match(decideText, /actions\/checkout/);
  assert.match(decideText, /pnpm install/);
});

test("it mints for the repository repository.json names, under the identity this repository keeps a policy for", () => {
  const { repository } = JSON.parse(read("scripts/outsider/repository.json")) as { repository: string };
  assert.equal(mint?.with?.scope, repository);
  assert.equal(mint?.with?.identity, "outsider-pin-write");
  assert.ok(existsSync(`${REPO}scripts/outsider/${mint?.with?.identity}.sts.yaml`), "the identity has no policy source beside the generator");
  const write = refresh.steps?.find((step) => step.env?.OUTSIDE !== undefined);
  assert.equal(write?.env?.OUTSIDE, repository, "the step writes a repository other than the one the token was minted for");
  assert.equal(write?.env?.GH_TOKEN, `\${{ steps.${mint?.id}.outputs.token }}`);
});

test("the write step refuses an empty token, shape-checks what the deciding job handed over, and reads its own write back", () => {
  const script = refresh.steps?.find((step) => step.run?.includes("gh api -X PUT"))?.run ?? "";
  assert.match(script, /\[ -n "\$\{GH_TOKEN:-\}" \]/);
  assert.match(script, /\[0-9a-f\]\{40\}/, "the sha handed over is shape-checked");
  assert.match(script, /grep -qx -- " {6}- uses: a11ign\/a11ign@\$TAG_SHA # v\$VERSION"/, "the file is checked to pin what it was told");
  assert.match(script, /cmp - "\$scratch\/generated\.yml"/);
  const generate = decide.steps?.find((step) => step.run?.includes("generate.ts"))?.run ?? "";
  assert.match(generate, /--sha="\$tag_sha" --version="\$version"/);
  assert.deepEqual(Object.keys(decide.outputs ?? {}).sort(), ["action", "generated", "tag_sha", "version"]);
});

test("the policy grants exactly contents + workflows, to the same workflow-on-main that promote-action-tag binds", () => {
  assert.deepEqual(policy.permissions, { contents: "write", workflows: "write" });
  assert.equal(policy.subject, promoteTagPolicy.subject);
  assert.deepEqual(policy.claim_pattern, promoteTagPolicy.claim_pattern);
  assert.match(policy.claim_pattern.job_workflow_ref, /release\\\.yml@refs\/heads\/main$/);
});

test("the policy source is NOT in .github/chainguard/, where Octo STS would read it as a policy for this repository", () => {
  assert.equal(existsSync(`${REPO}.github/chainguard/outsider-pin-write.sts.yaml`), false);
});

test("BOTH jobs are SKIPPED, not red, until OUTSIDER_PIN_REFRESH is set to 1 at install -- and keep their own conditions", () => {
  for (const [name, job] of [["decide-outsider-pin", decide], ["refresh-outsider-pin", refresh]] as const) {
    const condition = job.if ?? "";
    assert.match(condition, /vars\.OUTSIDER_PIN_REFRESH == '1'/, `${name}: without the variable gate the job mints, is refused, and turns every release red`);
    assert.match(condition, /!cancelled\(\)/, name);
  }
  assert.match(decide.if ?? "", /needs\.promote\.result == 'success'/, "the gate must narrow the promotion condition, not replace it");
  assert.match(refresh.if ?? "", /needs\.decide-outsider-pin\.outputs\.action == 'write'/, "the minting job runs only when a write was decided");
  assert.doesNotMatch(promoteTagPolicyJobIf(), /OUTSIDER_PIN_REFRESH/, "positive control: the variable gates the outsider jobs only, not the tag move");
});

function promoteTagPolicyJobIf(): string {
  return (release.jobs["promote-action-tag"] as Job).if ?? "";
}
