---
---

Printed hints (the scorer's rebuild commands and refusal text, the release-gate warning, the pre-push NOT RUN line) and the prose that quoted them now say that `lab:job`, `fleet:*` and `doctor` run from a11ign/control's checkout, where they moved in #5170. No behaviour changes and no consumer sees a difference (#5171).
