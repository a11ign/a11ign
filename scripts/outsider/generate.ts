#!/usr/bin/env node
// @ts-check
// command: regenerate scripts/outsider/outsider-job.yml from README.md's own Quickstart fence
// #3181 (part of #928, chairman 2026-10-03): the V1 rehearsal's mechanical half, run on EVERY release.
//
// WHAT THE OUTSIDE JOB IS FOR. `consumer-gate.yml` runs README's fence from inside `a11ign`, so it has an
// organisation's permissions, secrets and checkout habits that a reader does not. This generates the same fence
// as a workflow for a repository owned by an account that is NOT an `a11ign` member, starting from an EMPTY
// workspace, and it PASSES only if the documented path completes and the uploaded `a11ign-result.json` has the
// documented shape. It fails for the reason a reader's own copy would: the 2026-08-05 class (an untracked scorer
// no fresh clone could run) and the three publish-blockers #494 found.
//
// THE READERS ARE `generate-consumer-gate.ts`'S, NOT A SECOND SET. `extractDocumentedJobsBlock`, `pinActionRef`
// and `substituteTarget` are imported; that script is not edited, because `consumer-gate.yml`'s `check-pin`
// refuses any change to it until the pin is regenerated. The same three are what the drift check masks with, so
// "the workflow equals README's fence" and "the generator reads README's fence" cannot disagree about a line.
//
// HOW IT LEARNS OF A RELEASE WITHOUT A CREDENTIAL CROSSING THE BOUNDARY (ADR 0041; `main-review-requirement.md`).
// Both directions are PULLS of public data. The `poll` job runs on `schedule`, reads `npm view a11ign
// dist-tags.latest` and the release tag, and starts a `workflow_dispatch` run (the one event `GITHUB_TOKEN` may
// start) for a version with no completed run in its own history. `a11ign` reads this repository's public run list
// (`verdict.ts`). The dispatched run is NAMED `outsider v<version> <tag sha>`: that name is what the reader matches.
//
// THE PIN IS A LITERAL, AND THAT IS THE OPEN SEAM. `uses:` takes no expression, so the sha this file pins is
// baked at generation, and a new release needs the file regenerated with `--sha=<the tag's commit>` and committed
// to the outside repository. IT IS BAKED ONCE (#3221): the `uses:` line. The `pin` job reads that line out of the
// checked-out workflow file instead of carrying its own `pinned=` copy, and the summary does not restate it, because
// Dependabot's bump rewrites the `uses:` line and its `# v` comment and nothing else (#3182 found the other two
// copies left behind, so the first merged bump turned the `pin` job red for the release it had just refreshed). Nothing here can do that without a stored token (`workflows` is not a `GITHUB_TOKEN`
// permission). So the `pin` job REFUSES a run whose `sha` input is not the pinned one: a stale pin is a RED run
// named for the version it did not test, never a green one for a version it did. Who refreshes the pin is the next
// row's decision (the outside repository), and it is on #3181.
// RULED (product-manager, #3182 done-when 7): Dependabot's `github-actions` ecosystem on the outside repository bumps
// the pin, with no token. It bumps a sha pin reliably only with a trailing `# v<version>` comment, so
// `--version=<version>` writes one (and no `--version` writes none: a comment naming a release the sha is not the tag
// of would be false). The drift check, `--check` and `extractPinnedSha` all read past it. THE DRIFT CHECK READS PAST README'S
// COMMENT TOO, but only when the workflow's pin line carries a `# v<version>` (#4421): `--version` REPLACES README's trailing comment,
// so the two lines differ by exactly that comment, and the check masks the pin line's trailing comment on BOTH sides. A workflow
// whose comment is not a `# v<version>` (`# pinned by hand`) or is gone is not masked, so README's comment is compared as written
// and the difference is drift, as it is for a job generated without `--version`.
//
// MEASURED 2026-10-03 as `a11ign-ai-workers`, and both measurements are READINGS AT A MOMENT:
//
//   1. PUBLISH TO RUN. No release has gone through a poll (the outside repository does not exist yet), so the
//      end-to-end figure is INFERRED from three measured parts, not read:
//      - scheduled-run lateness, `gh api "repos/a11ign/a11ign/actions/workflows/nightly.yml/runs?event=schedule&per_page=100"
//        --jq '.workflow_runs[].created_at'`: 100 runs, 2026-09-17..2026-10-03, of a workflow whose hourly cron is
//        `37 * * * *`: gaps between consecutive runs median 3.7 h, max 7.2 h. The same call on
//        `registry-consumer-gate.yml` (one daily cron, `43 5 * * *`): 7 runs, each created 274..377 min late (median 339).
//        GitHub's schedule queue is the dominant term; an hourly cron is NOT an hourly run.
//      - dispatch to start, `gh api repos/a11ign/a11ign/actions/runs/<id>/jobs` over 9 `workflow_dispatch` runs of
//        `consumer-gate.yml` and `registry-consumer-gate.yml`: the run exists at the dispatch second, its first job
//        starts 2..5 s later, and the windows-2022 job starts 3..4 s after it is created.
//      - the windows-2022 job on a green run: 6:00 and 6:07 (two green `consumer-gate.yml` runs).
//      So a publish is run-complete within about 7.2 h + 5 s + 7 min = 7.4 h at the worst gap seen. `verdict.ts`
//      names its window from that.
//   2. IS AN INACTIVE PUBLIC REPOSITORY'S SCHEDULE DISABLED? NOT READ. GitHub documents disablement after 60 days
//      without repository activity; `gh api repos/<owner>/<repo>/actions/workflows --jq '.workflows[].state'` shows
//      it as `disabled_inactivity`. Run over every `a11ign` repository that has workflows (a11ign 18, auth-capture-check
//      5, agent-org 3, screenreader-worker 1): all `active`, and every one pushed within the previous 7 days, so
//      there is no inactive repository to read and 60 days cannot be waited out in a row. WHAT KEEPS IT ALIVE IS
//      THEREFORE UNDECIDED: whether a dispatched run counts as activity is unread. The row that creates the outside
//      repository must read that command on day 61 and say.
import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { VERSION_SHAPE } from "./verdict.ts";
import {
  extractDocumentedJobsBlock, pinActionRef, substituteTarget, extractJobName, extractPinnedSha,
  currentHeadSha, README_PATH,
} from "../generate-consumer-gate.ts";
import { refuseUnknownFlags } from "@a11ign/screenreader-fleet/cli-flags";
import { sandboxGitEnv } from "../../packages/guards/src/git-env.ts";

