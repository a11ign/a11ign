// no-token: none -- the step runs behind a fake `gh` put first on PATH, with a made-up token; nothing reaches GitHub.
/**
 * `.github/workflows/dependency-pr-body.yml` writes the body `acceptance` and the `Closes` check read onto a Dependabot pull request.
 * This runs THE STEP'S SHELL, taken out of the parsed workflow and never retyped here, against a stub `gh` that serves a made-up file
 * list (with each file's `patch`, as the files API returns it) and records the one PATCH the step may make.
 *
 * A11-269: a GROUPED title ("deps: bump the pip-minor-and-patch group across 2 directories with 3 updates") names no package and no
 * version, and its files are pip requirement files, so the step used to write nothing and `acceptance` printed `ACCEPTANCE: MISSING`.
 * What has to hold for a group, as it already does for one update:
 *   1. a group of minor and patch pins over the requirements files gets the fixed fragment, naming each update;
 *   2. it is checked UPDATE BY UPDATE from the diff, so one major (a `0.x` minor counts) among minors writes nothing;
 *   3. a file outside the manifests, an owned path, or a diff it cannot read pin by pin writes nothing;
 *   4. the step checks nothing out and never reads the pull request's body.
 *
 * POSITIVE CONTROLS: each refusal below is the same pull request as the accepted group with ONE thing changed, and the single-package
 * cases that held before the group existed are run here too, so a step that writes nothing at all fails the first test.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

const REPO = fileURLToPath(new URL("../../../", import.meta.url));
const WORKFLOW_TEXT = readFileSync(join(REPO, ".github/workflows/dependency-pr-body.yml"), "utf8");
type Step = { name?: string; uses?: string; run?: string; env?: Record<string, string> };
const WORKFLOW = parseYaml(WORKFLOW_TEXT) as { jobs: Record<string, { steps: Step[] }> };
const STEPS = Object.values(WORKFLOW.jobs).flatMap((job) => job.steps);
const WRITER = STEPS.find((step) => step.env?.PR_TITLE !== undefined)?.run;

const GROUP_TITLE = "deps: bump the pip-minor-and-patch group across 2 directories with 3 updates";
const EXECUTABLE = 0o755;

type ChangedFile = { filename: string; patch?: string | null };

/** A hunk the way the files API prints it: header, context, then the `-` and `+` lines of each pin that moved. */
const patchOf = (...moves: [string, string][]) =>
  `@@ -1,4 +1,4 @@\n # comment\n${moves.map(([from, to]) => `-${from}\n+${to}`).join("\n")}\n pytest`;

const CI_FILE: ChangedFile = { filename: "requirements-ci.txt", patch: patchOf(["numpy==2.5.1", "numpy==2.5.4"]) };
const SCORER_FILE: ChangedFile = {
  filename: "packages/scorer/requirements.txt",
  patch: patchOf(["numpy==2.5.1", "numpy==2.5.4"], ["onnxruntime==1.28.0", "onnxruntime==1.28.2"], ["torch==2.13.0", "torch==2.13.1"]),
};
const GROUP_FILES = [CI_FILE, SCORER_FILE];

/** The stub answers the three reads the step makes and records the PATCH, whose body file it copies where the test can read it. */
const GH = `#!/bin/bash
case "$*" in
  *"--method PATCH"*) for arg in "$@"; do case "$arg" in body=@*) cp "\${arg#body=@}" "$WRITTEN_BODY";; esac; done
    echo "token=$GH_TOKEN" > "$WRITTEN_TOKEN" ;;
  *"/files"*) cat "$FILES_JSON" ;;
  *"owned-path-facts.json"*) printf '%s' "$OWNED" ;;
  *) echo "unexpected gh call: $*" >&2; exit 1 ;;
esac
`;

type Run = { code: number | null; out: string; body: string | null; token: string | null };

function runWriter(options: { title: string; files: ChangedFile[]; owned?: string[] }): Run {
  assert.ok(WRITER, "dependency-pr-body.yml has no step with PR_TITLE; this test would be running nothing");
  const dir = mkdtempSync(join(tmpdir(), "dependency-pr-body-"));
  writeFileSync(join(dir, "gh"), GH);
  chmodSync(join(dir, "gh"), EXECUTABLE);
  writeFileSync(join(dir, "files.json"), JSON.stringify(options.files));
  writeFileSync(join(dir, "step.sh"), WRITER);
  const result = spawnSync("bash", ["-e", join(dir, "step.sh")], {
    encoding: "utf8",
    env: {
      PATH: `${dir}:${process.env.PATH}`, PR_TITLE: options.title, PR_NUMBER: "5725", REPO: "a11ign/a11ign", BASE_SHA: "base0000",
      GH_TOKEN: "read-token", EDIT_TOKEN: "edit-token", FILES_JSON: join(dir, "files.json"),
      OWNED: (options.owned ?? ["packages/screenreader-worker/package.json"]).join("\n"),
      WRITTEN_BODY: join(dir, "written.md"), WRITTEN_TOKEN: join(dir, "written-token"),
    },
  });
  const read = (name: string) => (existsSync(join(dir, name)) ? readFileSync(join(dir, name), "utf8") : null);
  const run = { code: result.status, out: `${result.stdout}${result.stderr}`, body: read("written.md"), token: read("written-token") };
  rmSync(dir, { recursive: true, force: true });
  return run;
}

