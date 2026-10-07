/**
 * THE `guards` JOB READS THE VERSION THE RELEASE COMMIT STARTS FROM, NOT `main`'S MANIFEST (#4023).
 *
 * The called `release-per-merge.yml` resets each package to its newest tag `<name>@x.y.z` and versions from there, on a
 * detached commit `main` never receives. So once a release has shipped, `main`'s manifests lag the registry for good, and a
 * "manifest behind the registry's latest" guard that reads them refuses every release after the first. Measured on dispatch
 * run 37693864114: `BEHIND: a11ign@0.2.7 (latest on the registry: 0.3.0)` with the tag `a11ign@0.3.0` present.
 *
 * This runs the REAL inline script out of the parsed workflow, in a scratch git repository with tags and a stub `npm`
 * answering for the registry, so nothing here reaches the network.
 *
 * Positive control for the emptiness-style assertions: the first test asserts the script was found and printed readings.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { sandboxGitEnv } from "../../../scripts/test-support/git-sandbox.ts";

const REPO = fileURLToPath(new URL("../../..", import.meta.url));
const SHELL_SINGLE_QUOTE = `'"'"'`;

type Step = { id?: string; run?: string };
type Reading = { name: string; manifest: string; latest: string; state: string };

/** The `node -e '...'` body of the `readings` step, with the shell's quote-splicing undone. */
function readingsScript(): string {
  const workflow = parse(readFileSync(join(REPO, ".github/workflows/release.yml"), "utf8")) as { jobs: Record<string, { steps?: Step[] }> };
  const run = Object.values(workflow.jobs).flatMap((job) => job.steps ?? []).find((step) => step.id === "readings")?.run;
  assert.ok(run, "no step with id `readings` in release.yml");
  const body = /node -e '\n([\s\S]*?)\n\s*'\)/.exec(run)?.[1];
  assert.ok(body, "the readings step no longer has the `node -e '...'` shape this test extracts");
  return body.split(SHELL_SINGLE_QUOTE).join("'");
}

function git(cwd: string, ...args: string[]): void {
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd, stdio: "ignore", env: sandboxGitEnv() });
}

function scratch(options: { manifestVersion: string; tags: string[]; registryLatest: string }): Reading[] {
  const dir = mkdtempSync(join(tmpdir(), "release-base-"));
  try {
    mkdirSync(join(dir, "packages/cli"), { recursive: true });
    writeFileSync(join(dir, "packages/cli/package.json"), JSON.stringify({ name: "a11ign", version: options.manifestVersion }));
    git(dir, "init", "-q");
    git(dir, "add", ".");
    git(dir, "commit", "-q", "-m", "x");
    for (const tag of options.tags) git(dir, "tag", tag);
    mkdirSync(join(dir, "bin"));
    writeFileSync(join(dir, "bin/npm"), `#!/bin/sh\necho ${options.registryLatest}\n`);
    chmodSync(join(dir, "bin/npm"), 0o755);
    writeFileSync(join(dir, "readings.js"), readingsScript());
    const out = execFileSync("node", ["readings.js"], { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], env: sandboxGitEnv({ PATH: `${join(dir, "bin")}:${process.env.PATH}` }) });
    return JSON.parse(out) as Reading[];
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("a manifest that lags its newest tag is read at the tag, so a release after the first is not refused", () => {
  const [reading] = scratch({ manifestVersion: "0.2.7", tags: ["a11ign@0.3.0"], registryLatest: "0.3.0" });
  assert.ok(reading, "the script printed no readings");
  assert.equal(reading.manifest, "0.3.0");
  assert.equal(reading.state, "level");
});

test("the newest of several tags is the base, and only this package's tags count", () => {
  const [reading] = scratch({ manifestVersion: "0.1.0", tags: ["a11ign@0.2.0", "a11ign@0.10.0", "a11ign@0.9.0", "other@9.9.9", "@a11ign/a11ign@8.8.8"], registryLatest: "0.10.0" });
  assert.equal(reading?.manifest, "0.10.0");
});

test("a package with no tag keeps main's version, and one behind the registry is still refused", () => {
  const [reading] = scratch({ manifestVersion: "0.2.7", tags: [], registryLatest: "0.3.0" });
  assert.equal(reading?.manifest, "0.2.7");
  assert.equal(reading?.state, "behind");
});

test("a tag behind the registry is still refused: the guard did not become a pass", () => {
  const [reading] = scratch({ manifestVersion: "0.2.7", tags: ["a11ign@0.2.9"], registryLatest: "0.3.0" });
  assert.equal(reading?.state, "behind");
});
