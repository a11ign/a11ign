---
"a11ign": patch
"@a11ign/screenreader-fleet": patch
---

**`npx a11ign` on a machine with no worker and no UTM VM no longer prints a notice about a UTM VM.** The run printed `DEPRECATED: this run (no worker named, no fleet configured) manages a local UTM worker VM`, and pointed at a `CLAUDE.md` that is not in the install, before it had looked for a VM; nothing was managed, and the run went on to the same "No capture worker answered" refusal. The notice is now printed only when a local VM is found, so a Mac that still has a UTM guest is still told.
