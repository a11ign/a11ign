// @ts-check
// a11ign's OWN gate causes (ADR 0040, decision 1, surface 3; #2621, child 3e of #69) -- the project's
// addition to the tool's 30 (the tool's `src/cause-declaration.mjs`'s `TOOL_CAUSE_DECLARATIONS`).
// Measured: of every cause the gate can emit, `fleet-batch-due` is the only one that names the fleet
// (`orchestrator/` appears once in `causeKey` prefixes against 10 for `product-manager/` and 4 for
// `ceo/`), so it is the one PLUGIN rather than tool code. A project with no fleet, lab or corpus ships no
// file here, and `.agent-org/project.json`'s `causes` field is absent, so it gets none of this.
//
// A PLUGIN, NOT A FIELD, because the cause must RUN project code to decide when it fires:
// `fleetBatchOrders` (the tool's `src/work-gate.mjs`) reads the `fleet-gated` label, which only a
// project with a fleet has any rows carrying. That detection is UNMOVED by this row -- ADR 0040 lists it
// among the surfaces a later row still owns (decision 9's partition of the tool's `host/`). What
// moves here is the DECLARATION only: the name, which of the four groups it belongs to
// (`cause-declaration.mjs`'s `GROUPS`), and the model/effort it is worth.
// PLAIN DATA, WITH NO IMPORT (#2975). This file used to call `declareCause`/`GROUPS` from the tool's leaf `cause-shape.mjs`
// by a relative path. The tool is a pinned dependency now, and a bare `agent-org` specifier here would be an
// `ERR_MODULE_NOT_FOUND` for the host's gate, which loads this plugin from a tree that has run no `pnpm install`
// (`a11ign-work-tick.service` runs before one; `work-gate.test.ts`'s "NO node_modules" test pins it) -- and whole-tick-down is
// what that costs. So each entry is written out in the shape `declareCause` returns, `{ cause, group, profile }`, with
// the group spelled as its literal, and `project-roles-a11ign-plugin.test.ts` checks every entry against the REAL
// `declareCause` and `GROUPS`, so a typo here fails a test instead of silently dropping a cause from its group.

/** `causeDeclaration.mjs`'s `projectCauseDeclarations` reads exactly this export. */
export const causeDeclarations = [
  {
    cause: "fleet-batch-due",
    group: "judgment-start",
    profile: {
      kind: "claude",
      model: "sonnet",
      // HIGH. Each row in the batch needs a capture chosen, a reading interpreted, and a verdict on whether
      // the row can now move without the fleet -- judgement per row, over the org's scarcest resource, with
      // a wrong call costing hours of ten-worker time. This is the order that replaced a nightly timer, so
      // it now arrives whenever the gated set changes rather than once a day; that makes it more frequent,
      // not cheaper to get wrong.
      effort: "high",
      why: "a by-row reading of the fleet-gated batch decides how the org's scarcest resource is spent",
    },
  },
  // #2729: the second plugin cause, for the first one's reason -- it exists only where there is a lab. Its DETECTION is
  // `labJobFinishedOrders` (`src/work-gate/lab-job-orders.mjs` in the tool), reading records that `lab-job`'s
  // `run-job.yml` writes; this is the declaration only, as `fleet-batch-due`'s is.
  {
    cause: "lab-job-finished",
    group: "judgment",
    profile: {
      kind: "claude",
      // SONNET AND MEDIUM. The order carries the result itself (outcome, exit code, when, which run), so the woken turn
      // diagnoses nothing from an absence: it reads a verdict it was handed and resumes a row it already holds, with its
      // context loaded. That is `claimed-row-amended`'s case and priced the same. A JUDGMENT cause, not an ACTION one,
      // because what to do about a failed or passed job is a decision -- and not a START one, since it addresses the
      // holder of a row already claimed, which a drain must not withhold.
      model: "sonnet",
      effort: "medium",
      why: "resuming a held row on a verdict the gate has already read -- the wake replaces a session polling lab:status",
    },
  },
];
