---
---

Names no release. The control plane's move to a ref (`fleet:deploy`, `lab:pipeline`), the lab's job fetch and reset, and the control-plane bootstrap now carry a layer's checkout beside the core's when `layers.json` gives that layer its own repository (#3396). With no such layer every one of them is unchanged. A layer whose checkout is absent refuses, naming the layer and the path; nothing falls back to the monorepo layout.
