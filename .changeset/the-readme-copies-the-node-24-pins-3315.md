---
"a11ign": patch
---

**The Quickstart in the package README copies the Node 24 action majors (#3315).** Its `actions/checkout` step was still `@v4`, so a workflow copied from the npm page opened with the same "Node.js 20 is deprecated" annotation the Action's own guide had already stopped producing (#3298). It now reads `actions/checkout@v7`; nothing the CLI does has changed.
