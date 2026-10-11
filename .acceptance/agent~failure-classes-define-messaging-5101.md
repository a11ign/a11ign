The work tick logs `org-health: class-repeat UNKNOWN ... class:messaging-audience-misuse (not in .agent-org/failure-classes.json)` on every reading. It is an EVENT kind, not a row label: agent-org `auditMessaging` (`src/messaging/audit.ts`, a11ign#4746) writes it to the failure ledger, and no row carries a `class:messaging-audience-misuse` label. The kind had no definition, the same shape as the route-costlier kind. This adds ONE definition and touches no other class, `seed`, or file.

- `guard` is **null**, deliberately. `auditMessaging` is in force but only RECORDS: it reads each delivered message after it was sent and sends nothing back, so it cannot stop the class. A control that records is a `guardNote`, not a guard.
- The `guardNote` states what was READ, not what the detector does. Both ledger refs (providerMessageId 4 and 140 in `~/.local/state/agent-org/messaging/ledger.jsonl`) were read in full. Both are release announcements that quote a changelog line containing the `answer:` prefix (`answer:ceo`, `no answer: label`). Neither ends a line in `?`, and neither contains the word reply. So both are FALSE FLAGS, and the detector over-fires on release announcements. That finding goes to a row in a11ign/agent-org and is not fixed here.
- Defining the kind does not change the ledger or the detector. The next tick's `org-health` line should stop calling it UNKNOWN; that is an expectation, not a reading made here.

Re-read against agent-org source (`wt-agent-org-4877`, d606afb2, 2026-10-10) and the live messaging ledger, not against the log line. The installed binary was not checked.

Acceptance: python3 -I -c "import json;c=[x for x in json.load(open('.agent-org/failure-classes.json'))['classes'] if x['id']=='messaging-audience-misuse'];assert len(c)==1 and c[0]['guardNote'] and isinstance(c[0]['seed'],list)"

Mutation: the same predicate against `HEAD:.agent-org/failure-classes.json` (before this change) fails with an AssertionError; against the edited file it passes. The file is data, so there is no detector to break in the other direction.
