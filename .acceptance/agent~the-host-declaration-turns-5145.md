`.agent-org/host.json` carries `"workers": { "haikuBrief": true }` at its top level, where `haikuBriefEnabled` (a11ign/agent-org `src/haiku-brief.ts`) reads it. Before this change the key was absent there and the reader answered off; #5138 had set it in `project.json` only, which the reader never reads. Read at agent-org v0.171.3: the reader returns `true` on the edited file, `false` on the file as it was at HEAD, and `false` with the value flipped. Revert: set the key `false` or remove it.

Acceptance: jq -e '.workers.haikuBrief == true' .agent-org/host.json

Closes #5145
