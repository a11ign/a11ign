---
"a11ign": patch
---

The screen loop reads an unnamed alert from the text beneath it, as the CLI's `screenOf` already did, so a rejected one-time code reaches the trail (#5704). `textUnder` moves to `interpreter.ts` and both readers import it. Nothing user-visible changes until the next wrong-code run.
