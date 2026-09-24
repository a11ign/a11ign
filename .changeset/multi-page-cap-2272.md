---
"a11ign": minor
---

**A run can now capture a list of pages, and two URLs are no longer one silent capture.** `witness <a> <b>` used to keep only the last URL and capture nothing about the first, with no word of it. It now captures both, in the order given, or refuses. The Action takes the same list as its new `urls` input, one URL per line, and exactly one of `url` and `urls` must be given (both or neither is refused before any setup is billed). A list of one behaves exactly as a single URL always did.

**The count comes first, and the cap is explicit.** Before any capture, and before any worker is leased, the run prints `N captures, about X minutes` with the file the estimate comes from (`docs/capture-cost.md`). A list above 5 captures is refused, naming the cap, the count and the override: `--max-pages N` on the CLI, `max-pages` on the Action, 25 at most. Nothing else raises it: no environment variable and no config file. On the Action the refusal names the cost in runner-minutes billed to your account, because there you pay for them. This is a list you write, not a crawl.

**Every page is reported on its own.** `--json` for a list is `{ "multiPage": true, "pages": [...] }`, one entry per URL in order. The Action's summary opens with a roll-up saying which pages tripped `fail-on`, then each page's report. A page whose capture fails is shown as failed, the pages after it still run, and it is never reported as clean. With a `forms` config, every URL is checked against the config's origin before the first capture (#2272).

**A failed page no longer hides the report.** The Action's capture step used to stop at the CLI's exit 1 for a list in which a page failed, so the summary that names the failed page never ran. It now records the status, the Report step renders every page, and the job fails after the report exists. A PDF in a list is reported as not measured rather than crashing the outputs step.
