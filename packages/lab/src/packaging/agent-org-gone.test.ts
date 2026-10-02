/**
 * `packages/agent-org/` IS FROZEN, a11ign/a11ign#2976 (PR 1 of 2): no tracked path under it may be ADDED or CHANGED, and the refusal says where the change goes.
 *
 * Measured 2026-10-02: the agents host was pointed at `a11ign/agent-org` at 15:23Z, after which this directory is the old copy of the tool and a
 * change merged here reaches nothing. 24 merges touched it between the 06:50Z ruling and 17:57Z, two of them (#3035, #3036) after the host moved,
 * and nothing refused one. A deletion is allowed (the row's second pull request deletes the directory); an addition or a changed file is refused.
 *
 * THE EMPTINESS ASSERTION ON THE REAL TREE (`no breach`) IS ONLY WORTH ANYTHING BECAUSE THE SAME FUNCTIONS REFUSE IN THE TWO CONTROLS BELOW, IN THIS FILE:
 * a fixture holding one changed blob and one added path, asserted to hold them, and a real temporary git repository driven through the real reader.
 * The pass is reachable (deletion-only, and an untouched tree, both return `null`), so a guard that refused everything would fail here too.
 *
 * Every git call in this file's reader goes through `sandboxGitEnv`: a hook's `GIT_DIR` would otherwise aim it at the wrong repository.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { sandboxGitEnv } from "../../../guards/src/git-env.mjs";
import { FROZEN_DIR, TOOL_REPO, breaches, refusalFor, trackedBlobs } from "./agent-org-freeze.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..", "..", "..");
const MANIFEST = join(HERE, "agent-org-frozen-manifest.json");

const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", args, { cwd, env: sandboxGitEnv(), stdio: "pipe", encoding: "utf8" });

function frozenManifest(): { baseCommit: string, blobs: Record<string, string> } {
  return JSON.parse(readFileSync(MANIFEST, "utf8"));
}

test("the manifest is the shape its reader writes: a base commit, and every path under the frozen directory with `<mode> <blob id>`", () => {
  const { baseCommit, blobs } = frozenManifest();
  assert.match(baseCommit, /^[0-9a-f]{40}$/);
  const paths = Object.keys(blobs);
  assert.ok(paths.length > 0, "an empty manifest would admit nothing and refuse everything, or the reverse, depending on the comparison");
  assert.deepEqual(paths.filter((p) => !p.startsWith(FROZEN_DIR)), [], "every entry is under the frozen directory");
  assert.deepEqual(Object.values(blobs).filter((v) => !/^\d{6} [0-9a-f]{40,64}$/.test(v)), [], "every value is `<mode> <blob id>`");
});

test("THE REAL TREE: nothing under `packages/agent-org/` is added or changed against the manifest", () => {
  const found = breaches(frozenManifest().blobs, trackedBlobs(REPO_ROOT));
  assert.equal(refusalFor(found), null, `${refusalFor(found)}`);
});

// --- the control: the same functions, on a fixture that MUST be refused -------------------------------------------------------------------

const SHA1_HEX_LENGTH = 40;
const EXECUTABLE = 0o755;
/** A `<mode> <blob id>` value whose id is one repeated hex digit, so two fixtures differ by exactly one character. */
const blobOf = (digit: string) => `100644 ${digit.repeat(SHA1_HEX_LENGTH)}`;

const FROZEN: Record<string, string> = {
  [`${FROZEN_DIR}src/kept.mjs`]: blobOf("a"),
  [`${FROZEN_DIR}src/edited.mjs`]: blobOf("b"),
  [`${FROZEN_DIR}src/deleted.mjs`]: blobOf("c"),
};
const CHANGED_PATH = `${FROZEN_DIR}src/edited.mjs`;
const ADDED_PATH = `${FROZEN_DIR}src/new.mjs`;
const DELETED_PATH = `${FROZEN_DIR}src/deleted.mjs`;
const REFUSED_FIXTURE = {
  [`${FROZEN_DIR}src/kept.mjs`]: FROZEN[`${FROZEN_DIR}src/kept.mjs`],
  [CHANGED_PATH]: blobOf("d"),
  [ADDED_PATH]: blobOf("e"),
};

