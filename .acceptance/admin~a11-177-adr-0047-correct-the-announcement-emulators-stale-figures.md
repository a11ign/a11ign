ADR 0047's Q2 bullet and its layer 1 row now say what the announcement emulator spike's write-up says, each with a dated correction mark and a link to the write-up pinned to the Gate's merge commit (`40b2d3b`, a11ign/announcement-emulator#5). Q2 reads 47 tests, 193 speech assertions (227 exact-speech assertion executions), where it read "51 tests, about 220 exact-speech assertions". Layer 1 now names `chrome.automation.getDesktop()`. The ADR never said `getTree`, so the correction mark does not claim it did. Nothing else in the ADR changes.

Acceptance: bash -c 'set -euo pipefail
f=docs/adr/0047-an-nvda-faithful-announcement-emulator-is-a-separate-repository-and-its-predictions-are-advisory.md
sha=40b2d3bb19b7a39546001272bd003de3d655f528
url="https://github.com/a11ign/announcement-emulator/blob/$sha/docs/announcement-emulator-spike.md"
w=$(curl -sf "https://raw.githubusercontent.com/a11ign/announcement-emulator/$sha/docs/announcement-emulator-spike.md")
grep -qF "holds **47** test cases" <<<"$w"
grep -qF "**193 speech assertions and 26 braille**" <<<"$w"
grep -qF "it evaluates **227** assertion executions" <<<"$w"
grep -qF "chrome.automation.getDesktop()" <<<"$w"
grep -qF "**47 tests, 193 speech assertions (227 exact-speech assertion executions)**" "$f"
grep -qE "^\| 1 \| \*\*Tree source\*\* \|.*chrome\.automation\.getDesktop\(\)" "$f"
[ "$(grep -cF "$url" "$f")" -ge 2 ]
[ "$(grep -cF "51 tests" "$f")" -eq 1 ]
[ "$(git diff --name-only origin/main...HEAD | grep -vE "^\.(acceptance|changeset)/")" = "$f" ]
! git diff -U0 origin/main...HEAD -- "$f" | grep -E "^-" | grep -v "^---" | grep -vE "^-\| 1 \| \*\*Tree source\*\* \||^-  \(`tests/system/robot/chromeTests\.py`"
echo PASS'
