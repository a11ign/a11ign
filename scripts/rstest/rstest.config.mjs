// @ts-check

/**
 * a11ign's own test config: a THIN CALL into `@a11ign/toolchain`'s source (#3578, ADR 0043 row 4-0). Its path is named by `--config` in the
 * Acceptance of dozens of rows and by tracked files, so it stays here; what it carries is only what is a11ign's.
 *
 * THE PACKAGE'S SOURCE IS IMPORTED BY RELATIVE PATH, never `@a11ign/toolchain`: a review tree, where Acceptances run, has the root
 * `node_modules` and no `packages/*\/dist`, so a specifier that resolved to the package's `dist` would turn every rstest run in a fresh
 * tree red until somebody built it by hand. `@rstest/core` is a peer of the package and resolves from the root. The files it reaches are `.mjs`
 * because plain `node` loads them (the worker's `--import` hook, this file from a test) and the agent host's `/usr/bin/node` has no
 * type stripping (`process.versions.amaro` is undefined, measured on 22.22.1); ADR 0043, Decision 1 lets a file stay `.mjs`.
 *
 * WHAT IS a11ign'S: the repository root, the test glob, the `walk-scope` preload (#1349), and the data files its own tests read by path,
 * which a `--changed` run cannot see (#3572). The eight recorded decisions the config makes travel with the code, in
 * `packages/toolchain/src/rstest-config.mjs`.
 *
 * THE BY-PATH HALF IS DERIVED, NOT TRUSTED: `packages/lab/src/packaging/verify-affected-set.test.ts` finds every non-source file
 * and every data directory a non-tree-wide test names in a string literal, outside its own import closure, and fails on one that no
 * pattern here covers. A new such read therefore fails that test until a line is added here; the test is the maintainer of this list.
 * A tree-wide guard (a test about the repository) is not in that population: it does not ride on `--changed` and runs in CI.
 */
import { fileURLToPath } from "node:url";
import { defineToolchainConfig } from "../../packages/toolchain/src/rstest-config.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const walkScope = fileURLToPath(new URL("../../packages/guards/src/walk-scope.mjs", import.meta.url));

/**
 * #3572: what the config loads, and what every worker preloads: neither is imported by any test. The toolchain's source is a
 * trigger because the config is a call into it, and `walk-scope` because it is preloaded.
 */
const A11IGN_LOADED_TRIGGERS = ["scripts/rstest/**", "packages/toolchain/src/**", "packages/guards/src/walk-scope*.mjs"];

/** #3572: data directories a non-tree-wide test reads by path, whole, because a file added to one is read too. */
const READ_DIRECTORY_TRIGGERS = [
  ".agent-org/roles/**",
  ".agent-org/units/**",
  ".claude/rules/**",
  ".github/workflows/**",
  "docs/adr/**",
  "docs/board/**",
  "packages/cli/src/fixtures/**",
  "packages/control/ansible/**",
  "packages/lab/baselines/**",
  "packages/lab/src/eval/fixtures/**",
  "packages/nvda-speech/**",
  "packages/scorer/models/screenreader-scorer/**",
  "packages/scorer/python/**",
  "packages/scorer/tests/**",
  "packages/worker-fleet/src/local-worker/**",
  "packages/worker-fleet/src/provisioning/**",
  "scripts/git-hooks/**",
  "scripts/isolation-fixtures/missing-sibling/**",
];

