---
"a11ign": patch
---

`--json` now carries `sweepStarts`: the document each sweep began on, read from the capture's per-sweep `pageState` marks (served origin and path, never the query; absent when the capture has none). The job summary uses it to say which page the form-field sweep began on beside an asserted finding read from that list, keeping "may have been read on either" for entries after a pressed submit, since a start is not the page of a later entry (#3629).
