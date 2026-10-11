The failure-class index now carries the two merged-but-inert rows under `closed-on-merge-not-outcome`: `a11ign/a11ign#4906` (the `github.identity` option, merged as agent-org#770 and inert until a11ign's `host.json` row and a wrapper re-render) and `a11ign/a11ign#4904` (`routing.question`, merged as agent-org#782 while `.agent-org/project.json` had no `routing` key). Each is a `chairman-named` seed with its note, and `guard` stays `null`.

`guardNote` now says what is ordered and what is not in force. The refusal is agent-org#838 and the detector is agent-org#839; both were OPEN issues in `a11ign/agent-org` when this was written (`gh issue view`, 2026-10-11), so the note says open, not merged. Neither covers an author who writes no `Consumer-declaration:` line.

- **Premise read at `origin/main` 91ba64a00:** the class listed only #4629 and #4627, as the row's Open-check says; `project.json` has no `routing` key (checked by parsing it).
- **Not established:** the "76 routes ran in traits mode" figure is carried from the row and was not re-measured here.

Acceptance: `bash -c 'node -e "const c=JSON.parse(require(\"node:fs\").readFileSync(\".agent-org/failure-classes.json\",\"utf8\")).classes.find((c)=>c.id===\"closed-on-merge-not-outcome\"); const refs=c.seed.map((s)=>s.ref); if(!refs.includes(\"a11ign/a11ign#4906\")||!refs.includes(\"a11ign/a11ign#4904\")||c.guard!==null||!/agent-org#838/.test(c.guardNote)||!/agent-org#839/.test(c.guardNote)) process.exit(1)"'`

Closes #4955

🤖 Generated with [Claude Code](https://claude.com/claude-code)
