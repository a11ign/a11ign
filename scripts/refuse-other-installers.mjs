// @ts-check
// command: the root `preinstall`: refuses any installer that is not pnpm (#2897, row 10 of 10 of "Finish the move to pnpm")
// Refuses `npm install`, `yarn`, `bun` and anything else that is not pnpm: the install exits non-zero and says why.
//
// ## Why it exists
//
// An untracked `package-lock.json` dated 2026-09-24T18:29Z sat in the primary checkout after the move to
// pnpm: someone ran `npm install` and nothing said no. A tree that two managers have installed into does not resolve the
// same way twice (`node_modules` laid out flat by one, linked by the other), so "which manager" is a refusal here and not
// a habit.
//
// ## Why it is a small node script and not `npx only-allow pnpm`
//
// `only-allow` is fetched from the registry at run time, which is the opposite of the reason the dependency tree is
// pinned. This file reaches nothing outside the repository and node itself, so the CHECK costs no network and cannot be
// broken by one (what the installer had already fetched before it ran this is the next section): it imports `node:` built-ins and `cli-flags.mjs` BY RELATIVE PATH (the shape `build-packages.mjs` and
// `install-git-hooks.ts` use for the same reason: it runs BEFORE `node_modules` exists, so a package specifier would not
// resolve), and `cli-flags.mjs` itself imports built-ins only. `one-package-manager.test.ts` pins that, and that no import
// is a network-capable built-in and nothing calls `fetch`.
//
// ## What it reads, and why unknown is not pnpm
//
// `npm_config_user_agent`, which npm, pnpm, yarn and bun all set for the scripts they run (`pnpm/10.34.5 npm/? node/v22.22.1
// linux x64` under pnpm, `npm/10.9.2 node/...` under npm). Corepack's `pnpm` sets pnpm's. A MISSING or EMPTY value is refused
// like an npm one: a lifecycle script that cannot tell who is running it cannot vouch for them, and the only caller that
// sets none is a hand-run `node scripts/refuse-other-installers.mjs`, for whom a refusal is the honest answer.
//
// ## What it cannot stop: npm fetches and writes FIRST, and only then runs the root `preinstall`
//
// Measured with npm 9.2.0 on this repository's real manifest, 2026-10-02: `npm install` fetched and extracted the whole
// dependency tree (226 top-level entries in `node_modules`, 350 MB) and wrote a `package-lock.json` (362 `resolved` entries)
// BEFORE it ran this script, which then failed the command. So the refusal is real (non-zero, naming pnpm) and it is NOT
// early: a lifecycle script is the wrong tool for stopping a fetch, and no edit to this file can change that. Hence
// `.gitignore` carries `package-lock.json` and `npm-shrinkwrap.json` (the other half of this lock), `node_modules` was ignored
// already, and the refusal says to delete what the tool left behind.
//
// The EARLY refusal exists and was measured too: `"engines": {"npm": "<not a range>"}` in the manifest plus
// `engine-strict=true` in `.npmrc` makes npm stop with EBADENGINE before it fetches or writes anything, and pnpm installs
// normally. It is not in this change because `engine-strict` is global (pnpm then also refuses a dependency whose `engines`
// the box's node does not satisfy, which reaches the fleet's workers) and `.npmrc` is outside this row's Region: filed as its
// own row, #2958.
//
// ## What it does not catch, on purpose
//
// The registry gates (`registry-consumer-gate.mjs`, `release-publish-rehearsal.ts`) and the consumer half of
// `isolation-gate.mjs` run `npm install a11ign` / `npm publish` in a temporary directory with NO root manifest, so this
// `preinstall` never sees them. `one-package-manager.test.ts` pins that the directories they use are outside this manifest.
//
// ## Fail closed when run, inert when imported
//
// The test imports `refusalFor`, and importing must not exit (`entry-points.test.ts`). The entry guard is the realpath'd form
// every program in this tree carries, so a checkout reached through a symlink still RUNS the check: a lock that switches
// itself off on a path it cannot resolve is the defect this row exists to remove, and the test runs it through a symlink.

import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { refuseUnknownFlags } from "./cli-flags.mjs";

const PNPM_USER_AGENT = /^pnpm\//;

/**
 * The message when `userAgent` is not pnpm's, or `null` when it is. A missing agent (`undefined`) is refused, never passed.
 * @param {string | undefined} userAgent the value of `npm_config_user_agent`
 * @returns {string | null}
 */
export function refusalFor(userAgent) {
  if (typeof userAgent === "string" && PNPM_USER_AGENT.test(userAgent)) return null;
  const tool = userAgent?.trim().split(" ")[0];
  const seen = tool ? `\`${tool}\`` : "no package manager at all (`npm_config_user_agent` is empty)";
  return [
    `This repository installs with pnpm only, and this install was started by ${seen}.`,
    "Use `pnpm install` (or `corepack pnpm install` where `pnpm` is not on PATH): `corepack enable` provides it,",
    "and the exact version is the `packageManager` pin in package.json.",
    "That tool may already have written a node_modules and a lockfile before this ran: delete both (git ignores both) and run pnpm install.",
  ].join("\n");
}

function main() {
  // Takes no flags: pnpm runs `preinstall` with none, and a stray one is a typo worth naming.
  refuseUnknownFlags([], { entry: import.meta.url, command: "node scripts/refuse-other-installers.mjs" });
  const refusal = refusalFor(process.env.npm_config_user_agent);
  if (refusal === null) return;
  console.error(refusal);
  process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ? realpathSync(process.argv[1]) : "").href) main();
