Adds section 27 to `docs/not-working.md`: the nine closable `4.1.3` status vetoes (a11ign#4552, #4856), each read on the lab's exported corpus, classified, and tabled. Prose only; no corpus, weight, test or guard changes.

**Read at `549cfd8af6245053dcbd616282872d3119c41fea` on 2026-10-10**, one `lab:job -e job=explain-feature` run per pair (nine runs, all `exit 0`, `layer_refs` computed from that sha's lockfile, control laid at `v0.3.9`). The output is `explain-feature`'s own, quoted as printed (the lab's address elided):

```
form_change_nonempty on 4.1.3:status-progress
  positives      : 32
    reads 1      : 0
    reads 0      : 32
  elsewhere      : 678 of 3099 non-positive record(s) read 1
  formChanges entries: 32   by kind:
        submit=25, taskButton=7
    baselineQuiet: true=32 false=0
        absent=0
  CONSTANT 0 across every positive while other records carry it — the free-veto shape.
```

```
validation_error_missing on 4.1.3:status-waiting
  positives      : 30
    reads 1      : 0
    reads 0      : 30
  elsewhere      : 178 of 3101 non-positive record(s) read 1
  formChanges entries: 30   by kind:
        taskButton=30
    baselineQuiet: true=30 false=0
        absent=0
  CONSTANT 0 across every positive while other records carry it — the free-veto shape.
```

The other seven are in the table with their counts (`0 of 32` or `0 of 30` positives against 208, 299, 549, 678 and 178 other records). Sampled positives (3 of 32, 3 of 30): one `formChanges` entry, `after: ""`, `baselineQuiet: true`, `submitted: false`.

**What it says.** No pair is `probe-coverage` (the probe ran on every positive, `absent=0`). Eight are `stale-classification`: the positive IS the missing announcement, the same reason `4.1.3:form-activation-silent` sits in `IMPOSSIBLE_BY_DEFINITION` (`packages/lab/scripts/audit-corpus-starvation.ts:76-82`), and these two heads, added 2026-09-12, have no key there. One is `page-reason`: `4.1.3:status-waiting` / `validation_error_missing` (the positives are button-only `taskButton` pages). The page that would carry it is input-identical to a `3.3.1` silent-submit positive, so it is **named for `ceo` as an ADR 0021 layer-ownership question and not decided here**.

**`form_change_nonempty`:** unclosable on both heads, 0 of 32 and 0 of 30. The shortcuts audit's "closable" is a default for any pair the map does not cover, not a finding; the 2026-09-06 entry is right for its own heads and the same argument now holds, measured, for these two. The disclosure sub-question does not rescue it here: `formChanges` has no `disclosure` entry (0 of 32, 0 of 30) and the disclosure lands in `stateChanges`. That is a reading of these two heads only.

**Not done, and not this row's work:** the follow-up rows (add the two heads to `IMPOSSIBLE_BY_DEFINITION`, regenerate the map and the baseline; the 28-to-20 headline change) are `product-manager`'s to file after the merge. Nothing was built.

Acceptance: `bash -c 'test "$(grep -cE "^[|] 4[.]1[.]3:status-(progress|waiting) [|] [a-z_]+ [|] (probe-coverage|page-reason|stale-classification) [|]" docs/not-working.md)" -ge 9'` exited 0 at this head, from `/home/agent/repos/wt-4858` (count 9; rc 1 and count 0 at `origin/main`). `node --import tsx scripts/doc-checks/not-working-numbering.ts` exited 0.

Closes #4858

Mutation: none -- prose only; this diff changes no test file and no guard.
