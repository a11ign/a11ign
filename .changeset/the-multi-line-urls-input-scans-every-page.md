---
"a11ign": patch
---

The Action's multi-line `urls` input now scans every page it lists. With `urls: |` and one URL per line, as `examples/nightly-workflow.yml` and the docs show, a11ign 0.4.0 on a Windows runner scanned only the first page and reported success: a newline inside one argument does not survive `npx.cmd`. The list now reaches the CLI as one line, so the documented form scans every page. The `url`, `urls` and `max-pages` inputs also reach the scripts through `env:` rather than `${{ }}` inside `run:`, closing the script-injection shape (#4221).