const REPO = fileURLToPath(new URL("../..", import.meta.url));
export const OUT = `${REPO}scripts/outsider/outsider-job.yml`;

/** The page `consumer-gate.yml` already uses, so the two gates disagree about the Action and never about the page. */
export const OUTSIDER_TARGET = {
  url: "https://www.w3.org/WAI/demos/bad/before/home.html",
  task: "Find the main navigation and reach the survey.",
};

/** Off the hour, because GitHub's cron queue is worst at :00 (#965). */
const POLL_CRON = "23 * * * *";

const FULL_SHA_SHAPE = /^[0-9a-f]{40}$/;

/** The Action's published repository, read by `git ls-remote` (public, no credential) in `poll` and `pin`. */
const ACTION_NAME = "a11ign/a11ign";
const ACTION_REMOTE = `https://github.com/${ACTION_NAME}`;

/** What the job's own summary says it did not run: routes the documents describe and this job did not take. */
export const NOT_COVERED = [
  { document: "README.md", route: "\"Locally instead\": a capture worker you control, `pnpm run doctor`" },
  { document: "docs/getting-started.md", route: "routes A, B and C: a worker on a Mac, on your own Windows machine, or none" },
  { document: "docs/try-it.md", route: "\"The other route: run it from the repository\", and the authenticated run behind a login" },
];

/** The marks `refuseDriftFromReadme` finds README's job between. Comments, so they change nothing GitHub runs. */
const README_JOB_BEGIN = "  # >>> README's job from here: its lines, but for the ref, the url and the task, and one `needs:`";
const README_JOB_END = "  # <<< README's job ends";

/** The one line the generator adds INSIDE README's job, after its key, so the job waits for `pin`. */
const NEEDS_PIN_LINE = "    needs: [pin]";