const writesNothing = (run: Run, reason: RegExp) => {
  assert.equal(run.code, 0, run.out);
  assert.equal(run.body, null, "nothing may be written");
  assert.match(run.out, reason);
};

test("a grouped pip title over the two requirements files gets the fixed fragment, naming each update", () => {
  const run = runWriter({ title: GROUP_TITLE, files: GROUP_FILES });
  assert.equal(run.code, 0, run.out);
  assert.ok(run.body, run.out);
  assert.match(run.body, /^Dependency update by dependabot\[bot\] \(ADR 0041\): bump the pip-minor-and-patch group: numpy 2\.5\.1 -> 2\.5\.4, onnxruntime 1\.28\.0 -> 1\.28\.2, torch 2\.13\.0 -> 2\.13\.1\.$/m);
  assert.equal(run.body.match(/^Acceptance:$/gm)?.length, 1, "exactly one Acceptance: section");
  assert.match(run.body, /^pnpm exec rstest run --config=scripts\/rstest\/rstest\.config\.ts --include packages\/guards\/src\/one-package-manager\.test\.ts$/m);
  assert.match(run.body, /^Closes: none -- dependency update by dependabot\[bot\] \(ADR 0041\)$/m);
  assert.equal(run.token, "token=edit-token\n", "the PATCH is made with the minted token, not the read one");
});

test("a group names an update once even when it moves in both directories", () => {
  const run = runWriter({ title: GROUP_TITLE, files: GROUP_FILES });
  assert.equal(run.body?.match(/numpy 2\.5\.1 -> 2\.5\.4/g)?.length, 1);
});

test("a group in one directory, with or without the ` in /dir` part, is read the same way", () => {
  for (const title of ["deps: bump the pip-minor-and-patch group with 1 update", "deps: Bump the pip-minor-and-patch group in /packages/scorer with 2 updates"]) {
    const run = runWriter({ title, files: [CI_FILE] });
    assert.match(run.body ?? run.out, /bump the pip-minor-and-patch group: numpy 2\.5\.1 -> 2\.5\.4\./, title);
  }
});

test("a pin name is read the way pip reads it: case and `_` `.` `-` do not make a second package", () => {
  const files = [{ filename: "requirements-ci.txt", patch: patchOf(["Foo_Bar==1.0.0", "foo.-bar==1.0.1"]) }];
  assert.match(runWriter({ title: GROUP_TITLE, files }).body ?? "", /: foo-bar 1\.0\.0 -> 1\.0\.1\.$/m);
});

test("one major among the minors writes nothing, and the log says the group holds a major", () => {
  const major = { ...SCORER_FILE, patch: patchOf(["numpy==2.5.1", "numpy==2.5.4"], ["torch==2.13.0", "torch==3.0.0"]) };
  writesNothing(runWriter({ title: GROUP_TITLE, files: [CI_FILE, major] }), /the group holds a major \(torch goes from 2\.13\.0 to 3\.0\.0, a major bump\)/);
});

