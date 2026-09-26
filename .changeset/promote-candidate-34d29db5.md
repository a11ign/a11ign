---
"@a11ign/scorer": minor
---

Retrained scorer weights (`candidate`).

**Minor, because no public package has reached 1.0 — the weights ARE the API all the same.** A consumer's
build can go from passing to failing with no code change on their side. Under 0.x that ships as a minor, and
from 1.0 every retrain is a major.

Provenance, so a disputed finding can be traced to the model that produced it:

- records: `3131`
- in-distribution floor: `0.641`
- derived floor: `0.641`
- floor source: `training-set-minimum`
- encoder: `53aa51172d142c89d9012cce15ae4d6cc0ca6895895114379cacb4fab128d9db`
- feature schema: `screenreader-structured-v20`

Per-subtype thresholds:

- `1.1.1:filename-alt` threshold `0.47593995928764343`
- `1.1.1:generic-alt` threshold `0.24921363592147827`
- `1.1.1:missing-alt` threshold `0.29440420866012573`
- `1.3.1:fake-heading` threshold `0.2815135717391968`
- `1.3.1:no-headings` threshold `0.6153499484062195`
- `1.3.1:unassociated-table` threshold `0.14784492552280426`
- `1.4.13:focus-panel-undismissable` threshold `0.9634076952934265`
- `2.1.1:control-unreachable-by-keyboard` threshold `0.9476061463356018`
- `2.1.2:focus-trapped` threshold `0.9982160329818726`
- `2.4.1:skip-link-inert` threshold `0.9926456809043884`
- `2.4.2:route-title-stale` threshold `0.9887033700942993`
- `2.4.3:focus-order-scrambled` threshold `0.9782115817070007`
- `2.4.4:regex` threshold `0.09400103241205215`
- `2.4.6:regex` threshold `0.5800648331642151`
- `3.2.1:focus-context-change` threshold `0.979412853717804`
- `3.2.2:input-context-change` threshold `0.9776179790496826`
- `3.3.1:validation-error-silent` threshold `0.9703592658042908`
- `3.3.3:error-remedy-missing` threshold `0.9668549299240112`
- `4.1.2:state-change-silent` threshold `0.8793109059333801`
- `4.1.2:unnamed-control` threshold `0.1964053362607956`
- `4.1.3:form-activation-silent` threshold `0.8376579284667969`
- `4.1.3:status-progress` threshold `0.8744080662727356`
- `4.1.3:status-waiting` threshold `0.9200663566589355`

Held-out acceptance: passed.

**Accepted with a known regression against the previously shipped weights.** The held-out lines taken with `--accept-regression`:

- 4.1.3 held-out precision 1.000 -> 0.875
- 4.1.3 held-out recall 1.000 -> 0.609

**Shipped with a silent head, by a `ceo` ruling (#2536).** These heads are silent at their operating point: the model does not detect what they exist to detect (for `4.1.3:status-waiting`, waiting-status announcements).

- 4.1.3:status-waiting: SILENT — 0 of 29 positive record(s) found at threshold 0.9200663566589355. A head that reports nothing scores perfect precision, which is why this is checked apart from the false-positive bound.
