// pnpm loads this file BEFORE it resolves, fetches or links anything, which makes it the only place a
// refusal can come early enough: a root `preinstall` runs after the links are written (measured on #2297).
//
// WHY THIS EXISTS: most worktrees on the agent host have `node_modules` as a SYMLINK into the primary
// checkout, and pnpm follows it. It does not install "into the worktree"; it rewrites whatever the link
// points at -- npm's layout renamed to `.ignored_*`, a `.pnpm` tree added, ~21,000 entries changed in the
// measurement -- and the primary's `node_modules` serves every session on the host.
//
// It REFUSES rather than replaces: `rm node_modules` on a symlink removes the link and touches nothing
// behind it, and the person running that decides whether the primary's copy is still wanted.
/* global __dirname -- CommonJS; eslint.config.js has no `.cjs` globals block */
const fs = require("node:fs");
const path = require("node:path");

const location = path.join(__dirname, "node_modules");
if (fs.lstatSync(location, { throwIfNoEntry: false })?.isSymbolicLink()) {
  throw new Error(
    `pnpm refused to install: ${location} is a symlink to ${fs.readlinkSync(location)}, and pnpm rewrites `
    + `what a symlink points at. Remove the link, not what it points at: rm '${location}' (no trailing `
    + `slash, no -r), then install again.`,
  );
}

module.exports = {};