test("a 0.x minor in a group counts as a major, and a 0.x patch does not", () => {
  const zeroMinor = [{ filename: "requirements-ci.txt", patch: patchOf(["safetensors==0.8.0", "safetensors==0.9.0"]) }];
  writesNothing(runWriter({ title: GROUP_TITLE, files: zeroMinor }), /the group holds a major \(safetensors goes from 0\.8\.0 to 0\.9\.0/);
  const zeroPatch = [{ filename: "requirements-ci.txt", patch: patchOf(["safetensors==0.8.0", "safetensors==0.8.1"]) }];
  assert.match(runWriter({ title: GROUP_TITLE, files: zeroPatch }).body ?? "", /safetensors 0\.8\.0 -> 0\.8\.1/);
});

test("a 0.0.x move is breaking under a caret range, as the changeset check holds it, so a group holding one writes nothing", () => {
  const zeroZero = [{ filename: "requirements-ci.txt", patch: patchOf(["foo==0.0.1", "foo==0.0.2"]) }];
  writesNothing(runWriter({ title: GROUP_TITLE, files: zeroZero }), /the group holds a major \(foo goes from 0\.0\.1 to 0\.0\.2/);
});

test("a downgrade, an added pin and a removed pin are not minor or patch bumps, so a group holding one writes nothing", () => {
  const cannotProve = /has an update this cannot prove is a minor or patch bump/;
  const downgrade = [{ filename: "requirements-ci.txt", patch: patchOf(["numpy==2.5.4", "numpy==2.5.1"]) }];
  writesNothing(runWriter({ title: GROUP_TITLE, files: downgrade }), /numpy goes from 2\.5\.4 to 2\.5\.1, a downgrade/);
  const added = [{ filename: "requirements-ci.txt", patch: "@@ -1 +1,2 @@\n numpy==2.5.1\n+scipy==1.0.0" }];
  writesNothing(runWriter({ title: GROUP_TITLE, files: added }), /no pinned version moves in the diff/);
  const removed = [{ filename: "requirements-ci.txt", patch: "@@ -1,2 +1 @@\n numpy==2.5.1\n-scipy==1.0.0" }];
  writesNothing(runWriter({ title: GROUP_TITLE, files: removed }), /scipy was added or removed, which is not a version bump/);
  const swapped = [{ filename: "requirements-ci.txt", patch: "@@ -1,2 +1,2 @@\n-scipy==1.0.0\n+numpy==2.5.4" }];
  writesNothing(runWriter({ title: GROUP_TITLE, files: swapped }), /(scipy|numpy) was added or removed, which is not a version bump/);
  const unmoved = [{ filename: "requirements-ci.txt", patch: patchOf(["numpy==2.5.1", "numpy==2.5.1"]) }];
  writesNothing(runWriter({ title: GROUP_TITLE, files: unmoved }), /numpy stays at 2\.5\.1/);
  const twice = [{ filename: "requirements-ci.txt", patch: patchOf(["numpy==2.5.1", "numpy==2.5.4"], ["numpy==2.5.1", "numpy==2.5.5"]) }];
  writesNothing(runWriter({ title: GROUP_TITLE, files: twice }), /numpy is pinned twice in requirements-ci\.txt/);
  const removedTwice = [{ filename: "requirements-ci.txt", patch: "@@ -1,2 +1 @@\n-numpy==2.5.1\n-numpy==2.5.1\n+numpy==2.5.4" }];
  writesNothing(runWriter({ title: GROUP_TITLE, files: removedTwice }), /numpy is pinned twice in requirements-ci\.txt/);
});

test("a group whose diff the step cannot read pin by pin writes nothing: no patch, a changed comment, a range, an unplain version", () => {
  const notAPin = /requirements-ci\.txt changes a line that is not a plain 'name==x\.y\.z' pin/;
  writesNothing(runWriter({ title: GROUP_TITLE, files: [{ filename: "requirements-ci.txt", patch: null }] }), /requirements-ci\.txt has no diff to read/);
  writesNothing(runWriter({ title: GROUP_TITLE, files: [{ filename: "requirements-ci.txt", patch: "@@ -1 +1 @@\n-# old note\n+# new note" }] }), notAPin);
  writesNothing(runWriter({ title: GROUP_TITLE, files: [{ filename: "requirements-ci.txt", patch: patchOf(["numpy>=2.5.1", "numpy>=2.5.4"]) }] }), notAPin);
  writesNothing(runWriter({ title: GROUP_TITLE, files: [{ filename: "requirements-ci.txt", patch: patchOf(["numpy==2.5.1", "numpy==2.5.4rc1"]) }] }), notAPin);
  writesNothing(runWriter({ title: GROUP_TITLE, files: [{ filename: "requirements-ci.txt", patch: patchOf(["pytest", "PYTEST"]) }] }), notAPin);
  writesNothing(runWriter({ title: GROUP_TITLE, files: [{ filename: "requirements-ci.txt", patch: patchOf() }] }), /no pinned version moves in the diff/);
});

test("a group that also touches a file outside the manifests writes nothing", () => {
  const stray = { filename: "packages/scorer/score.py", patch: "@@ -1 +1 @@\n-x\n+y" };
  writesNothing(runWriter({ title: GROUP_TITLE, files: [...GROUP_FILES, stray] }), /the pip-minor-and-patch group touches something other than the pip requirement files/);
  const workflow = { filename: ".github/workflows/ci.yml", patch: "@@ -1 +1 @@\n-x\n+y" };
  writesNothing(runWriter({ title: GROUP_TITLE, files: [...GROUP_FILES, workflow] }), /touches something other than the pip requirement files/);
});

test("a group that touches an owned path writes nothing", () => {
  writesNothing(
    runWriter({ title: GROUP_TITLE, files: GROUP_FILES, owned: ["packages/scorer/"] }),
    /the pip-minor-and-patch group touches an owned path \(packages\/scorer\/\)/,
  );
});

test("a group whose owned-path list cannot be read writes nothing (not being able to ask is not a pass)", () => {
  writesNothing(runWriter({ title: GROUP_TITLE, files: GROUP_FILES, owned: [] }), /owned-path list could not be read/);
});

test("a group that changes a package.json or the lockfile is not read pin by pin, so it writes nothing", () => {
  const manifest = { filename: "package.json", patch: '@@ -1 +1 @@\n-    "yaml": "^2.9.0"\n+    "yaml": "^2.9.1"' };
  writesNothing(runWriter({ title: "deps: bump the npm-minor-and-patch group with 1 update", files: [manifest] }), /something other than the pip requirement files/);
  writesNothing(runWriter({ title: GROUP_TITLE, files: [...GROUP_FILES, { filename: "pnpm-lock.yaml", patch: null }] }), /something other than the pip requirement files/);
});

test("a title that only looks like a group is not auto-declared", () => {
  for (const title of ["deps: bump the pip-minor-and-patch group", "deps: bump the pip group with updates", "chore: bump the pip group with 2 updates", "deps: bump the pip group across 2 directories with 3 updates and more"]) {
    writesNothing(runWriter({ title, files: GROUP_FILES }), /the title is not/);
  }
});

test("controls: one package in a manifest is still declared, as it was before groups, with the same body", () => {
  const json = { filename: "package.json", patch: null };
  const single = runWriter({ title: "deps: bump yaml from 2.9.0 to 2.9.1", files: [json, { filename: "pnpm-lock.yaml", patch: null }] });
  assert.match(single.body ?? single.out, /^Dependency update by dependabot\[bot\] \(ADR 0041\): bump yaml from 2\.9\.0 to 2\.9\.1\.$/m);
  assert.match(single.body ?? "", /^Closes: none -- dependency update by dependabot\[bot\] \(ADR 0041\)$/m);
  assert.equal(single.token, "token=edit-token\n");
});

test("a single-package title is not declared over a requirements file: nothing reads that diff, so only a group is", () => {
  const title = "deps: bump numpy from 2.5.1 to 2.5.4 in /";
  writesNothing(runWriter({ title, files: [CI_FILE] }), /touches something other than the manifests and the lockfile/);
  const smuggled = { filename: "requirements-ci.txt", patch: patchOf(["numpy==2.5.1", "numpy==9.0.0"]) };
  writesNothing(runWriter({ title, files: [smuggled] }), /touches something other than the manifests and the lockfile/);
});

test("controls: a single major, a single 0.x minor and a single stray file still write nothing", () => {
  writesNothing(runWriter({ title: "deps: bump yaml from 2.9.0 to 3.0.0", files: [{ filename: "package.json" }] }), /a major bump/);
  writesNothing(runWriter({ title: "deps: bump yaml from 0.8.0 to 0.9.0", files: [{ filename: "package.json" }] }), /a major bump/);
  const zeroPatch = runWriter({ title: "deps: bump yaml from 0.8.0 to 0.8.1", files: [{ filename: "package.json" }] });
  assert.match(zeroPatch.body ?? zeroPatch.out, /bump yaml from 0\.8\.0 to 0\.8\.1\./, "the control: a 0.x patch is declared");
  writesNothing(runWriter({ title: "deps: bump yaml from 2.9.0 to 2.9.1", files: [{ filename: "package.json" }, { filename: "src/index.ts" }] }), /touches something other than the manifests/);
});

test("the workflow checks nothing out and never reads the pull request's body", () => {
  assert.equal(STEPS.some((step) => /^actions\/checkout\b/.test(step.uses ?? "")), false, "no step uses actions/checkout");
  const code = WORKFLOW_TEXT.split("\n").filter((line) => !line.trimStart().startsWith("#")).join("\n");
  assert.doesNotMatch(code, /actions\/checkout|git (clone|fetch|checkout)/);
  assert.doesNotMatch(code, /pull_request\.body|PR_BODY|\.body\b(?!_file)/, "the body is replaced, never read");
  assert.doesNotMatch(code, /\$\{\{\s*github\.event\.pull_request\.title\s*\}\}[^\n]*\n[^\n]*run:/, "the title reaches the shell only as an environment variable");
  assert.equal(STEPS.filter((step) => step.run?.includes("${{")).length, 0, "no `${{ }}` text inside a script");
});
