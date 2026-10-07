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