test("POSITIVE CONTROL: a fixture with one changed blob, one added path and one deletion is refused for the first two only, naming the tool's repository", () => {
  // The fixture is asserted to CONTAIN what it claims, so an empty or mis-keyed one cannot pass the assertions that follow.
  assert.ok(CHANGED_PATH in FROZEN && CHANGED_PATH in REFUSED_FIXTURE && FROZEN[CHANGED_PATH] !== REFUSED_FIXTURE[CHANGED_PATH], "a changed blob");
  assert.ok(!(ADDED_PATH in FROZEN) && ADDED_PATH in REFUSED_FIXTURE, "an added path");
  assert.ok(DELETED_PATH in FROZEN && !(DELETED_PATH in REFUSED_FIXTURE), "a deletion");

  const found = breaches(FROZEN, REFUSED_FIXTURE);
  assert.deepEqual(found, { added: [ADDED_PATH], changed: [CHANGED_PATH] }, "the deletion and the untouched file are not reported");
  const refusal = refusalFor(found) ?? "";
  assert.ok(refusal.includes(TOOL_REPO), "the refusal says where the change goes");
  assert.ok(refusal.includes(`CHANGED  ${CHANGED_PATH}`) && refusal.includes(`ADDED    ${ADDED_PATH}`), refusal);
});

test("THE PASS IS REACHABLE: an untouched directory, and one that only lost files, are not refused", () => {
  assert.equal(refusalFor(breaches(FROZEN, { ...FROZEN })), null, "untouched");
  const lostOne = { ...FROZEN };
  delete lostOne[DELETED_PATH];
  assert.equal(refusalFor(breaches(FROZEN, lostOne)), null, "a deletion");
  assert.equal(refusalFor(breaches(FROZEN, {})), null, "the whole directory deleted, which is the row's second pull request");
});

// --- the control that drives the REAL reader --------------------------------------------------------------------------------------------

/** A throwaway repository holding two files under the frozen directory, committed, and the manifest the real reader writes from it. */
function repoWithFrozenDir() {
  const root = mkdtempSync(join(tmpdir(), "agent-org-freeze-"));
  git(root, "init", "-q");
  mkdirSync(join(root, FROZEN_DIR, "src"), { recursive: true });
  writeFileSync(join(root, FROZEN_DIR, "src", "x.mjs"), "export const x = 1;\n");
  writeFileSync(join(root, FROZEN_DIR, "src", "y.mjs"), "export const y = 1;\n");
  writeFileSync(join(root, "outside.txt"), "not under the frozen directory\n");
  git(root, "add", "--", ".");
  git(root, "-c", "user.name=t", "-c", "user.email=t@example.com", "commit", "-q", "-m", "base");
  return { root, frozen: trackedBlobs(root) };
}

test("THE REAL READER, in a real repository: it sees the frozen directory only, and refuses a staged edit, an addition, a moved-in file and a mode change", () => {
  const { root, frozen } = repoWithFrozenDir();
  try {
    assert.deepEqual(Object.keys(frozen), [`${FROZEN_DIR}src/x.mjs`, `${FROZEN_DIR}src/y.mjs`], "the reader finds both, and not outside.txt");
    assert.equal(refusalFor(breaches(frozen, trackedBlobs(root))), null, "untouched");

    writeFileSync(join(root, FROZEN_DIR, "src", "x.mjs"), "export const x = 2;\n");
    writeFileSync(join(root, FROZEN_DIR, "src", "z.mjs"), "export const z = 1;\n");
    git(root, "mv", "outside.txt", `${FROZEN_DIR}src/moved-in.txt`);
    chmodSync(join(root, FROZEN_DIR, "src", "y.mjs"), EXECUTABLE);
    git(root, "add", "--", ".");
    assert.deepEqual(breaches(frozen, trackedBlobs(root)), {
      added: [`${FROZEN_DIR}src/moved-in.txt`, `${FROZEN_DIR}src/z.mjs`],
      changed: [`${FROZEN_DIR}src/x.mjs`, `${FROZEN_DIR}src/y.mjs`],
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("THE REAL READER: deleting files, and then the whole directory, is not refused", () => {
  const { root, frozen } = repoWithFrozenDir();
  try {
    git(root, "rm", "-q", `${FROZEN_DIR}src/y.mjs`);
    assert.equal(refusalFor(breaches(frozen, trackedBlobs(root))), null, "one file deleted");
    git(root, "rm", "-q", `${FROZEN_DIR}src/x.mjs`);
    assert.deepEqual(trackedBlobs(root), {}, "the directory is empty to the reader");
    assert.equal(refusalFor(breaches(frozen, trackedBlobs(root))), null, "all deleted");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