/** The documented shape of `a11ign-result.json` (`docs/github-action.md`): checked by `summary`, with `jq -e`. */
const RESULT_SHAPE_FILTER = "(.verdict.findings | type == \"array\") and (.verdict | has(\"taskCompletable\")) and has(\"captureVerified\")";

/** `uses:` ref, `url` and `task` made equal, by the readers that substitute them -- so a comparison ignores only those. */
const MASK = { ref: "<ref>", target: { url: "<url>", task: "<task>" } };

/** The comment Dependabot reads to name the release a sha pin stands for: `uses: <action>@<sha> # v1.2.3`. */
const PIN_VERSION_COMMENT = /^(\s*(?:- )?uses:\s*\S+@[0-9a-f]{40}) # v(\S+)$/m;

/**
 * Puts ` # v<version>` on the Action's pinned `uses:` line, REPLACING a trailing comment README's fence already carries there.
 * README's comment ("the commit of the release tagged a11ign@0.3.0") names README's own release; the sha pinned here is `--sha`'s,
 * the tag commit of `--version`, so that comment would be false and a second one would leave Dependabot reading whichever came
 * first. Trailing text that is not a comment is still refused: it is not this function's to discard.
 * @param {string} jobText a job whose `uses:` line `pinActionRef` has already pinned
 * @param {string} version
 * @returns {string}
 */
function annotatePin(jobText: string, version: string): string {
  if (!VERSION_SHAPE.test(version)) throw new Error(`${JSON.stringify(version)} is not a version this generator can name a pin for`);
  const line = new RegExp(`^\\s*(?:- )?uses:\\s*\\S+@${extractPinnedSha(jobText)}(.*)$`, "m").exec(jobText);
  if (!line) throw new Error("the Action's pinned `uses:` line cannot be found to annotate");
  const [whole, rest] = line;
  if (rest.trim() && !rest.trim().startsWith("#")) throw new Error(`the Action's pin line already ends in ${JSON.stringify(rest.trim())}, which is not a comment, so \`# v${version}\` cannot replace it`);
  return jobText.replace(whole, `${whole.slice(0, whole.length - rest.length)} # v${version}`);
}

/** @param {string} workflowText @returns {string | undefined} the version the committed pin line names, if it names one */
function pinnedVersionOf(workflowText: string): string | undefined {
  return PIN_VERSION_COMMENT.exec(workflowText)?.[2];
}

/**
 * What the summary says where the pin line's sha is. Printing the sha would be a second copy that Dependabot's bump
 * of the `uses:` line leaves stale (#3221); the line itself, in this very file, is the one place that names it.
 */
const PIN_IN_SUMMARY = "<the release's full commit sha, as pinned on that line of this file>";

