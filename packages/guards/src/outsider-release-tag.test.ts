/**
 * THE OUTSIDER JOB LOOKS UP THE TAG THE RELEASE JOB WRITES (#4026, found by #3224).
 *
 * Releases are tagged `a11ign@<version>` (`release.yml`'s `promote-action-tag` reads them by that name). The outsider job's three
 * lookups (the generator, the committed workflow it writes, and the verdict reader) asked for `refs/tags/v<version>`, which exists for
 * 0.1.0 only, so for 0.3.0 `tag_sha` was empty and the job could never run.
 *
 * Two halves: the release job's prefix is READ from `release.yml` (not retyped here), and every versioned `refs/tags/...${version}`
 * lookup in the three files must start with it. Positive controls: each file must contain such a lookup (an emptiness assertion
 * passes on a file that stopped looking altogether), and `lookupFaults` is run on the old `v` spelling, which it must refuse.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const REPO = fileURLToPath(new URL("../../..", import.meta.url));
const read = (path: string) => readFileSync(`${REPO}${path}`, "utf8");

const LOOKUP_FILES = ["scripts/outsider/generate.mjs", "scripts/outsider/outsider-job.yml", "scripts/outsider/verdict-job.mjs"];

/** The prefix `promote-action-tag` strips from a promoted tag to get the version: `a11ign@`. */
function releaseTagPrefix(releaseYml: string): string {
  const found = /select\(startswith\("([^"]+@)"\)\)/.exec(releaseYml);
  assert.ok(found, "release.yml no longer selects the Action's tags by a `<name>@` prefix: this test's source of the tag name moved");
  return found[1];
}

/**
 * Every `refs/tags/<name>` ref a file builds from the `version` variable: the shell form (`${version}`), a template literal's, and the
 * generator's own, where a template literal escapes the dollar (`\${version}`) so the shell, not JavaScript, expands it.
 */
