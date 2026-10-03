---
"a11ign": patch
---

**A page the trained scorer declined to score no longer reads as a clean page in the GitHub Action's comment (#3294).** On `https://www.gov.uk/` (run 37134253796) the scorer abstained (nearest training similarity 0.6476 against a 0.6557 floor), and the comment's bold headline still said "No lived-experience findings" with "No blocking findings: none", which a reader who stopped there took as a page that was read and found fine. An abstained verdict now renders "**Not scored: no lived-experience verdict for this page**" and "No blocking findings: not scored"; a scored page with no findings renders exactly as before. `docs/try-it.md` names abstention as a fourth tell that a zero count is not yet a clean read.
