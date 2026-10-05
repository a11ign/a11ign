---
"a11ign": patch
---

An ASSERTED finding's row in the Action's summary now says where its evidence sits in the result: the JSON path of the entry (`transcript[36]`, `structure.formFields[4]`), the entries either side of it, and every identical entry. On a capture that names more than one document it also says the capture does not record which one the control was read on, and, when the sweep pressed a submit earlier in the same list, that it may have been read on either side of it. Until now a bare `edit` named neither the control nor its page (#3617). A referred finding's row is unchanged.
