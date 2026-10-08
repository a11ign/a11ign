---
"a11ign": minor
---

**The Action's `probe-forms` input now defaults to `false`.** If your workflow relied on the old default, set `probe-forms: "true"` to keep submitting your forms with no valid input and reading what the page announces; a run that leaves it off logs that success criteria 3.3.1 and 4.1.3 were not assessed. `probe-forms` presses buttons, so `SECURITY.md` has a new section on running it against a staging app rather than production (#4108).

A flows file may now list `idp-origins:`, the identity-provider origins a login passes through. Each must be an exact `http(s)` origin: a wildcard, a path, a credential, or your app's own origin is refused when the file loads. Those origins are allowed between the login's steps and nowhere else, so a run that ends parked on the provider is still reported as `left-origin` (#4106).

The Action summary and the terminal report now name the WCAG 2.2 criteria the run did not cover (2.4.11, 2.5.7, 3.2.6, 3.3.7 and 3.3.8 on the recorded run) and say that their absence from the findings is not a pass (#4098).

`examples/nightly-workflow.yml` is a scheduled workflow whose timeout and monthly budget are read from `docs/capture-cost.md`. It is an example only and changes nothing in the package's code (#4096).
