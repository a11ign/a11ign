# Support

This page collects what the repository already says about getting help. It adds no commitment of its own.

## Where to ask

- **A finding looks wrong**, reports a barrier that is not there, or misses one that is: open an issue with the [“A finding looks wrong” template](.github/ISSUE_TEMPLATE/false-finding.md).
- **A capture worker is broken** (NVDA, the Windows worker, or the fleet): open an issue with the [“A capture worker is broken” template](.github/ISSUE_TEMPLATE/worker-problem.md). Its first step is the [NVDA worker runbook](docs/nvda-worker-runbook.md).
- **Anything else**: a blank issue is enabled (see [`config.yml`](.github/ISSUE_TEMPLATE/config.yml)).
- **A security vulnerability**: do not open a public issue for anything exploitable. Report it privately through [GitHub's security advisory form](https://github.com/a11ign/a11ign/security/advisories/new), as [SECURITY.md](SECURITY.md) describes.
- **A code change**: see [CONTRIBUTING.md](CONTRIBUTING.md).

## What is promised

> There is no SLA. This is a small project with one maintainer, and saying so is more useful than promising a response time nobody is on call to meet.

That is [SECURITY.md](SECURITY.md)'s own sentence. This page promises no response time, no fix time and no support window beyond it.

## Who maintains it

One person maintains the project, as [SECURITY.md](SECURITY.md) says. The code is written by an agent organisation, described in [docs/README.md](docs/README.md) under “Running the agent organisation”, and changes reach `main` only through the approving review that the branch protection requires.

## What is not offered

- **A VPAT or ACR** (an accessibility conformance report). The evidence the tool writes is for an assessor to use; it is not a VPAT or an ACR and it does not state conformance. See [docs/evidence-pack.md](docs/evidence-pack.md).
- **A hosted service.** The [README](README.md) says a hosted layer on top of the open core comes only if the GitHub Action proves demand.
- **Legal advice.** [docs/licence-faq.md](docs/licence-faq.md) describes the licence text. It says: “This is a description of the licence text, not legal advice; ask your own counsel for your case.”
