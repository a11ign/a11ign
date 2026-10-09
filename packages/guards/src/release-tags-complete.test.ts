/**
 * EVERY PUBLISHED a11ign VERSION HAS ONE RELEASE TAG IN ONE DOCUMENTED FORM (#4526, outcome 19 of #4084).
 *
 * The evaluator looked for `v0.5.2` and `v0.5.4` and found neither. The repository has two tag forms: `a11ign@<version>`, which the release
 * job cuts for every release and its GitHub Release hangs off, and `v<version>`, which `promote-action-tag` writes only so Dependabot can
 * see the Action (#4058) and so exists for some versions. The contract is the first.
 *
 * Three halves, each with its positive control beside it:
 *
 *   1. `scripts/release-tags-complete.ts` names exactly the versions that lack `a11ign@<version>`: a fixture with one missing version
 *      names it; a fixture with none names nothing (the control that the first is not a script that always complains); and a
 *      `v<version>` tag does not stand in for the contract tag.
 *   2. The contract prefix is READ from `release.yml` (not retyped here), so the script cannot drift from what the workflow writes.
 *   3. Both READMEs name the contract form, and say `v<version>` is not it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { CONTRACT_TAG_PREFIX, parseTagNames, parseVersions, versionsWithoutTag } from "../../../scripts/release-tags-complete.ts";

const REPO = fileURLToPath(new URL("../../..", import.meta.url));
const read = (path: string) => readFileSync(`${REPO}${path}`, "utf8");

const VERSIONS = ["0.5.0", "0.5.1", "0.5.2"];
const ALL_TAGGED = VERSIONS.map((v) => `a11ign@${v}`);

test("a fixture with one missing version names that version and no other", () => {
  const tags = ALL_TAGGED.filter((tag) => tag !== "a11ign@0.5.1");
  assert.deepEqual(versionsWithoutTag({ versions: VERSIONS, tags }), ["0.5.1"]);
});

test("positive control: a fixture with every tag names nothing", () => {
  assert.deepEqual(versionsWithoutTag({ versions: VERSIONS, tags: ALL_TAGGED }), []);
});

test("a `v<version>` tag is not the contract tag: the evaluator's finding in the form it looked for", () => {
  const onlyVForm = ["v0.5.0", "v0.5.1", "v0.5.2", "a11ign@0.5.0"];
  assert.deepEqual(versionsWithoutTag({ versions: VERSIONS, tags: onlyVForm }), ["0.5.1", "0.5.2"]);
});

test("a tag for a version the registry does not list is not a missing version", () => {
  assert.deepEqual(versionsWithoutTag({ versions: VERSIONS, tags: [...ALL_TAGGED, "a11ign@9.9.9"] }), []);
});

test("`git ls-remote --tags` output: annotated tags peel once, other refs are ignored", () => {
  const sha = "a".repeat(40);
  const listing = [
    `${sha}\trefs/tags/a11ign@0.5.0`,
    `${sha}\trefs/tags/a11ign@0.5.1`,
    `${sha}\trefs/tags/a11ign@0.5.1^{}`,
    `${sha}\trefs/heads/main`,
    "",
  ].join("\n");
  assert.deepEqual(parseTagNames(listing), ["a11ign@0.5.0", "a11ign@0.5.1"]);
});

test("`npm view` output: a list, a bare string for one version, and a refusal of anything else", () => {
  assert.deepEqual(parseVersions('["0.1.0","0.3.0"]'), ["0.1.0", "0.3.0"]);
  assert.deepEqual(parseVersions('"0.1.0"'), ["0.1.0"]);
  for (const unreadable of ["[]", "{}", "[1]", "null"]) assert.throws(() => parseVersions(unreadable), /did not print a non-empty list/, unreadable);
});

test("the contract prefix is the one release.yml selects promoted tags by", () => {
  const found = /select\(startswith\("([^"]+@)"\)\)/.exec(read(".github/workflows/release.yml"));
  assert.ok(found, "release.yml no longer selects the Action's tags by a `<name>@` prefix: this test's source of the tag name moved");
  assert.equal(CONTRACT_TAG_PREFIX, found[1]);
});

for (const path of ["README.md", "packages/cli/README.md"]) {
  test(`${path} names the contract tag form and says \`v<version>\` is not it`, () => {
    const text = read(path);
    assert.ok(text.includes(`A release is tagged \`${CONTRACT_TAG_PREFIX}<version>\``), `${path} does not say a release is tagged \`${CONTRACT_TAG_PREFIX}<version>\``);
    assert.match(text, /`v<version>` tags are not that contract/, `${path} does not say the \`v<version>\` tags are not the contract`);
  });
}