const versionedRefs = (text: string) => [...text.matchAll(/refs\/tags\/([^\s"'`^}]*?)\\?(\$\{version\})/g)].map((m) => m[1] + m[2]);

/** The lookups in `text` that do not name the release job's tag; an empty list is only evidence if `versionedRefs` found some. */
function lookupFaults(text: string, prefix: string): string[] {
  return versionedRefs(text).filter((name) => name !== `${prefix}\${version}`);
}

const prefix = releaseTagPrefix(read(".github/workflows/release.yml"));

test("the release job's tag prefix is the package's name and an @", () => {
  assert.equal(prefix, "a11ign@");
});

for (const file of LOOKUP_FILES) {
  test(`${file} looks up the tag the release job writes`, () => {
    const text = read(file);
    assert.ok(versionedRefs(text).length >= 2, `${file} has no versioned tag lookup: the positive control for the assertion below`);
    assert.deepEqual(lookupFaults(text, prefix), []);
  });
}

test("the check refuses the old `v<version>` lookup, in both spellings", () => {
  const shell = 'git ls-remote "$remote" "refs/tags/v${version}^{}"';
  const template = "`refs/tags/v${version}`";
  assert.deepEqual(lookupFaults(shell, prefix), ["v${version}"]);
  assert.deepEqual(lookupFaults(template, prefix), ["v${version}"]);
});

/*
 * THE RELEASE CUTS THE EXACT `v<version>` TAG TOO (#4058, found by #3224).
 *
 * Dependabot's github-actions ecosystem reads `releases` and tags for a version-shaped name; `a11ign@0.3.1` is not one, so after v0.1.0 it
 * logged `Latest version is 0.1.0` and opened nothing. `promote-action-tag` therefore writes `v<version>` beside the major tag. These
 * tests RUN that step's script against a stubbed `git ls-remote` and a stubbed `gh`, because what matters is the write it makes (or does not
 * make) on each listing, which no grep over the script's text can show.
 */
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync as readText, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "yaml";

type Step = { run?: string };
const stepScript = (): string => {
  const workflow = parse(read(".github/workflows/release.yml")) as { jobs: Record<string, { steps: Step[] }> };
  const script = workflow.jobs["promote-action-tag"].steps.map((s) => s.run).find((run) => run !== undefined);
  assert.ok(script, "promote-action-tag has no run step: this test's source of the script moved");
  return script;
};

const OLD = "a".repeat(40);
const NEW = "b".repeat(40);
const OTHER = "c".repeat(40);
const line = (sha: string, ref: string) => `${sha}\trefs/tags/${ref}`;
/** The Action as it stands on the public repository: v0 follows v0.1.0, and a11ign@0.3.1 is the promotion. */
const BEFORE = [line(OLD, "v0"), line(OLD, "v0.1.0"), line(OLD, "a11ign@0.1.0"), line(NEW, "a11ign@0.3.1")];

/** Runs the step with a `git` that prints `listing` and a `gh` that records its argv, one call a line, and returns the exit code and those calls. */
function runStep(listing: string[], promoted: object[] = [{ tag: "a11ign@0.3.1" }], env: Record<string, string> = { GH_TOKEN: "token" }, ghBody?: string) {
  const dir = mkdtempSync(join(tmpdir(), "promote-action-tag-"));
  try {
    const stub = (name: string, body: string) => {
      writeFileSync(join(dir, name), `#!/bin/bash\n${body}\n`);
      chmodSync(join(dir, name), 0o755);
    };
    writeFileSync(join(dir, "listing"), listing.join("\n") + "\n");
    stub("git", `cat "${dir}/listing"`);
    stub("gh", ghBody ?? `echo "$*" >> "${dir}/gh-calls"`);
    const result = spawnSync("bash", ["-c", stepScript()], {
      env: { PATH: `${dir}:${process.env.PATH}`, GH_REPO: "a11ign/a11ign", GITHUB_SERVER_URL: "https://github.com", PROMOTED: JSON.stringify(promoted), ...env },
      encoding: "utf8",
    });
    let calls: string[] = [];
    try {
      calls = readText(join(dir, "gh-calls"), "utf8").trim().split("\n");
    } catch (cause) {
      // No `gh` call at all is a result, not a fault: the stub only creates the file when it is called.
      assert.equal((cause as NodeJS.ErrnoException).code, "ENOENT");
    }
    return { status: result.status, calls, out: result.stdout + result.stderr };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
const writesTo = (calls: string[], ref: string) => calls.filter((c) => c.includes(`refs/tags/${ref} `) || c.endsWith(`refs/tags/${ref}`));

test("a promotion with no v<version> tag creates it at the commit of a11ign@<version>, and moves the major tag as before", () => {
  const { status, calls, out } = runStep(BEFORE);
  assert.equal(status, 0, out);
  assert.deepEqual(writesTo(calls, "v0.3.1"), [`api -X POST repos/a11ign/a11ign/git/refs -f ref=refs/tags/v0.3.1 -f sha=${NEW}`]);
  assert.deepEqual(writesTo(calls, "v0"), [`api -X PATCH repos/a11ign/a11ign/git/refs/tags/v0 -f sha=${NEW} -F force=true`]);
});

test("a re-run finds v<version> present at the same commit and writes nothing", () => {
  const { status, calls, out } = runStep([...BEFORE.filter((l) => !l.endsWith("\trefs/tags/v0")), line(NEW, "v0"), line(NEW, "v0.3.1")]);
  assert.equal(status, 0, out);
  assert.deepEqual(calls, []);
});

test("a v<version> tag at another commit is red and is never moved", () => {
  const { status, calls, out } = runStep([...BEFORE, line(OTHER, "v0.3.1")]);
  assert.notEqual(status, 0, out);
  assert.match(out, /v0\.3\.1/);
  assert.deepEqual(calls, []);
});

test("an annotated a11ign@<version> tag is peeled: v<version> points at the commit, not at the tag object", () => {
  const tagObject = "d".repeat(40);
  const listing = [...BEFORE.filter((l) => !l.includes("a11ign@0.3.1")), line(tagObject, "a11ign@0.3.1"), line(NEW, "a11ign@0.3.1^{}")];
  const { status, calls, out } = runStep(listing);
  assert.equal(status, 0, out);
  assert.deepEqual(writesTo(calls, "v0.3.1"), [`api -X POST repos/a11ign/a11ign/git/refs -f ref=refs/tags/v0.3.1 -f sha=${NEW}`]);
});

test("positive control: nothing promoted writes nothing, so the writes above are the step's and not the stub's", () => {
  const { status, calls, out } = runStep(BEFORE, []);
  assert.equal(status, 0, out);
  assert.deepEqual(calls, []);
});

test("an empty Octo STS token is red before any write, and names the step that minted it: there is no fallback to GITHUB_TOKEN (#4154, #4194)", () => {
  const { status, calls, out } = runStep(BEFORE, undefined, { GH_TOKEN: "" });
  assert.notEqual(status, 0, out);
  assert.match(out, /Octo STS token \(step octo-sts\)/);
  assert.deepEqual(calls, []);
});

test("a refused ref write prints the response body and is red (#4154: `>/dev/null` hid it from the first real run)", () => {
  const refusal = `echo '{"message":"Resource not accessible by integration","status":"403"}'; exit 1`;
  const { status, out } = runStep(BEFORE, undefined, { GH_TOKEN: "token" }, refusal);
  assert.notEqual(status, 0, out);
  assert.match(out, /Resource not accessible by integration/);
});

test("a dispatch naming a version promotes that version, and a malformed one moves nothing", () => {
  const named = runStep(BEFORE, [], { GH_TOKEN: "token", ONLY_VERSION: "0.3.1" });
  assert.equal(named.status, 0, named.out);
  assert.deepEqual(writesTo(named.calls, "v0"), [`api -X PATCH repos/a11ign/a11ign/git/refs/tags/v0 -f sha=${NEW} -F force=true`]);
  const bad = runStep(BEFORE, [], { GH_TOKEN: "token", ONLY_VERSION: "0.3.1; rm -rf x" });
  assert.notEqual(bad.status, 0, bad.out);
  assert.deepEqual(bad.calls, []);
});