/** #3572: single files a non-tree-wide test reads by path (a doc, a workflow, a role brief, a fixture), derived as above. */
const READ_FILE_TRIGGERS = [
  ".agent-org/project.json",
  ".agent-org/roles/README.md",
  ".agent-org/roles/ceo.md",
  ".agent-org/roles/engineer.md",
  ".agent-org/roles/liaison.md",
  ".agent-org/roles/memory/github-is-the-tracker.md",
  ".agent-org/roles/memory/local-worker-vms-deprecated.md",
  ".agent-org/roles/memory/merge-worktree-is-not-a-gate-environment.md",
  ".agent-org/roles/memory/org-shape-second-orchestrator.md",
  ".agent-org/roles/memory/worktree-resolves-primary-dist.md",
  ".agent-org/roles/migrate.md",
  ".agent-org/roles/product-manager.md",
  ".agent-org/roles/reviewer.md",
  ".agent-org/roles/sessions.json",
  ".agent-org/roles/worker-loop-orchestrator.md",
  ".agent-org/units/a11ign-corpus-release-nightly.service",
  ".agent-org/units/a11ign-corpus-snapshot.service",
  ".agent-org/units/a11ign-fleet-watch.service",
  ".agent-org/units/a11ign-lab-watch.service",
  ".c8rc.json",
  ".changeset/README.md",
  ".changeset/config.json",
  ".claude/rules/agent-practices.md",
  ".claude/rules/org-routing-and-timers.md",
  ".claude/skills/wcag-criterion-check/SKILL.md",
  ".github/CLAUDE.md",
  ".github/ISSUE_TEMPLATE/backlog-row.yml",
  ".github/ISSUE_TEMPLATE/config.yml",
  ".github/PULL_REQUEST_TEMPLATE.md",
  ".github/dependabot.yml",
  ".github/workflows/agent-org-bump.yml",
  ".github/workflows/auto-arm.yml",
  ".github/workflows/capture-regression.yml",
  ".github/workflows/ci-health.yml",
  ".github/workflows/ci.yml",
  ".github/workflows/consumer-gate.yml",
  ".github/workflows/dependency-pr-body.yml",
  ".github/workflows/nightly.yml",
  ".github/workflows/registry-consumer-gate.yml",
  ".github/workflows/release.yml",
  ".github/workflows/reusable-acceptance.yml",
  ".github/workflows/reusable-board.yml",
  ".github/workflows/reusable-build-test.yml",
  ".github/workflows/trunk.yml",
  ".gitignore",
  "CLAUDE.md",
  "CODEOWNERS",
  "CONTRIBUTING.md",
  "LICENSE",
  "PLAN.md",
  "README.md",
  "RELEASE.md",
  "SECURITY.md",
  "action.yml",
  "docs/README.md",
  "docs/adr/0041-every-repository-releases-itself-continuously.md",
  "docs/architecture-audit.md",
  "docs/backlog-ready.md",
  "docs/backlog.md",
  "docs/board/summaries/2026-09-07.md",
  "docs/code-repository-protection.json",
  "docs/commands.md",
  "docs/control-plane-hygiene.md",
  "docs/control-plane-proxmox.md",
  "docs/gate-exit-codes.md",
  "docs/getting-started.md",
  "docs/github-action.md",
  "docs/history-purge-replacements.md",
  "docs/known-gaps.md",
  "docs/lane-ownership.json",
  "docs/mutant-replay.md",
  "docs/nvda-worker-runbook.md",
  "docs/operational-lessons.md",
  "docs/owned-path-facts.json",
  "docs/proving-a-gate.md",
  "docs/publish-blocker.md",
  "docs/reliability-plan.md",
  "docs/repository-access.json",
  "docs/reviewer-instancing.md",
  "docs/row-filing.md",
  "docs/screenreader-coverage.md",
  "docs/try-it.md",
  "docs/weekly-review.md",
  "examples/workflow.yml",
  "packages/README.md",
  "packages/cli/README.md",
  "packages/cli/src/auth/fixtures/spelled-out-transcript.json",
  "packages/control/CLAUDE.md",
  "packages/control/README.md",
  "packages/control/layers.json",
  "packages/evidence/README.md",
  "packages/evidence/src/fixtures-exhausted-887.json",
  "packages/evidence/src/fixtures/submit-activation-cases.json",
  "packages/lab/CLAUDE.md",
  "packages/lab/README.md",
  "packages/lab/rule-ownership.json",
  "packages/lab/scripts/audit-scorer-shortcuts.py",
  "packages/lab/scripts/check-screenreader-hardening.py",
  "packages/lab/scripts/compose-multi-defect-probe.py",
  "packages/lab/scripts/diagnose-false-positives.py",
  "packages/lab/scripts/evaluate-screenreader-acceptance.py",
  "packages/lab/scripts/explain-case.py",
  "packages/lab/scripts/scorer-shortcuts.baseline.json",
  "packages/lab/scripts/train-screenreader-model.py",
  "packages/lab/src/eval/recorded-provenance.sha256",
  "packages/lab/src/packaging/fixtures/broken-continuation.ps1",
  "packages/lab/src/training/README.md",
  "packages/lab/src/training/accepted-acceptance-cases.json",
  "packages/nvda-worker/CLAUDE.md",
  "packages/nvda-worker/src/run-server.cmd",
  "packages/scorer/CHANGELOG.md",
  "packages/scorer/requirements.txt",
  "packages/worker-fleet/src/display-mode-harness.ps1",
  "requirements-ci.txt",
  "scripts/fixtures/calibration-verdicts.json",
  "scripts/history-purge-replacements.txt",
];

export default defineToolchainConfig({
  root,
  // The glob `npm run test:ts` hands to node:test, so "the same number of test files run" is checkable.
  include: ["packages/*/src/**/*.test.ts"],
  preloads: [walkScope],
  forceRerunTriggers: [...A11IGN_LOADED_TRIGGERS, ...READ_DIRECTORY_TRIGGERS, ...READ_FILE_TRIGGERS],
});
