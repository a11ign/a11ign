---
"@a11ign/scorer": patch
---

**`vague_link_lacks_context` (2.4.4) now recognises a bare "Click" link name, not only "Click here" (#1883).** The acceptance corpus's one two-word `vague`-link fixture (`b3-link-badge`, HTML text "Click here") announces as `"link, Click"` in NVDA's transcript on both repeat captures — confirmed against its eleven single-word siblings, which all announce and match exactly. A lone "Click" gives no more indication of a link's destination than "Here" or "Go" already in `VAGUE_LINKS`, so it joins that set.
