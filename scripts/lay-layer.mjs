#!/usr/bin/env node
// @ts-check
// command: lay a layer's code at the path this repository's readers expect, from the release the lockfile pins (#3504)
//
// WHY THIS EXISTS. `packages/worker-fleet/` left the workspace for `a11ign/screenreader-fleet` (#3504), and `control` imports its source by
// relative path and CANNOT import it by name: it runs from a raw checkout with no `node_modules` (ADR 0012, `control-has-no-dependencies.test.ts`).
// ADR 0039 item 6 answers that with a declared second checkout at the path the monorepo used, `layers.json` at the root. A host gets it
// from `fleet:deploy`; a CI runner and an agent's worktree get it from THIS, so `control`'s imports, and the tests that read the fleet's files,
// resolve in the tree they run in. It is untracked (`.gitignore`) and outside the workspace (`pnpm-workspace.yaml`), so it never reaches a commit
// or the lockfile.
//
// THE PIN IS THE LOCKFILE'S, NOT A SECOND ONE. The release the root imports from the registry names the tag to lay, `<package>@<version>`: what
// `control` reads and what `a11ign` installs cannot name two builds. A lockfile that holds no registry entry for the package is REFUSED, never
// answered with `main`.
//
// A LAYER THAT IS NOT ON THE REGISTRY DECLARES ITS OWN TAG (#3505). `lab` is `private: true` and never published, so the lockfile has no entry
// to read and the pin is the `tag` field of its own declaration in `layers.json`: still ONE place, and still a tag, never a branch. It is declared
// under `pinned`, not `layers`: `layers` are the ones a guest and a lab job must hold a pinned checkout of, and nothing on a worker runs the lab. A declaration
// with a `tag` is never answered from the lockfile, and a declaration whose tag is not a `v<semver>` is REFUSED (a branch name moves under a
// checkout that did not touch it). `lays` names what to lay when it is more than `src/`: `lab`'s root scripts, its baselines, `rule-ownership.json` and `CLAUDE.md`
// are read by path from the rest of the tree.
//
// `control` IS LAID THE SAME WAY, AND READS THE DECLARATION THAT LAYS IT (#3506). `layers.json` moved from `packages/control/` to the root, because
// a file inside a directory that is laid and untracked cannot say which tag to lay it at. `control`'s own readers still open `../layers.json` from
// their `src/`, so `declares` names that file and `lay` WRITES this repository's copy there, over whatever the tag holds: one declaration, never two.
// `keeps` names the files an operator holds INSIDE the laid directory (the untracked `inventory.yml`, `*.local.yml`): a re-lay wipes the directory,
// so it carries those across, and a layer that declares none is wiped whole as before.
//
// THE SOURCE IS LAID, NOT THE PACKAGE: `src/` (less its own tests) and nothing that names it a package (`package.json`, `tsconfig.json`, the build config). Every walker
// here that finds packages (`allPackages`, the build, the start guard's member scope, `ci-changed`) asks for a manifest first, so a laid directory
// without one is invisible to them, and what `control` imports and the tests read is all under `src/`. The registry copy in `node_modules` is the package.
//
// NOT A SUBMODULE (ADR 0039 item 6 rejected it) and NOT A COPY OF THE TARBALL: the registry package ships `dist/`, not the `src/*.mjs` that
// `control` imports.
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { sandboxGitEnv } from "../packages/guards/src/git-env.mjs";
import { refuseUnknownFlags } from "./cli-flags.mjs";

const REPO_ROOT = resolve(fileURLToPath(new URL("../", import.meta.url)));
/** Written beside the laid code, so a second run can tell "already at this tag" from "something else is here". */
export const REF_FILE = ".layer-ref";
/** The layer's own tests run in its own repository; laid here they would join `test:all` and fail on what that repository gives them. */
const TESTS = /\.test\.(?:ts|mts|mjs)$/;

/**
 * The version the root's registry entry for `name` holds in `pnpm-lock.yaml`, or the reason there is none.
 * Read from the text so this file imports no YAML reader: the root importer's block is the one line after the name.
 * Line breaks are `\r?\n`: a Windows runner checks the lockfile out with CRLF (git's `core.autocrlf` default there, and the repository carries no
 * `.gitattributes`), and a reader spelling `\n` alone refused it at install (#3787).
 * @param {string} lockfile
 * @param {string} name
 * @returns {{ version: string } | { refusal: string }}
 */
