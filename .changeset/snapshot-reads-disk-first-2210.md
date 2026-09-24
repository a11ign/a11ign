---
"@a11ign/lab": patch
---

**`corpus:snapshot` takes its disk reading BEFORE it writes the archive, so a capture arriving mid-run no longer refuses a healthy backup (#2210).** The hollow-archive byte guard (#1936) compared the archive's byte total against a walk of the disk taken AFTER `tar` had run, so the two were equal by construction and any file landing in the few seconds between them made `archived.bytes < onDiskBytes` true, printing "N did not make it in" about an archive that was complete when it was written. Read first, the reading can only be smaller than what the archive then holds and the guard stays quiet on an arrival; a genuinely short archive (a link `tar` stored at 0 bytes, a truncated write) is still refused with exit 2.
