#!/usr/bin/env tsx
// command: print every published version of `a11ign` that has no `a11ign@<version>` release tag, and exit 1 if there is one (#4526)
//
// THE CONTRACT IS `a11ign@<version>` (#4526, #4084 outcome 19): `release.yml` cuts it for every release and the GitHub Release hangs off it.
// `v<version>` is NOT the contract. `promote-action-tag` writes it too, but only since #4058 and only so Dependabot can see the Action, so
// a version without it is not a version without a release tag; the evaluator's `v0.5.2` finding was a probe of the wrong form.
//
// TWO READINGS, BOTH FROM OUTSIDE THE CHECKOUT: the registry's version list (`npm view a11ign versions --json`) and the tags on `origin`
// (`git ls-remote --tags`), never the local tag list, which a worktree holds only as far as it last fetched. A reading that cannot be
// taken THROWS: not being able to ask is never "nothing missing".
import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { sandboxGitEnv } from "../packages/guards/src/git-env.mjs";
import { refuseUnknownFlags } from "./cli-flags.mjs";
import { npmCliInvocation } from "./npm-cli-executable.mjs";

const REPO = fileURLToPath(new URL("..", import.meta.url));
const PACKAGE = "a11ign";
/** The documented form of a release tag; `packages/cli/README.md` and the root README say the same, and the test reads all three. */
export const CONTRACT_TAG_PREFIX = `${PACKAGE}@`;

/** The registry versions that have no tag named `a11ign@<version>`, in the order the registry listed them. */
export function versionsWithoutTag({ versions, tags }: { versions: string[]; tags: string[] }): string[] {
  const present = new Set(tags);
  return versions.filter((version) => !present.has(`${CONTRACT_TAG_PREFIX}${version}`));
}

/** `npm view` prints a bare string, not an array, for a package with exactly one version. */
export function parseVersions(json: string): string[] {
  const parsed: unknown = JSON.parse(json);
  const versions = typeof parsed === "string" ? [parsed] : parsed;
  if (!Array.isArray(versions) || versions.length === 0 || !versions.every((v) => typeof v === "string")) {
    throw new Error(`npm view ${PACKAGE} versions --json did not print a non-empty list of versions: ${json.slice(0, 200)}`);
  }
  return versions as string[];
}

/** Tag names from `git ls-remote --tags`, with the peeled `^{}` lines of annotated tags folded into the tag they peel. */
export function parseTagNames(lsRemote: string): string[] {
  const names = lsRemote
    .split("\n")
    .map((line) => line.split("\t")[1] ?? "")
    .filter((ref) => ref.startsWith("refs/tags/"))
    .map((ref) => ref.slice("refs/tags/".length).replace(/\^\{\}$/, ""));
  return [...new Set(names)];
}

function registryVersions(): string[] {
  const { command, args } = npmCliInvocation("npm", ["view", PACKAGE, "versions", "--json"]);
  return parseVersions(execFileSync(command, args, { encoding: "utf8" }));
}

function originTags(): string[] {
  const listing = execFileSync("git", ["ls-remote", "--tags", "origin"], { cwd: REPO, env: sandboxGitEnv(), encoding: "utf8" });
  return parseTagNames(listing);
}

function main() {
  refuseUnknownFlags([], { entry: import.meta.url, command: "node --import tsx scripts/release-tags-complete.ts" });
  const versions = registryVersions();
  const missing = versionsWithoutTag({ versions, tags: originTags() });
  if (missing.length === 0) {
    console.log(`no missing version: all ${versions.length} published versions of ${PACKAGE} have ${CONTRACT_TAG_PREFIX}<version> on origin`);
    return;
  }
  for (const version of missing) console.log(`${version} (no tag ${CONTRACT_TAG_PREFIX}${version})`);
  console.error(`${missing.length} of ${versions.length} published versions of ${PACKAGE} lack their ${CONTRACT_TAG_PREFIX}<version> tag`);
  process.exitCode = 1;
}

// REALPATH'D, per `entry-points.test.ts` (#1086): reached through a symlink, the plain form skips main() and exits 0 silently.
if (import.meta.url === pathToFileURL(process.argv[1] ? realpathSync(process.argv[1]) : "").href) main();