export function pinnedVersion(lockfile, name) {
  const block = lockfile.match(new RegExp(`^ {6}'${name.replace(/[/.]/g, "\\$&")}':\\r?\\n {8}specifier: [^\\r\\n]+\\r?\\n {8}version: ([^\\r\\n]+)$`, "m"));
  if (!block) return { refusal: `pnpm-lock.yaml has no importer entry for ${name}` };
  const version = block[1].replace(/\(.*$/, "");
  if (!/^\d+\.\d+\.\d+/.test(version)) {
    return { refusal: `${name} is "${version}" in pnpm-lock.yaml, not a registry release: there is no tag to lay (a link: means the package is still in the workspace)` };
  }
  return { version };
}

/** What a declared tag looks like: `v` and a semver. A branch or a bare sha is not a pin. */
const DECLARED_TAG = /^v\d+\.\d+\.\d+$/;
/** @typedef {{ path: string, remote?: string, tag?: string, lays?: string[], declares?: string, keeps?: string[] }} Declaration */
/** @typedef {{ remote: string, tag: string, path: string, lays: string[], declares?: string, keeps?: string[] }} LayingPlan */
/** What `lay` puts down when a declaration names nothing else. */
const DEFAULT_LAYS = ["src"];

/**
 * The tag to lay: the declaration's own when it has one (a layer that is not on the registry), else the release the lockfile pins.
 * @param {{ tag?: string }} entry
 * @param {string} lockfile
 * @param {string} layer
 * @returns {{ tag: string } | { refusal: string }}
 */
function tagToLay(entry, lockfile, layer) {
  if (entry.tag !== undefined) {
    if (!DECLARED_TAG.test(entry.tag)) return { refusal: `layer "${layer}" declares tag "${entry.tag}", which is not a v<semver> tag: a branch or a sha is not a pin` };
    return { tag: entry.tag };
  }
  const name = `@a11ign/${layer}`;
  const pinned = pinnedVersion(lockfile, name);
  if ("refusal" in pinned) return pinned;
  return { tag: `${name}@${pinned.version}` };
}

/**
 * What to lay, from the manifest and the lockfile: the repository, the tag, the path inside the repository, what of it to lay, and the path here.
 * The layer's repository keeps the directory at the same path it had in the monorepo (ADR 0040), so `path` names both ends.
 * @param {{ layers: Record<string, Declaration>, pinned?: Record<string, Declaration> }} manifest
 * @param {string} lockfile
 * @param {string} layer
 * @returns {LayingPlan | { refusal: string }}
 */
export function layingPlan(manifest, lockfile, layer) {
  const declared = [manifest.layers, manifest.pinned ?? {}].find((section) => Object.hasOwn(section, layer));
  const entry = declared?.[layer];
  if (!entry?.remote) return { refusal: `layer "${layer}" is not declared with a remote in layers.json` };
  const pinned = tagToLay(entry, lockfile, layer);
  if ("refusal" in pinned) return pinned;
  return { remote: entry.remote, tag: pinned.tag, path: entry.path, lays: entry.lays ?? DEFAULT_LAYS,
    ...(entry.declares === undefined ? {} : { declares: entry.declares }), ...(entry.keeps === undefined ? {} : { keeps: entry.keeps }) };
}

/** @param {string[]} args @param {string} cwd */
const git = (args, cwd) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"], env: sandboxGitEnv() }).trim();

/**
 * Why a directory that holds a `.git` is NOT disposable, or null when it is: `bootstrap-control-plane.sh` and `deploy.yml` once made the layer's path a
 * clone, and a host that still has one must migrate to the laid copy once (#3826 item 4), which is only safe when nothing in it exists nowhere else.
 * Two things are work: a tree that differs from its commit (untracked files included), and a commit on a local ref that no remote ref holds. A git
 * that cannot answer is "cannot tell", never "disposable": a `.git` it does not open would make it read the repository ABOVE, which is this one.
 * @param {string} target
 * @returns {string | null}
 */
function whyNotDisposable(target) {
  try {
    if (realpathSync(git(["rev-parse", "--show-toplevel"], target)) !== realpathSync(target)) return "git does not open it as a repository of its own, so nothing says it is disposable";
    const reasons = [];
    if (git(["status", "--porcelain"], target)) reasons.push("it has uncommitted changes");
    if (git(["rev-list", "--max-count=1", "HEAD", "--branches", "--not", "--remotes"], target)) reasons.push("it has unpushed commits (on no remote ref)");
    return reasons.length ? reasons.join(" and ") : null;
  } catch (cause) {
    throw new Error(`NOT LAID: ${target} holds a .git and git could not say whether it is disposable`, { cause });
  }
}

/**
 * The files of `target` that `keeps` names, as `[path under target, bytes]`. A `*` stands for part of ONE file name and never for a directory, so a
 * pattern cannot reach further than the line that wrote it.
 * @param {string} target
 * @param {string[]} keeps
 * @returns {[string, Buffer][]}
 */
function keptFiles(target, keeps) {
  return keeps.flatMap((pattern) => {
    const directory = dirname(pattern);
    if (!existsSync(join(target, directory))) return [];
    const wanted = new RegExp(`^${pattern.slice(directory.length + 1).split("*").map((piece) => piece.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join("[^/]*")}$`);
    return readdirSync(join(target, directory)).filter((name) => wanted.test(name))
      .map((name) => /** @type {[string, Buffer]} */ ([join(directory, name), readFileSync(join(target, directory, name))]));
  });
}

/**
 * Whether `target` already holds exactly what `plan` would put there. The ref file alone is not "laid": a `git rebase` over the commit that deleted
 * the tracked fleet removed `src/` and left `.layer-ref`, and a second run that trusted the file said "already at" over an empty directory (#3504,
 * found at that rebase). Every part the declaration names, not `src/` alone: a declaration that gained a part at the same tag must lay it, not say
 * "already at". And the declaration's own copy (#3506): a root `layers.json` that changed at the SAME tag must reach the copy `control` reads.
 * @param {string} root
 * @param {string} target
 * @param {LayingPlan} plan
 */
function alreadyLaid(root, target, plan) {
  const refFile = join(target, REF_FILE);
  if (!existsSync(refFile) || readFileSync(refFile, "utf8").trim() !== plan.tag) return false;
  if (!plan.lays.every((part) => existsSync(join(target, part)))) return false;
  return plan.declares === undefined || (existsSync(join(target, plan.declares)) && readFileSync(join(target, plan.declares), "utf8") === readFileSync(join(root, "layers.json"), "utf8"));
}

/**
 * Put the layer's directory at `plan.path` under `root`, at `plan.tag`. Idempotent: a directory laid at the same tag is left alone; one laid at
 * another is replaced, since it is a copy and not work (what `plan.keeps` names is carried across, the one thing in it that is). A git clone is
 * replaced only when it is disposable (#3836), and otherwise REFUSED, naming the path and why: `pnpm install` runs this, and a clone with work in it
 * is not a copy.
 * @param {string} root
 * @param {LayingPlan} plan
 */
export function lay(root, plan) {
  const target = join(root, plan.path);
  if (alreadyLaid(root, target, plan)) return `already at ${plan.tag}`;
  const unsafe = existsSync(join(target, ".git")) ? whyNotDisposable(target) : null;
  if (unsafe) throw new Error(`NOT LAID: ${target} is a git clone and ${unsafe}; push or discard that work, or remove the directory, and run this again`);
  const scratch = mkdtempSync(join(tmpdir(), "lay-layer-"));
  try {
    git(["-c", "advice.detachedHead=false", "clone", "--quiet", "--depth", "1", "--branch", plan.tag, plan.remote, scratch], root);
    // A name the tag does not hold is a wrong declaration, never an empty layer, and it is read BEFORE the old copy goes.
    for (const part of plan.lays) {
      if (!existsSync(join(scratch, plan.path, part))) throw new Error(`NOT LAID: ${plan.tag} of ${plan.remote} holds no ${plan.path}/${part}`);
    }
    const kept = keptFiles(target, plan.keeps ?? []);
    rmSync(target, { recursive: true, force: true });
    mkdirSync(target, { recursive: true });
    for (const part of plan.lays) cpSync(join(scratch, plan.path, part), join(target, part), { recursive: true, filter: (path) => !TESTS.test(path) });
    for (const [path, bytes] of kept) writeFileSync(join(target, path), bytes);
    if (plan.declares) cpSync(join(root, "layers.json"), join(target, plan.declares));
    writeFileSync(join(target, REF_FILE), `${plan.tag}\n`);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
  return `laid ${plan.tag} at ${plan.path}`;
}

function main() {
  refuseUnknownFlags([], { entry: import.meta.url, command: "node scripts/lay-layer.mjs <layer>" });
  const layer = process.argv[2];
  if (!layer) throw new Error("usage: node scripts/lay-layer.mjs <layer>   (a key of layers.json)");
  const manifest = JSON.parse(readFileSync(join(REPO_ROOT, "layers.json"), "utf8"));
  const plan = layingPlan(manifest, readFileSync(join(REPO_ROOT, "pnpm-lock.yaml"), "utf8"), layer);
  if ("refusal" in plan) throw new Error(`NOT LAID: ${plan.refusal}`);
  console.log(lay(REPO_ROOT, plan));
}

if (import.meta.url === pathToFileURL(process.argv[1] ? realpathSync(process.argv[1]) : "").href) main();
