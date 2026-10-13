/**
 * `release.yml`'s `lab-release-checks` JOB READS THE LAB'S `release-checks` RUN, AND ONLY A GREEN, DECISIVE, FRESH ONE PASSES (a11ign#5332).
 *
 * `scorer:verify` and `release:provenance` left this repository with ADR 0045 cut 9 (#5087), and the chain that named them ended in a stage that always
 * exited 1: no release shipped for two days. The job that replaced it asks GitHub for the newest decisive run of a11ign/lab's `release-checks.yml` on `main`.
 * Its step is shell, so it is RUN here: the step's own `run:` text is taken from the parsed workflow and executed under bash with `gh` replaced by a script
 * that answers from a fixture, in a git repository whose history says when the files the lab reads last changed. Every row asserts the exit code and the
 * message, so a verdict that flips shows as a failure of its own row.
 *
 * POSITIVE CONTROLS. A pass proves nothing alone, so each way to refuse is a row beside the rows that pass (the success rows exercise the same script on
 * the same fixture shape): a failure, no run, an unanswered API, a run older than the last change, and the two filters (event, `cancelled`).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { sandboxGitEnv } from "@a11ign/toolchain/lib/git-sandbox";

const REPO = fileURLToPath(new URL("../../..", import.meta.url));
const JOB = "lab-release-checks";
const EXECUTABLE = 0o755;
/** The files the lab's two checks read of this repository; the job compares a run's start with the last commit to touch one of them. */
const READ_PATH = "packages/scorer/models/screenreader-scorer/model.safetensors";
const LAST_CHANGE = "2026-10-10T12:00:00Z";

interface Run { conclusion: string; created_at: string; event?: string; head_branch?: string; id?: number; head_sha?: string }
interface Step { run?: string; name?: string }

function stepOfTheJob(): string {
  const workflow = parse(readFileSync(join(REPO, ".github/workflows/release.yml"), "utf8")) as { jobs: Record<string, { steps: Step[] }> };
  const steps = workflow.jobs[JOB]?.steps.filter((step) => step.run?.includes("release-checks.yml")) ?? [];
  assert.equal(steps.length, 1, `${JOB} has exactly one step that reads the lab's release-checks runs`);
  return steps[0].run!;
}

function inRepository(commitDate: string | null): { dir: string; bin: string } {
  const dir = mkdtempSync(join(tmpdir(), "lab-release-checks-"));
  const dated = commitDate ? { GIT_COMMITTER_DATE: commitDate, GIT_AUTHOR_DATE: commitDate } : {};
  const git = (...args: string[]) => spawnSync("git", args, { cwd: dir, encoding: "utf8", env: { ...sandboxGitEnv(), ...dated } });
  git("init", "-q", "-b", "main");
  git("config", "user.email", "t@example.invalid");
  git("config", "user.name", "t");
  const unrelated = join(dir, "README.md");
  writeFileSync(unrelated, "x\n");
  git("add", "README.md");
  git("commit", "-q", "-m", "unrelated");
  if (commitDate) {
    mkdirSync(join(dir, "packages/scorer/models/screenreader-scorer"), { recursive: true });
    writeFileSync(join(dir, READ_PATH), "w\n");
    git("add", READ_PATH);
    git("commit", "-q", "-m", "weights");
  }
  const bin = join(dir, "bin");
  mkdirSync(bin);
  return { dir, bin };
}

function verdictOf(runs: Run[] | "api-down", { lastChange = LAST_CHANGE }: { lastChange?: string | null } = {}): { code: number | null; out: string } {
  const { dir, bin } = inRepository(lastChange);
  try {
    const fixture = join(dir, "runs.json");
    const complete = runs === "api-down" ? [] : runs.map((run, i) => ({ id: i + 1, event: "push", head_branch: "main", head_sha: "a".repeat(40), html_url: `https://example.invalid/runs/${i + 1}`, ...run }));
    writeFileSync(fixture, JSON.stringify({ workflow_runs: complete }));
    const answer = runs === "api-down" ? "exit 1" : `cat "${fixture}"`;
    const gh = join(bin, "gh");
    writeFileSync(gh, `#!/bin/bash\n${answer}\n`);
    chmodSync(gh, EXECUTABLE);
    const result = spawnSync("bash", ["-c", stepOfTheJob()], {
      cwd: dir,
      encoding: "utf8",
      env: { PATH: `${bin}:${process.env.PATH}`, LAB: "a11ign/lab", GITHUB_STEP_SUMMARY: join(dir, "summary.md"), HOME: dir },
    });
    return { code: result.status, out: `${result.stdout}${result.stderr}` };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const AFTER = "2026-10-12T12:00:00Z";
const BEFORE = "2026-10-09T12:00:00Z";

test("the newest decisive run is green and started after the last change to what it reads: PASS", () => {
  const verdict = verdictOf([{ conclusion: "success", created_at: AFTER }]);
  assert.equal(verdict.code, 0, verdict.out);
  assert.match(verdict.out, /release-checks on a11ign\/lab main at a{40}: success/);
});

test("the newest decisive run is a FAILURE although an older run was green: REFUSED naming the conclusion", () => {
  const verdict = verdictOf([{ conclusion: "success", created_at: "2026-10-11T00:00:00Z" }, { conclusion: "failure", created_at: AFTER }]);
  assert.equal(verdict.code, 1);
  assert.match(verdict.out, /is failure, not success/);
});

test("a cancelled or skipped run is passed over, never read as the verdict", () => {
  const verdict = verdictOf([{ conclusion: "success", created_at: "2026-10-11T00:00:00Z" }, { conclusion: "cancelled", created_at: AFTER }, { conclusion: "skipped", created_at: AFTER }]);
  assert.equal(verdict.code, 0, verdict.out);
});

test("only push and workflow_dispatch runs on main count: a pull_request run and another branch are ignored", () => {
  const verdict = verdictOf([
    { conclusion: "success", created_at: "2026-10-11T00:00:00Z" },
    { conclusion: "failure", created_at: AFTER, event: "pull_request" },
    { conclusion: "failure", created_at: AFTER, head_branch: "somebody-elses" },
    { conclusion: "success", created_at: AFTER, event: "workflow_dispatch" },
  ]);
  assert.equal(verdict.code, 0, verdict.out);
});

test("no run at all is CANNOT_TELL, never a pass", () => {
  const verdict = verdictOf([]);
  assert.equal(verdict.code, 1);
  assert.match(verdict.out, /CANNOT_TELL: .* has no completed release-checks run/);
});

test("an API that does not answer is CANNOT_TELL, never a pass", () => {
  const verdict = verdictOf("api-down");
  assert.equal(verdict.code, 1);
  assert.match(verdict.out, /CANNOT_TELL: the API did not answer/);
});

test("a green run that STARTED BEFORE the last change to the weights is CANNOT_TELL and names the remedy", () => {
  const verdict = verdictOf([{ conclusion: "success", created_at: BEFORE }]);
  assert.equal(verdict.code, 1);
  assert.match(verdict.out, /CANNOT_TELL: .*predates the last change to what it reads/);
  assert.match(verdict.out, /workflow_dispatch/);
});

test("with no commit ever touching what the lab reads, any green run is new enough (the bound is 0, not an error)", () => {
  const verdict = verdictOf([{ conclusion: "success", created_at: BEFORE }], { lastChange: null });
  assert.equal(verdict.code, 0, verdict.out);
});