/** @param {string} line @returns {string} the line with a pinned sha, and the `# v<version>` after it, replaced by `PIN_IN_SUMMARY` */
const withoutBakedPin = (line: string): string => line.replace(/(uses:\s*\S+@)[0-9a-f]{40}(?: # v\S+)?/, `$1${PIN_IN_SUMMARY}`);

/** @param {string} jobText @returns {string} the job with a pin line's `# v<version>` comment removed: a comment is not drift */
const withoutPinComment = (jobText: string): string => jobText.replace(PIN_VERSION_COMMENT, "$1");

/**
 * README's fence with the trailing comment on the Action's pin line removed, IF the workflow's pin line carries a `# v<version>`.
 * `--version` replaced README's comment with that one (#4041), so the two sides differ by exactly the comment; a workflow with any
 * other comment, or none, leaves README's comment in place to be compared (#4421).
 * @param {string} fenceText README's job
 * @param {string} workflowText the workflow's copy of that job
 * @returns {string}
 */
function withoutReplacedPinComment(fenceText: string, workflowText: string): string {
  const pin = PIN_VERSION_COMMENT.exec(workflowText);
  if (!pin) return fenceText;
  const action = /uses:\s*(\S+)@/.exec(pin[1])?.[1] ?? "";
  return fenceText.replace(new RegExp(`^(\\s*(?:- )?uses:\\s*${escapeRegExp(action)}@\\S+)[ \\t]+#.*$`, "m"), "$1");
}

/** @param {string} jobText @returns {string} */
const maskVariable = (jobText: string): string => substituteTarget(pinActionRef(withoutPinComment(jobText), MASK.ref), MASK.target);

/** @param {string} text @returns {string} the text, matched literally inside a RegExp (a YAML job key may hold `.` or `+`) */
const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** @param {string[]} lines @param {string} jobName @returns {string[]} the job's lines, `needs: [pin]` spliced after its key */
function spliceNeeds(lines: string[], jobName: string): string[] {
  const at = lines.findIndex((line) => new RegExp(`^  ${escapeRegExp(jobName)}:[ \\t]*(#.*)?$`).test(line));
  if (at === -1) {
    throw new Error(`the job line "  ${jobName}:" is not a block key (only spaces or a comment may follow its colon), `
      + "so `needs: [pin]` has nowhere to be spliced in and `pin` would gate nothing");
  }
  return [...lines.slice(0, at + 1), NEEDS_PIN_LINE, ...lines.slice(at + 1)];
}

/** @param {string} text @returns {string} the text safe between single quotes in a shell script */
const inSingleQuotes = (text: string): string => text.replaceAll("'", "'\\''");

/** The `git ls-remote` that reads a release tag's COMMIT: the peeled ref of an annotated tag, else the tag itself. */
function tagShaCommand() {
  return [
    `tag_sha=$(git ls-remote ${ACTION_REMOTE} "refs/tags/a11ign@\${version}^{}" | cut -f1)`,
    `[ -n "$tag_sha" ] || tag_sha=$(git ls-remote ${ACTION_REMOTE} "refs/tags/a11ign@\${version}" | cut -f1)`,
    `[ -n "$tag_sha" ] || { echo "::error::no release tag a11ign@\${version} on ${ACTION_REMOTE}"; exit 1; }`,
  ];
}

/** A step's `run: |` body sits ten columns in: under `        run: |` (eight) and two more. */
const RUN_BODY_INDENT = 10;

/** @param {string[]} lines @returns {string[]} the lines as a `run: |` block's body */
const asRunBody = (lines: string[]): string[] => lines.map((line) => (line === "" ? "" : `${" ".repeat(RUN_BODY_INDENT)}${line}`));

/** The job that pulls the registry and starts a run for a version this repository has no completed run for. */
function buildPollJob() {
  const script = [
    "set -euo pipefail",
    "version=$(npm view a11ign dist-tags.latest)",
    ...tagShaCommand(),
    "title=\"outsider v${version} ${tag_sha}\"",
    "# A run counts as answered once it is unfinished or ended success/failure: a cancelled one never answered,",
    "# and a version already red must not be re-run every hour on a windows runner.",
    "answered=$(gh run list --workflow \"$GITHUB_WORKFLOW\" --limit 200 --json displayTitle,status,conclusion \\",
    "  | jq --arg t \"$title\" '[.[] | select(.displayTitle == $t)",
    "      | select(.status != \"completed\" or (.conclusion | IN(\"success\", \"failure\", \"timed_out\", \"startup_failure\", \"action_required\")))] | length')",
    "if [ \"$answered\" != \"0\" ]; then echo \"${title}: already has a run\"; exit 0; fi",
    "gh workflow run \"$GITHUB_WORKFLOW\" -f version=\"$version\" -f sha=\"$tag_sha\"",
    "echo \"started: ${title}\"",
  ];
  return [
    "  poll:",
    "    if: github.event_name == 'schedule'",
    "    runs-on: ubuntu-latest",
    "    permissions:",
    "      actions: write",
    "    steps:",
    "      - name: Start a run for a release this repository has no completed run for",
    "        env:",
    "          GITHUB_TOKEN: ${{ github.token }}",
    "          GH_REPO: ${{ github.repository }}",
    "        run: |",
    ...asRunBody(script),
  ].join("\n");
}

/**
 * The shell that reads the pin out of the workflow file this run is executing, as `sed` extracts it from the `uses:`
 * line: exactly one, and a full sha (a tag or branch there is no pin, and is refused by name).
 * `GITHUB_WORKFLOW_REF` is `<owner>/<repo>/<path>@<ref>`, so the path needs no filename written here. The pattern is
 * assembled so this file never carries a line `extractPinnedSha` could take for the Action's own `uses:` line.
 */
function readPinnedShaCommand() {
  return [
    "workflow_file=\"${GITHUB_WORKFLOW_REF#\"${GITHUB_REPOSITORY}/\"}\"",
    "workflow_file=\"${workflow_file%%@*}\"",
    `pinned=$(sed -nE 's#^[[:space:]]*(- )?uses:[[:space:]]*${ACTION_NAME}@([0-9a-f]{40})([[:space:]].*)?$#\\2#p' "$workflow_file")`,
    "case \"$pinned\" in",
    "  \"\" | *$'\\n'*)",
    "    echo \"::error::${workflow_file} has no single line pinning the Action to a full commit sha, so there is no pin to read\"",
    "    exit 1 ;;",
    "esac",
  ];
}

/** The job that refuses a run whose pin is not the release it is named for. */
function buildPinJob() {
  const script = [
    "set -euo pipefail",
    "version=\"$VERSION\"",
    ...tagShaCommand(),
    ...readPinnedShaCommand(),
    "if [ \"$SHA\" != \"$tag_sha\" ]; then",
    "  echo \"::error::this run is named for ${SHA}, but v${version} is ${tag_sha}\"",
    "  exit 1",
    "fi",
    "if [ \"$pinned\" != \"$tag_sha\" ]; then",
    "  echo \"::error::this file pins ${pinned}, which is not v${version} (${tag_sha}): regenerate it with\"",
    "  echo \"::error::node scripts/outsider/generate.ts --sha=${tag_sha} --version=${version} and commit it here. The run is red\"",
    "  echo \"::error::rather than green because it would otherwise test a release it is not named for\"",
    "  exit 1",
    "fi",
  ];
  return [
    "  pin:",
    "    if: github.event_name == 'workflow_dispatch'",
    "    runs-on: ubuntu-latest",
    "    steps:",
    "      - uses: actions/checkout@v7   # this repository's own workflow file, which holds the one copy of the pin",
    "        with:",
    "          persist-credentials: false",
    "      - name: Refuse a run whose pin is not the release it is named for",
    "        env:",
    "          VERSION: ${{ inputs.version }}",
    "          SHA: ${{ inputs.sha }}",
    "        run: |",
    ...asRunBody(script),
  ].join("\n");
}

/** @param {string} text @param {string} fragment @returns {number} the 1-based line of `text` that `fragment` starts on */
const lineNumberOf = (text: string, fragment: string): number => text.slice(0, text.indexOf(fragment)).split("\n").length;

/**
 * Every line of README's fence that the generated job does not carry as written, by README line, plus the line the
 * generator adds. Printed in the job's summary so nothing is added silently. README's own pinned sha is masked on its side too:
 * the quoted line was a second full-sha `uses:` line in the file (#4041), which `grep -oE` over the file read as two pins.
 *
 * @param {{ readmeText: string, fence: string, targeted: string }} texts
 * @returns {string[]}
 */
export function substitutionList({ readmeText, fence, targeted }: { readmeText: string; fence: string; targeted: string; }): string[] {
  const firstLine = lineNumberOf(readmeText, fence);
  const was = fence.split("\n");
  const now = targeted.split("\n").map(withoutBakedPin);
  const changed = was.flatMap((line, i) => (line === now[i] ? [] : [
    `README.md line ${firstLine + i}: \`${withoutBakedPin(line.trim())}\` became \`${now[i].trim()}\``,
  ]));
  return [...changed, `added: \`${NEEDS_PIN_LINE.trim()}\` under the job's key, so it waits for the pin check`];
}

/** @returns {string[]} */
function notCoveredLines(): string[] {
  return NOT_COVERED.map(({ document, route }) => `- ${document}: ${route}`);
}

/**
 * The job that judges the documented path and says, in the run's own summary, what it did not cover.
 * @param {{ jobName: string, substitutions: string[] }} options
 * @returns {string}
 */
function buildSummaryJob({ jobName, substitutions }: { jobName: string; substitutions: string[]; }): string {
  const text = [
    "## outsider: the documented path, run from an empty workspace",
    "",
    "Ran README.md's Quickstart job as written. Judged: it completed, and `a11ign-result.json` has the documented shape.",
    "",
    "### Not covered by this run",
    ...notCoveredLines(),
    "",
    "### Substitutions: every line that differs from README.md's fence",
    ...substitutions.map((/** @type {string} */ line: string) => `- ${line}`),
  ];
  const script = [
    "set -euo pipefail",
    "cat >> \"$GITHUB_STEP_SUMMARY\" <<'SUMMARY'",
    ...text,
    "SUMMARY",
    "if [ \"$PIN\" != \"success\" ]; then echo \"::error::the pin check did not succeed ($PIN)\"; exit 1; fi",
    "if [ \"$JOB\" != \"success\" ]; then",
    "  echo \"::error::the documented job did not succeed ($JOB): a reader following only README.md hit exactly this\"",
    "  exit 1",
    "fi",
    `jq -e '${inSingleQuotes(RESULT_SHAPE_FILTER)}' result/a11ign-result.json > /dev/null \\`,
    "  || { echo \"::error::a11ign-result.json is missing or lacks the documented shape\"; exit 1; }",
  ];
  return [
    "  summary:",
    `    needs: [pin, ${jobName}]`,
    "    if: ${{ !cancelled() && github.event_name == 'workflow_dispatch' }}",
    "    runs-on: ubuntu-latest",
    "    steps:",
    "      - uses: actions/download-artifact@v7",
    `        if: needs.${jobName}.result == 'success'`,
    "        with:",
    "          name: a11ign-result",
    "          path: result",
    "      - name: Judge the documented path, and say what it did not cover",
    "        env:",
    "          PIN: ${{ needs.pin.result }}",
    `          JOB: \${{ needs.${jobName}.result }}`,
    "        run: |",
    ...asRunBody(script),
  ].join("\n");
}

/** The `name`/`run-name`/`on` envelope README's fence omits, and the header that says what this file is. */
function buildHeader() {
  return [
    "# GENERATED by `node scripts/outsider/generate.ts` from README.md's own Quickstart fence. Do not edit by hand:",
    "# packages/lab/src/packaging/outsider-job.test.ts checks this file against the document it was generated from.",
    "#",
    "# #3181: the workflow that runs in a repository OUTSIDE the a11ign organisation, from an EMPTY workspace, once per",
    "# release. It holds no stored credential: it pulls the registry and starts its own runs with its own `github.token`.",
    "# See scripts/outsider/generate.ts for why, for the two measurements, and for the one thing it cannot do alone.",
    "name: outsider",
    "run-name: ${{ github.event_name == 'workflow_dispatch' && format('outsider v{0} {1}', inputs.version, inputs.sha) || 'outsider poll' }}",
    "",
    "on:",
    "  schedule:",
    `    - cron: "${POLL_CRON}"`,
    "  workflow_dispatch:",
    "    inputs:",
    "      version:",
    "        description: The a11ign version to rehearse, as npm serves it (no leading v)",
    "        required: true",
    "      sha:",
    "        description: That version's release tag, as a full commit sha",
    "        required: true",
    "",
  ].join("\n");
}

/**
 * Pure end-to-end build: README text + the sha to pin -> the whole generated workflow.
 * @param {string} readmeText
 * @param {string} sha the release tag's FULL commit sha (`uses:` accepts no short one)
 * @param {string} [version] the release that sha is the tag of: written as the pin's `# v<version>` comment, which is
 *   what lets Dependabot's `github-actions` ecosystem bump the pin. Absent, no comment: a comment naming a version
 *   the sha is not the tag of would be a false one
 * @returns {string}
 */
export function generateOutsiderJob(readmeText: string, sha: string, version?: string): string {
  if (!FULL_SHA_SHAPE.test(sha)) {
    throw new Error(`${JSON.stringify(sha)} is not a full 40-character commit sha, which is all \`uses:\` accepts`);
  }
  const fence = extractDocumentedJobsBlock(readmeText);
  const pinned = pinActionRef(fence, sha);
  const targeted = substituteTarget(version === undefined ? pinned : annotatePin(pinned, version), OUTSIDER_TARGET);
  const jobName = extractJobName(targeted);
  const [, ...body] = targeted.split("\n");
  const substitutions = substitutionList({ readmeText, fence, targeted });
  return [
    buildHeader(),
    "jobs:",
    buildPollJob(),
    "",
    buildPinJob(),
    "",
    README_JOB_BEGIN,
    ...spliceNeeds(body, jobName),
    README_JOB_END,
    "",
    buildSummaryJob({ jobName, substitutions }),
    "",
  ].join("\n");
}

/** @param {string} workflowText @returns {string[]} README's job as the workflow carries it, `needs: [pin]` removed */
function readmeJobRegion(workflowText: string): string[] {
  const lines = workflowText.split("\n");
  const begin = lines.indexOf(README_JOB_BEGIN);
  const end = lines.indexOf(README_JOB_END);
  if (begin === -1 || end === -1 || end < begin) {
    throw new Error("the workflow does not carry README's job between its two marker comments, so what it runs "
      + "cannot be compared with README's fence");
  }
  const region = lines.slice(begin + 1, end);
  if (region[1] !== NEEDS_PIN_LINE) {
    throw new Error(`README's job lacks \`${NEEDS_PIN_LINE.trim()}\` directly under its key (line 2 of the job is `
      + `${JSON.stringify(region[1])}), so the pin check gates nothing`);
  }
  return [region[0], ...region.slice(2)];
}

/**
 * Throws, naming the first line that differs, unless the workflow's job equals README's fence line for line EXCEPT
 * the Action's `uses:` ref and the `url`/`task` values. An added step, a removed one and a renamed key are each a
 * line that differs. Compared through the same readers the generator uses, never a second reader of the fence.
 *
 * @param {string} readmeText
 * @param {string} workflowText
 */
export function refuseDriftFromReadme(readmeText: string, workflowText: string) {
  const fence = extractDocumentedJobsBlock(readmeText);
  const fenceLines = fence.split("\n").slice(1);
  const workflowLines = readmeJobRegion(workflowText);
  let expected;
  let actual;
  try {
    const workflowJob = workflowLines.join("\n");
    expected = maskVariable(withoutReplacedPinComment(fenceLines.join("\n"), workflowJob)).split("\n");
    actual = maskVariable(workflowJob).split("\n");
  } catch (cause) {
    throw new Error(`the workflow's copy of README's job cannot be read the way README's fence is: ${cause instanceof Error ? cause.message : cause}`, { cause });
  }
  const firstLine = lineNumberOf(readmeText, fence) + 1;
  const at = expected.findIndex((line, i) => line !== actual[i]);
  if (at !== -1) {
    throw new Error(`README.md line ${firstLine + at} reads ${JSON.stringify(fenceLines[at])} but the workflow has `
      + `${JSON.stringify(workflowLines[at] ?? "(nothing: its job ends)")} there`);
  }
  if (actual.length > expected.length) {
    throw new Error(`the workflow has a line README.md's fence does not, after README.md line ${firstLine + expected.length - 1}: `
      + JSON.stringify(workflowLines[expected.length]));
  }
}

/** The tokens a reader's own copy could never carry, each with why it is refused. */
const FORBIDDEN = [
  { pattern: /\bsecrets\b(?!\.GITHUB_TOKEN\b)/, why: "a secret other than the run's own token: none crosses the organisation's boundary (ADR 0041)" },
  { pattern: /\bpull_request_target\b/, why: "runs with the base repository's token on code from a fork" },
  { pattern: /\brepository_dispatch\b/, why: "a push from a11ign to this repository needs a stored token, and both directions are pulls" },
];

/**
 * The lines of a `uses: actions/checkout` step, from its `- ` line to the line before the next step or dedent.
 * @param {string[]} lines
 * @returns {Array<{ at: number, lines: string[] }>}
 */
function checkoutSteps(lines: string[]): Array<{ at: number; lines: string[]; }> {
  return lines.flatMap((line, i) => {
    const step = /^(\s*)(?:- )?uses:\s*actions\/checkout\b/.exec(line);
    if (!step) return [];
    const indent = step[1].length;
    const rest = lines.slice(i + 1);
    const length = rest.findIndex((next) => next.trim() !== "" && next.length - next.trimStart().length <= indent);
    return [{ at: i, lines: [line, ...rest.slice(0, length === -1 ? rest.length : length)] }];
  });
}

/**
 * Names every line a reader's own copy could not carry: a checkout of `a11ign`, a `secrets.` reference other than
 * the run's own token, `pull_request_target`, `repository_dispatch`. The README job's own `actions/checkout` is
 * the reader's repository and is allowed; one with a `repository:` key is a checkout of somebody else's.
 *
 * @param {string} workflowText
 * @returns {string[]} `line N: <why>`, empty when the file is clean
 */
export function forbiddenReferences(workflowText: string): string[] {
  const lines = workflowText.split("\n");
  const found = lines.flatMap((line, i) => FORBIDDEN
    .filter(({ pattern }) => pattern.test(line))
    .map(({ why }) => `line ${i + 1} (${line.trim()}): ${why}`));
  const checkouts = checkoutSteps(lines).filter((step) => step.lines.some((l) => /^\s*repository:/.test(l)));
  return [...found, ...checkouts.map((step) => `line ${step.at + 1}: a checkout of a repository other than the one running`)];
}

/**
 * A unified diff of two texts, by `git diff --no-index` (the platform already makes one), or "" when they agree.
 * @param {{ expected: string, actual: string }} texts
 * @returns {string}
 */
export function unifiedDiff({ expected, actual }: { expected: string; actual: string; }): string {
  const dir = mkdtempSync(join(tmpdir(), "outsider-diff-"));
  try {
    writeFileSync(join(dir, "committed"), actual);
    writeFileSync(join(dir, "generated"), expected);
    const run = spawnSync("git", ["diff", "--no-index", "--no-color", "--", "committed", "generated"],
      { cwd: dir, env: sandboxGitEnv(), encoding: "utf8" });
    if (run.error) throw run.error;
    return run.stdout;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * `--check`'s decision: does the committed file equal what the generator makes from README at HEAD? Generated at the
 * COMMITTED sha, so the one line that must differ per release (the pin) is never itself a drift.
 *
 * @param {string} readmeText
 * @param {string} committedText
 * @returns {{ ok: true } | { ok: false, diff: string }}
 */
export function checkCommitted(readmeText: string, committedText: string): { ok: true; } | { ok: false; diff: string; } {
  const sha = readCommittedSha(committedText) ?? currentHeadSha();
  const expected = generateOutsiderJob(readmeText, sha, pinnedVersionOf(committedText));
  return committedText === expected ? { ok: true } : { ok: false, diff: unifiedDiff({ expected, actual: committedText }) };
}

/** @param {string} committedText @returns {string | undefined} the sha the committed file pins, if it pins one */
function readCommittedSha(committedText: string): string | undefined {
  try {
    return extractPinnedSha(committedText);
  } catch {
    return undefined;
  }
}

/** @returns {{ sha: string | undefined, version: string | undefined, check: boolean }} the flags, refusing any this command does not read */
function flagsFromArgv(): { sha: string | undefined; version: string | undefined; check: boolean; } {
  refuseUnknownFlags(["--check", "--sha=", "--version="], { entry: import.meta.url, command: "node scripts/outsider/generate.ts" });
  const argv = process.argv.slice(2);
  const valueOf = (/** @type {string} */ flag: string) => argv.find((arg) => arg.startsWith(flag))?.slice(flag.length);
  return { sha: valueOf("--sha="), version: valueOf("--version="), check: argv.includes("--check") };
}

function main() {
  const flags = flagsFromArgv();
  const readmeText = readFileSync(README_PATH, "utf8");
  if (flags.check) {
    const result = checkCommitted(readmeText, existsSync(OUT) ? readFileSync(OUT, "utf8") : "");
    if (result.ok) {
      console.log(`OK  ${OUT} matches what README.md's documented workflow generates (its pin aside).`);
      return;
    }
    console.error(`STALE  ${OUT} differs from what README.md generates. Run: node scripts/outsider/generate.ts\n${result.diff}`);
    process.exitCode = 1;
    return;
  }
  writeFileSync(OUT, generateOutsiderJob(readmeText, flags.sha ?? currentHeadSha(), flags.version));
  console.log(`WROTE  ${OUT}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ? realpathSync(process.argv[1]) : "").href) main();
