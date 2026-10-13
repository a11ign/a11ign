The ADR 0012 amendment note ceo's ruling on a11ign#5312 asked for (2026-10-12): "Amended by ADR 0045 cut 9", dated. The control change itself is a11ign/control#89; this is the one file of it that lives in the core.

Acceptance: `grep -q "Amended 2026-10-13 by .ADR 0045" docs/adr/0012-control-plane-split.md`

Docs only: one paragraph under `## Status` in `docs/adr/0012-control-plane-split.md`; the Context and Decision are untouched.

Closes: none -- the row closes with a11ign/control#89, which carries the `Closes` lines; this PR is the ADR note that PR's ruling asks for and a control PR cannot hold.
