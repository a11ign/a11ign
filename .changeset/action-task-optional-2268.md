---
"a11ign": patch
---

**The Action's `task` input is optional, and says what it does (#2268, #2262 ruling a).** It names a button for the probe to press, by a word from that button's label; it is a label for the report; and it does NOT change the analysis. An unset input reached the CLI as `--task ""`, and `argv[++i] ?? args.task` only falls back on a missing value, so an optional input left unset would have run with an empty task and printed a blank `Task:` line. The workflow now passes `--task` only when the input says something, and the CLI treats an empty or blank `--task` as no task. The report's `Task:` line and the summary's `**Task:**` line carry one shared note (`TASK_LABEL_NOTE`) that they echo an input and are not a finding. README no longer says `--task` "is not a label".
