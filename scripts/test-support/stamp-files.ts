/**
 * The provision stamp's `$ENVIRONMENT_FILES`, as the stamp itself resolves it (ADR 0039 item 6d, #3397).
 *
 * Two of the five entries are READ by the stamp -- the launcher the worker PUBLISHES (`launcher/run-server.cmd` inside the
 * installed `@a11ign/screenreader-worker`, ADR 0045 cut 6, #5084), the foreground-lock script from the layer's `launcher-reach.cmd` (a stand-in here, #3447) -- so a test that parsed only the quoted
 * lines would see three; and the first is a `(Get-LayerFile ...)` call (#4579), which neither form matches. This returns all five, in the stamp's order, from the SAME two files the script
 * reads and not from a restated copy of its answer. The order is the contract: the hash is taken over the
 * entries in sequence.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = fileURLToPath(new URL("../../", import.meta.url));

/**
 * The launcher the stamp hashes for `$RUN_SERVER`: the file the worker publishes in its own package, at the installed version. It is
 * read from `node_modules`, never from a laid copy of the worker's source (a repository never reads another's source, ADR 0045 Decision 1).
 */
export const PUBLISHED_LAUNCHER = "node_modules/@a11ign/screenreader-worker/launcher/run-server.cmd";

/** A stamp that lists the worker's SOURCE tree is refused: nothing lays it any more, so the entry would hash a file no checkout holds. */
const LAID_WORKER = new RegExp(`\\bpackages/${"nvda-worker"}\\b`);

/** The layer's directory as `layers.json` declares it, forward-slashed. */
export function declaredLayerPath(layer: string, root = REPO): string {
  const manifest = JSON.parse(readFileSync(join(root, "layers.json"), "utf8"));
  return manifest.layers[layer].path;
}

/** One `set "NAME=value"` line of a launcher declaration, forward-slashed; `undefined` when it does not say. */
export function declaredReach(declaration: string, name: string): string | undefined {
  const line = declaration.split(/\r?\n/).map((l) => new RegExp(`^set "${name}=(.+)"\\s*$`).exec(l)).find(Boolean);
  return line?.[1].replaceAll("\\", "/");
}

/** The declaration the stamp reads, as a stand-in: the layer's own file is not in this tree (see the stand-in's header). */
export const reachFile = (root = REPO) => join(root, "scripts/test-support/launcher-reach.stand-in.cmd");

/**
 * One entry of the list, by the form the stamp wrote it in: a quoted path, a bare `$VARIABLE` it reads, or a
 * `(Get-LayerFile -Layer '<layer>' -Relative '<path>')` call, which the stamp resolves against the layer's
 * own checkout and which this resolves against `layers.json` (an unknown layer throws).
 */
const ENTRY =
  /^\s*(?:'([^']+)'|(\$[A-Z_]+)|\(Get-LayerFile\s+-Layer\s+'([^']+)'\s+-Relative\s+'([^']+)'\))\s*$/gm;

function layerFile(layer: string, relative: string, root: string): string {
  const manifest = JSON.parse(readFileSync(join(root, "layers.json"), "utf8"));
  if (!manifest.layers[layer]) throw new Error(`the stamp lists a file of layer '${layer}', which layers.json does not declare`);
  return `${declaredLayerPath(layer, root)}/${relative}`;
}

/** `$ENVIRONMENT_FILES` of `stampSource`, with its read entries resolved from the declarations. */
export function stampEnvironmentFiles(stampSource: string, root = REPO): string[] {
  const start = stampSource.indexOf("$ENVIRONMENT_FILES = @(");
  const end = stampSource.indexOf("\n)", start);
  if (start === -1 || end <= start) throw new Error("could not find $ENVIRONMENT_FILES in the stamp script");
  const entries = [...stampSource.slice(start, end).matchAll(ENTRY)];
  for (const [, quoted] of entries) {
    if (quoted && LAID_WORKER.test(quoted)) throw new Error(`the stamp lists '${quoted}', a path under the worker's laid source, which nothing lays (use the published launcher: ${PUBLISHED_LAUNCHER})`);
  }
  const resolved: Record<string, string | undefined> = {
    $RUN_SERVER: PUBLISHED_LAUNCHER,
    $FOREGROUND_LOCK: declaredReach(readFileSync(reachFile(root), "utf8"), "FLT"),
  };
  return entries.map(([, quoted, variable, layer, relative]) => {
    if (layer) return layerFile(layer, relative, root);
    return quoted ?? resolved[variable] ?? (() => { throw new Error(`the stamp lists ${variable}, which nothing resolves`); })();
  });
}
