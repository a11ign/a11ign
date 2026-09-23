---
"@a11ign/agent-org": patch
---

**A `Hand-run:` declaration asserts a human ran something, and nothing anywhere required the output
(#2118).** #2105 (row #2099) gave `token` what `fleet` has: a declared field, then verified. Only the
declaration half bit. `handRunAcceptanceReason` refused to FILE a `gh` Acceptance with no `Hand-run:`
line, and after that nothing required the pasted output to exist at all — a body could declare
`Hand-run:`, paste nothing, and merge green. Measured on the shipped module at `e1b8b7bc5`, 2026-09-23:
`acceptanceReport` of a declared-hand-run body with no output anywhere returned `{ ok: true }`.

**The asymmetry is why it mattered.** `Acceptance: none — <reason>` claims nothing was run. `Hand-run:`
asserts a human DID run something — a positive claim about work performed, and the only one on this path
that nothing checked. The trade was documented honestly and the `NOTHING RAN HERE` line says in its own
words that it verified nothing; the risk was that it was written down so well that the question stopped
being asked.

**The ruling, between the two shapes #2118 put:** a NAMED SECTION — a `## Hand-run output` heading (or a
`**Hand-run output:**` line) whose body is non-empty — checked when every command in the Acceptance
section is a declared hand-run. The other candidate, the output matched against the declared command
string, is refused on its own terms rather than on cost: the only half of it a machine here can check is
the COMMAND STRING, because nothing in this job holds the credential and so nothing can re-run the
command and compare. Matching on that string fails in both directions — it refuses a correct body whose
paste wraps a continuation-joined command across lines, and it passes a body that pasted the command and
no output at all. It buys a false refusal and no additional truth.

**So the check proves exactly one thing — that a human wrote something under that heading — and its
message says so.** The refusal names what it checked (`that such a section exists and is not empty`) and
what it did not (`whether that text is this command's output`), because a check that only proves somebody
typed something is worth more than nothing only if it is honest about which it is.

`ok` now stays true only when the run is pasted; #2099's trade survives intact, since a declared and
EVIDENCED hand-run is still green and loud and still merges. **A PARTIAL hand-run is untouched**:
`handRun < commands.length` means something really ran, and charging it for evidence would charge a row
for a command that executed. An undeclared refusal beside a declared one still reaches `EXECUTED NOTHING`
— two different faults must not print the same word. The refusal is followable (#1116): it names the
exact heading at `pr-open`, on the `NOT RUN` line the author meets first, at FILING time in `row-file`'s
refusal, and in the row template.
