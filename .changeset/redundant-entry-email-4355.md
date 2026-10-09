---
"@a11ign/judge": minor
---

3.3.7 Redundant Entry can now produce a finding: a later REQUIRED `type="email"` control that stayed empty after an earlier email control in the same form was filled is a REFERRED finding (`secondary`, so `cantTell`, never asserted). The pairing reads the input type and never the label, so a password confirmation (the criterion's own security exception) stays silent. It is read from optional `formInputs[].form`, `.required` and `.populatedFromEarlier`, and silent when any is absent. The criterion's coverage note no longer says W3C shows the email-and-confirm form: the Understanding page and G221 contain no such example, and the failure is a reading of its text (#4355). No worker-side census populates the fields on a real capture yet, so the rule has not fired on a real page.
