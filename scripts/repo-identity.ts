// @ts-check
// THE ONE DECLARED VALUE for this repository's own name — issue #92.
//
// Written out by hand in 38 places across 25 files before this existed, because GitHub's redirect from an
// old URL makes every wrong reference keep working silently: nothing breaks the day the org moves, and a
// missed site is found weeks later by someone wondering why a link is dead or a deploy pulled nothing.
// #63 (the actual org transfer) is what changes this value; this file exists so that day is one edit here
// plus a failing test naming every site that still disagrees, rather than a hunt through 25 files under
// time pressure.
//
// CHANGED 2026-09-18 BY #63 ITSELF -- the day this file was written for. The transfer landed
// (`a11ign/a11ign`, repo id 1280353940 unchanged), so `REPO` follows it and every site that was
// deliberately still citing the old name because `https://github.com/a11ign/a11ign` 404d now resolves.
// The two constants are NOT merged even though they agree today: they answer different questions, and
// the next rename would split them again.
//
// NOT a claim about where the repository lives after any future transfer — it is what the name IS today.
// Every reference that cannot import anything (a `package.json` field, a workflow string, prose) is a literal, and
// `repo-identity-consolidated.test.ts` pins each one against these constants instead.
//
// ADR 0045 cut (b) (#5459): `REPO` LOADS NOTHING FROM THE ORG TOOL. It was read from `.agent-org/project.json` through the tool's
// project reader (#2616), which made every product script that imports this file need a tool checkout on disk, and a runner
// has none until a job clones one. It is now what `gh` itself resolves: `$GITHUB_REPOSITORY` in CI, else the `origin` remote of
// this checkout. It REFUSES when neither names a repository rather than answering a literal, for the reason #2616 gave: a fallback
// here would answer for a checkout that is not this project's.
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { sandboxGitEnv } from "../packages/guards/src/git-env.ts";

// No TypeScript-only syntax below, the way the file was before: a worker loads this file natively, and the coverage provider parses
// what it loaded as plain JavaScript, so a `: string` return type made `pnpm run coverage` exit 1 with every test passing.
const CHECKOUT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OWNER_SLASH_NAME = /^[\w.-]+\/[\w.-]+$/;
const GITHUB_REMOTE = /github\.com[:/]([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/;

/** @returns {string} the `origin` remote URL; throws when this checkout has none. */
function originRemote() {
  try {
    return execFileSync("git", ["remote", "get-url", "origin"], { cwd: CHECKOUT, env: sandboxGitEnv(), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch (cause) {
    throw new Error("repo-identity: $GITHUB_REPOSITORY is unset and this checkout has no `origin` remote to read, so there is no repository to name", { cause });
  }
}

/** @returns {string} `owner/name`, from `$GITHUB_REPOSITORY` else the `origin` remote; throws when neither names one. */
function resolveRepo() {
  const fromRunner = process.env.GITHUB_REPOSITORY?.trim();
  if (fromRunner && OWNER_SLASH_NAME.test(fromRunner)) return fromRunner;
  const remote = originRemote();
  const named = GITHUB_REMOTE.exec(remote)?.[1];
  if (!named) throw new Error(`repo-identity: $GITHUB_REPOSITORY is unset and the \`origin\` remote (${JSON.stringify(remote)}) is not a github.com repository`);
  return named;
}

export const REPO = resolveRepo();
export const REPO_URL = `https://github.com/${REPO}`;
export const REPO_GIT_URL = `${REPO_URL}.git`;

// #66 (the rename, 2026-09-07) SPLIT ONE FACT INTO TWO, on the CEO's ruling. Before it, "the repository's
// name" was a single question. It no longer is:
//
//   - REPO (above) answers "where does `gh`/git actually resolve TODAY" -- the operational identity every
//     live API call needs, and it is unchanged: the repository itself does not move until #63 actually
//     transfers it, so `row-claim.mjs`/`board-data.mjs` passing anything else to `--repo` would fail
//     every fleet-wide GitHub call the moment this landed.
//   - PRODUCT_REPO (below) answers "what does the product call itself NOW" -- clone instructions,
//     package.json `repository`/`homepage` fields, and every other piece of STATIC prose that #66 renamed
//     ahead of the transfer, deliberately, so the tree reads correctly before 15 September rather than
//     waiting for the day the repository itself moves.
//
// Exceptions inside PRODUCT_REPO's own territory, all live GitHub fetches or executions rather than prose
// a reader interprets: a `uses: <owner>/<repo>@main` line still has to resolve on GitHub TODAY,
// and (#569, found by the V1 rehearsal) so does a CI badge -- it is an image fetched the instant the page
// renders, before any surrounding prose about the rename is read. `https://github.com/a11ign/a11ign` 404s
// until #63 lands, so both keep citing REPO, not PRODUCT_REPO, until #325 (the transfer rehearsal) changes
// them once #63 makes PRODUCT_REPO true operationally too. `repo-identity-consolidated.test.ts`'s SITES
// list is which sites use which constant.
//
// THESE ARE INSTANCES OF A WIDER RULE, NOT SPECIAL CASES -- #647, after `uses:` lines, badges, and
// provisioning clone targets (found wrong, #604) all needed the SAME answer independently, and auditing
// the rest of SITES against that answer found four more of the identical shape (#647): getting-started
// guides' own literal `git clone`/`curl | bash`/`irm | iex` steps. Before adding a new SITES entry, ask:
// does something -- a human copying a command verbatim, or a machine with no human in the loop -- RESOLVE
// this URL as a normal, unmediated step of using this repository TODAY? If yes, REPO. If it is prose a
// reader reads, interprets, and would naturally substitute the current name into (a mention in passing, a
// metadata field nobody automatically visits, a hyperlink a reader consciously clicks and can recover
// from), PRODUCT_REPO is correct. See `repo-identity-consolidated.test.ts`'s own header for the full
// reasoning and worked examples.
//
// PRODUCT_REPO STAYS A LITERAL, deliberately: it is the product's NAME, which no remote or runner variable carries -- they say
// where `gh` resolves. Computing both from one value would merge the two meanings this comment exists to keep apart, and the
// day the project's repository moves they would be the constants that must differ.
export const PRODUCT_REPO = "a11ign/a11ign";
export const PRODUCT_REPO_URL = `https://github.com/${PRODUCT_REPO}`;
export const PRODUCT_GIT_URL = `${PRODUCT_REPO_URL}.git`;
