a11ign's `.agent-org/decisions.json` now switches on all six decision uses `decision-provider.ts` knows (`DECISION_USES`): the existing `model-routing` and the five that were built, closed and never switched on: `wake-triage`, `ci-failure-class`, `failure-class-match`, `duplicate-row`, `review-depth`. Chairman's direction on #4627 (DanBeckDev, comment 6101017800, 2026-10-10 ~18:53Z, item 1). The decision log held zero records for those five in the 6 hours before it.

`wake-triage` was left out of the file on purpose in #4664, because the host's own `triage` declaration is its switch (`triage-provider.ts` passes `{"wake-triage": true, ...deps.switches}`). The chairman has since read zero `wake-triage` records and a digest share of 0.5%, so it is listed here and that reading is chased separately (item 2 of the same comment). Listing it changes nothing a declared host did not already do; it removes one way for it to read off.

Acceptance: `node -e 'const d=JSON.parse(require("fs").readFileSync(".agent-org/decisions.json","utf8"));const uses=["model-routing","wake-triage","ci-failure-class","failure-class-match","duplicate-row","review-depth"];if(Object.keys(d).length!==uses.length||!uses.every(u=>d[u]===true))process.exit(1)'`

Mutation: with the file as on `main` (one key) the Acceptance exits 1 on the count; with any one use `false` it exits 1 on the value; with a seventh key it exits 1 on the count; the committed file exits 0. This change is data only.

NOT claimed: that any of the five now writes a record. That is read live, after the host's checkout is updated, and quoted on #4627 one record per use. Merging this is not that reading.

Closes: none -- item 1 of four on #4627; the epic stays open until a live record per use is quoted there.

platform: n/a (a data file)
