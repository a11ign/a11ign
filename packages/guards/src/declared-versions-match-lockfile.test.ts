/**
 * ADR 0045 cut 9 (#5087), epic #4425 done-when 4: EVERY `@a11ign/*` ENTRY A MANIFEST DECLARES IS THE VERSION THE LOCKFILE RESOLVES.
 *
 * The staleness the epic named was a declared version (`0.1.0`) that no install had resolved for a long time, because nothing read the declaration against the
 * resolution. `pnpm install --frozen-lockfile` only proves the lockfile's recorded SPECIFIER equals the manifest's; it says nothing about whether the declared
 * floor is what is actually installed, and a caret range hides a floor that fell three minors behind. Two shapes are read, for the root and every `packages/*`:
 *
 *   1. A REGISTRY entry (`version: 0.9.0(...)`): the declared range's floor, `^` and `~` removed, is exactly the resolved version. `^0.9.0` resolving 0.9.0 is
 *      declared; `^0.5.1` resolving 0.9.0 is stale and is refused naming both.
 *   2. A WORKSPACE link (`version: link:../evidence`): the declared version is exactly the version of the package it links to.
 *
 * POSITIVE CONTROL, in this file: the real tree is asserted to hold registry entries AND links, so neither branch is vacuous, and each function is run over a
 * fixture that breaks it one way and must say so for its own reason.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

const REPO = fileURLToPath(new URL("../../../", import.meta.url));
const SCOPE = "@a11ign/";
const SECTIONS = ["dependencies", "devDependencies", "optionalDependencies"] as const;

type Manifest = { name?: string; version?: string } & Partial<Record<(typeof SECTIONS)[number], Record<string, string>>>;
type Resolved = { specifier: string; version: string };
type Importer = Partial<Record<(typeof SECTIONS)[number], Record<string, Resolved>>>;
type Lock = { importers: Record<string, Importer> };
type Declared = { importer: string; name: string; range: string };

/** The `@a11ign/*` entries of one manifest, as the importer they belong to declares them. */
function declaredIn(importer: string, manifest: Manifest): Declared[] {
  return SECTIONS.flatMap((section) => Object.entries(manifest[section] ?? {}))
    .filter(([name]) => name.startsWith(SCOPE)).map(([name, range]) => ({ importer, name, range }));
}

/** The resolved version a lockfile entry records, without the peer-dependency suffix pnpm appends in parentheses. */
const resolvedVersion = (version: string) => version.replace(/\(.*$/, "");

const lockedEntry = (lock: Lock, { importer, name }: Declared): Resolved | undefined =>
  SECTIONS.map((section) => lock.importers[importer]?.[section]?.[name]).find((entry) => entry !== undefined);

/** Every declared entry that is not the version the lockfile resolves: a sentence each, naming the importer, the package, the declaration and the resolution. */
function staleDeclarations({ declared, lock, workspaceVersions }: { declared: Declared[]; lock: Lock; workspaceVersions: Record<string, string> }): string[] {
  return declared.flatMap((entry) => {
    const locked = lockedEntry(lock, entry);
    const where = `${entry.importer} declares ${entry.name} ${entry.range}`;
    if (locked === undefined) return [`${where}, which the lockfile does not record for that importer`];
    if (locked.version.startsWith("link:")) {
      const actual = workspaceVersions[entry.name];
      return actual === entry.range ? [] : [`${where}, which links to the workspace package at ${actual}`];
    }
    const floor = entry.range.replace(/^[\^~]/, "");
    const resolved = resolvedVersion(locked.version);
    return floor === resolved ? [] : [`${where}, which the lockfile resolves to ${resolved}`];
  });
}

function readManifests(root: string): { declared: Declared[]; workspaceVersions: Record<string, string> } {
  const read = (path: string) => JSON.parse(readFileSync(join(root, path), "utf8")) as Manifest;
  const packages = readdirSync(join(root, "packages"), { withFileTypes: true }).filter((entry) => entry.isDirectory())
    .filter((entry) => existsSync(join(root, "packages", entry.name, "package.json")))
    .map((entry) => `packages/${entry.name}`);
  const importers = [".", ...packages];
  const manifests = importers.map((importer) => [importer, read(join(importer, "package.json"))] as const);
  return {
    declared: manifests.flatMap(([importer, manifest]) => declaredIn(importer, manifest)),
    workspaceVersions: Object.fromEntries(manifests.filter(([, manifest]) => manifest.name?.startsWith(SCOPE)).map(([, manifest]) => [manifest.name!, manifest.version ?? ""])),
  };
}

const FLOOR_OF_DECLARATIONS = 8;

test("every @a11ign/* entry a manifest declares is the version the lockfile resolves", () => {
  const lock = parseYaml(readFileSync(join(REPO, "pnpm-lock.yaml"), "utf8")) as Lock;
  const { declared, workspaceVersions } = readManifests(REPO);
  assert.ok(declared.length >= FLOOR_OF_DECLARATIONS, `the read found ${declared.length} declarations: it is not looking at the manifests`);
  const links = declared.filter((entry) => lockedEntry(lock, entry)?.version.startsWith("link:"));
  assert.ok(links.length > 0 && links.length < declared.length, "POSITIVE CONTROL: the tree holds both workspace links and registry entries, so neither branch below is vacuous");
  assert.deepEqual(staleDeclarations({ declared, lock, workspaceVersions }), []);
});

test("POSITIVE CONTROL: a floor behind the resolution, a link at another version and an entry the lockfile lacks are each REFUSED, naming both ends", () => {
  const lock: Lock = { importers: { ".": { dependencies: {
    "@a11ign/fleet": { specifier: "^0.5.1", version: "0.9.0(@a11ign/scorer@packages+scorer)" },
    "@a11ign/current": { specifier: "^0.9.0", version: "0.9.0(typescript@6.0.3)" },
    "@a11ign/judge": { specifier: "0.2.0", version: "link:packages/judge" },
    "@a11ign/evidence": { specifier: "0.2.0", version: "link:packages/evidence" },
  } } } };
  const workspaceVersions = { "@a11ign/judge": "0.2.3", "@a11ign/evidence": "0.2.0" };
  const declared: Declared[] = [
    { importer: ".", name: "@a11ign/fleet", range: "^0.5.1" },
    { importer: ".", name: "@a11ign/current", range: "^0.9.0" },
    { importer: ".", name: "@a11ign/judge", range: "0.2.0" },
    { importer: ".", name: "@a11ign/evidence", range: "0.2.0" },
    { importer: "packages/x", name: "@a11ign/missing", range: "1.0.0" },
  ];
  assert.deepEqual(staleDeclarations({ declared, lock, workspaceVersions }), [
    ". declares @a11ign/fleet ^0.5.1, which the lockfile resolves to 0.9.0",
    ". declares @a11ign/judge 0.2.0, which links to the workspace package at 0.2.3",
    "packages/x declares @a11ign/missing 1.0.0, which the lockfile does not record for that importer",
  ]);
});
