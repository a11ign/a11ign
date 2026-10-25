Refs A11-253

Step 2 of 2 (a11ign): `.github/dependabot.yml` is now the output of `dependabot-config --write` from `@a11ign/toolchain` 0.11.0 (0.10.2 before), not a hand-written file. Every ecosystem runs weekly on Monday at 05:23 UTC, patch and minor updates share one `<ecosystem>-minor-and-patch` group so a major is its own pull request, and the packages frozen by policy are ignored in the npm entry. The pip entry (`/` and `/packages/scorer`) is new, `@guidepup/guidepup` and `@guidepup/setup` are now ignored, and `a11ign/a11ign` stays ignored for github-actions through `.github/dependabot-extra.json`.

Acceptance:

```bash
pnpm install --frozen-lockfile --ignore-scripts
# the committed file is exactly the template's output (exit 1 and a diff on drift)
pnpm exec dependabot-config --check
node --test packages/guards/src/dependabot-config.test.ts
# weekly at one fixed time, one group per ecosystem
test "$(grep -c 'interval: weekly' .github/dependabot.yml)" = 3
test "$(grep -c 'time: "05:23"' .github/dependabot.yml)" = 3
grep -q 'npm-minor-and-patch:' .github/dependabot.yml
grep -q 'pip-minor-and-patch:' .github/dependabot.yml
grep -q 'github-actions-minor-and-patch:' .github/dependabot.yml
# every package frozen by policy is ignored
for name in @a11ign/screenreader-worker @a11ign/screenreader-fleet @guidepup/guidepup @guidepup/setup; do grep -qF "dependency-name: \"$name\"" .github/dependabot.yml; done
```
