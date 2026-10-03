---
"@a11ign/evidence": patch
---

**A run whose form probe left the page now says it spans more than one document (#3293).** On `https://www.gov.uk/` the census was read from the home page, `probe-forms` then submitted the search form, and the one title mark was read afterwards, so the record held two pages while every identity component had a single value and the `THIS CAPTURE NAMED MORE THAN ONE DOCUMENT` sentence never fired. `documentIdentity` now also reads the `from` and `to` of `interaction.navigatedOnSubmit` as served pages: a submit that moved the document to another path makes `servedPath` unstable, so the log and the PR comment carry the sentence. A submit can only contradict a census read, never supply an identity where none was read, and a self-reload (same path, new query) changes nothing. A consumer sees a new, accurate warning on runs where the probe submitted a form that navigated; no input, option or output field changes.
