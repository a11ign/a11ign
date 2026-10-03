---
"a11ign": patch
---

**The Action's summary now lists the controls a non-authenticated run pressed, by name (#3297).** On the default settings, `probe-forms` submits forms with no valid input and `probe-navigation` follows a link, and the comment said none of it: a run against gov.uk submitted the search form empty twice and toggled two sort radios, and the reader rebuilt that from `interaction.formChanges` in the JSON. The summary now has a **What this run pressed on its own** section, one line per control as the screen reader announced it (never a value), capped at the summary's row limit with the remainder counted, and says where a submit took the run. An authenticated run still lists its own whole `pressed` list, unchanged.
