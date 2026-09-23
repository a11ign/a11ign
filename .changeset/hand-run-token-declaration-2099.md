---
"@a11ign/agent-org": patch
---

**`token` was the only job capability a row could not declare, and now it is declared like the other
three (#2099).** `jobCapabilities()` names four capabilities the `acceptance` job can lack. A row could
declare `history` (`History: full` in the body), `fleet` (the row template's required dropdown) and
`corpus` (the template's prose rule). `token` had nothing — so a row whose Acceptance is a `gh` command
said so in prose no code reads, and nothing said so until `pr-open`, after a builder had claimed the row
and built the change.

Measured 2026-09-23 at `fb66712cf`: the bare spelling (`gh api …`) classified `runnable`, so the job RAN
it and it died on the missing credential — the job knows it has no token and the classifier never asked.
The `$ `-prefixed spelling classified prose and reached `EXECUTED NOTHING` instead. Of the 300 rows the
API returns, 258 carry a command Acceptance and 8 name `gh`.

The declaration is **`Hand-run: <who runs it and why>`**, a body field in the `Acceptance:`/`Closes:`/
`Not-before:` family rather than a template dropdown, and the reason is which body has to carry it: the
acceptance job reads the **PR** body, where there is no template and no dropdown, and `gh issue create`
does not apply the web form that makes a dropdown required. A reason is required for `Closes: none`'s
reason — the bare form would become the flag people add to make a red check green.

`classifyCommand` now refuses a bare `gh` command for `token`, beside the fleet/lab/corpus patterns and
guarded by `capabilities.token`, so every caller that never mentions capabilities is unchanged. An
UNDECLARED `gh` Acceptance is refused at FILING by `row-file`, in the wording `pr-open` would later use
and quoting the command. A DECLARED one reports `NOT RUN` naming the declaration, and silences
`EXECUTED NOTHING` only when EVERY command in the section is a declared hand-run — a fleet refusal beside
it keeps the section red, or the declaration becomes a way to turn any red check green.

**It declares rather than refuses**, which is `product-manager`'s ruling on the row: #2084 is a correctly
filed row whose Acceptance is a deliberate hand-run `gh` read, named per the template's own rule for a
command a runner cannot make, and a blanket refusal would have refused it. The `$ `-prefixed spelling
keeps its existing prose verdict and its `EXECUTED NOTHING` refusal: that fault is the line never having
been written as a command, and it needs a different fix.
