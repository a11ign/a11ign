// @ts-check
// WHERE IS THIS FILE OF PACKAGE X? -- the answer a test needs to read a layer package's file BY NAME, and the same
// answer in the monorepo (a workspace link) and in an install from the registry (a copy) (#2613, child 1b of #69).
//
// A test that asserts something about `nvda-worker`'s SOURCE TEXT (a `.mjs` it cannot import because guidepup throws at
// module load without a screen reader, a `.cmd`, a `package.json`) used to spell `../../nvda-worker/src/x.mjs`. That path
// is true in this tree and nowhere else: when the layer leaves for its own repository the test is red for a reason that
// has nothing to do with what it checks. `layerFile("@a11ign/nvda-worker", "src/x.mjs")` names the PACKAGE, and node's own
// lookup decides where it is.
//
// THREE REFUSALS, each named, because each is a way for a resolver to answer a question it should not:
//   - a package that is NOT INSTALLED is refused, naming it. It never falls back to `packages/<name>/`: that fallback is
//     the very reach this exists to remove, and it would make the test green in the one tree where the layer is absent.
//   - a file that is NOT IN THE PACKAGE'S PUBLISHED `files` is refused. A test that reads it would pass here and fail
//     against the tarball, so it has to travel with the layer (or the file has to be published), and saying so is the point.
//   - a published file the package does not actually hold is refused too, so "returns a path" always means "the file is there".
//
// The lookup is `node_modules/<name>/package.json` walking up from `from`, not `require.resolve`: a package whose `exports`
// map omits `./package.json` throws ERR_PACKAGE_PATH_NOT_EXPORTED there, and the manifest is the one file every package has.
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, posix } from "node:path";

/** npm packs these whatever `files` says, so they are published without being listed. */
const ALWAYS_PUBLISHED = /^(?:package\.json|(?:README|LICENSE|LICENCE|CHANGELOG)(?:\.[^/]*)?)$/i;

/**
 * The directory of `name` as node would find it from `from`: real path, so a workspace link and an installed copy both
 * answer with the directory that holds the files.
 * @param {string} name
 * @param {string} from
 * @returns {string | undefined}
 */
export function installedPackageDir(name, from) {
  for (let dir = from; ; dir = dirname(dir)) {
    const candidate = join(dir, "node_modules", ...name.split("/"));
    if (existsSync(join(candidate, "package.json"))) return realpathSync(candidate);
    if (dirname(dir) === dir) return undefined;
  }
}

/**
 * A `files` entry as a matcher over a posix-relative path: a directory names everything under it, `*` stays in a segment.
 * @param {string} entry
 */
function matcherFor(entry) {
  const pattern = posix.normalize(entry.replace(/^\.\//, "")).replace(/\/$/, "");
  const source = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*\/|\*\*|\*/g, (glob) => (glob === "**/" ? "(?:.*/)?" : glob === "**" ? ".*" : "[^/]*"));
  return new RegExp(`^${source}(?:/.*)?$`);
}

/**
 * Whether npm would put `rel` in the tarball, by the manifest's `files` list: an entry includes, a `!entry` excludes.
 * No `files` list publishes everything, which is what npm does.
 * @param {{ files?: string[] }} manifest
 * @param {string} rel posix path relative to the package root
 */
export function isPublished(manifest, rel) {
  if (ALWAYS_PUBLISHED.test(rel)) return true;
  if (!Array.isArray(manifest.files)) return true;
  const included = manifest.files.filter((f) => !f.startsWith("!")).some((f) => matcherFor(f).test(rel));
  const excluded = manifest.files.filter((f) => f.startsWith("!")).some((f) => matcherFor(f.slice(1)).test(rel));
  return included && !excluded;
}

/**
 * The absolute path of `rel` inside installed package `name`.
 * @param {string} name package name, as an import would spell it: `@a11ign/nvda-worker`
 * @param {string} rel posix path from the package root: `src/capture-core.mjs`
 * @param {{ from?: string }} [options] where to start looking; the caller's cwd by default
 * @returns {string}
 */
export function layerFile(name, rel, { from = process.cwd() } = {}) {
  if (isAbsolute(rel) || posix.normalize(rel).startsWith("..")) {
    throw new Error(`layerFile: "${rel}" is not a path inside ${name} -- name it relative to the package root`);
  }
  const dir = installedPackageDir(name, from);
  if (dir === undefined) {
    throw new Error(`layerFile: ${name} is not installed (looked for node_modules/${name} from ${from} upward). `
      + "Refusing to fall back to the monorepo path: that reach is what reading by package name replaces.");
  }
  const manifest = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  const clean = posix.normalize(rel);
  if (!isPublished(manifest, clean)) {
    throw new Error(`layerFile: ${clean} is not in ${name}'s published files (${JSON.stringify(manifest.files)}). `
      + "A test that reads it passes in the monorepo and fails against the installed package: it travels with the layer, "
      + "or the file has to be published.");
  }
  const found = join(dir, clean);
  if (!existsSync(found)) {
    throw new Error(`layerFile: ${name} publishes ${clean} but holds no such file (looked in ${dir}).`);
  }
  return found;
}
