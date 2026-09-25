# Outsider runs — one record per person outside the project who ran the tool

**What this file is for.** PLAN.md's B1 asked for someone outside the project to run the tool on an app
they own and to say plainly whether the result was worth their time. The first outsider's reaction reached us
relayed, in three places and three shapes (PLAN.md's UPDATE 2026-09-25, #2262, and the questions in
[`try-it.md`](./try-it.md#what-we-would-like-back)), and **two things B1's own wording asked for were not
stated by that person.** This file fixes the shape of a record so the next one cannot fill those two gaps with a
reading of what the person probably meant.

**The rule the whole file rests on: a field with nothing to put in it reads `NOT STATED`, never a guess.** A
reading of what someone probably meant belongs in a comment on a row, labelled as ours. It does not go in a
field of a record here.

## The fields

Every field is required, in this order, on every record. `packages/lab/src/packaging/outsider-runs.test.ts`
parses this file and refuses a record that breaks any of it. **Empty is a failure; `NOT STATED` is the only
accepted way to say nothing.**

| # | Field | What goes in it |
|---|---|---|
| 1 | `Run` | The run's number, a positive integer, one per record and never reused. |
| 1 | `Date` | The date the person ran it, `YYYY-MM-DD`. **Not the date the words reached us**: that goes in `Source`. `NOT STATED` if the run's own date was not given. |
| 2 | `Who` | The person **by role only** (`first outsider`, `second outsider`). Never a name, an email address or any contact detail. |
| 3 | `Was the app theirs` | `yes`, `no` or `NOT STATED`. Our reading of a page's ownership is not their statement. |
| 4 | `Was it behind a login` | `yes`, `no` or `NOT STATED`. What they said about users in general is not what they said about their run. |
| 5 | `Worth your time` | **A blockquote of their own words** (each line beginning `>`), or `NOT STATED`. Never a paraphrase, never a summary, never our reading. |
| 6 | `What they did about a finding` | What they DID (fixed, filed, ignored, asked), or `NOT STATED`. |
| 7 | `Where they got stuck` | Every question they had to ask, or `NOT STATED`. Each one is a defect in [`try-it.md`](./try-it.md). |
| 8 | `Source` | Where the words came from: a row, or a message relayed by the chairman with its date. A reader must be able to tell relayed from first-hand. |

**How a record is written.** A record is a `## Run N` heading followed by one `- **Field:** value` line per
field. A value may continue on lines indented by two spaces, which is how a blockquote is held under
`Worth your time`. Anything else under the heading, such as the quoted points below, is not a field and is
not read as one.

## Run 1

- **Run:** 1
- **Date:** NOT STATED
- **Who:** first outsider
- **Was the app theirs:** NOT STATED
- **Was it behind a login:** NOT STATED
- **Worth your time:** NOT STATED
- **What they did about a finding:** NOT STATED
- **Where they got stuck:** NOT STATED
- **Source:** Relayed by the chairman on 2026-09-24 (~08:06Z), not first-hand. Recorded in PLAN.md, "UPDATE
  2026-09-25: B1 is closed", and in #2262 (`ceo`, 2026-09-25 11:26Z); the chairman ruled on 2026-09-25 that this
  feedback is B1's outsider reaction. PLAN.md records `Worth your time` and `Was the app theirs` as NOT STATED
  and `ceo`'s 2026-09-24 reading of the app as a public page was `ceo`'s, not the outsider's. The run's own date
  was not given: 2026-09-24 is when the feedback was relayed.

**Their three points, as PLAN.md quotes them (the chairman's words, not restated here):**

1. in the YAML, `task: Send an enquiry` "doesn't do anything" as far as the person running the workflow can see.
2. "most people want more than one page validated on their website", by navigating to where the user says or from
   a list of links they supply.
3. "the majority of users who will get loads of value out of this aren't just marketing sites. It's actually proper
   SaaS products", and their challenge is that this is "usually behind auth".

Each became its own row: `task:` honesty #2268, a list of URLs #2272, authenticated capture #2359 (ADR 0038).
