---
---

Names no release. The worker-code readers in `worker-fleet` now read git from the worker package's own source directory instead of naming a monorepo path, and the control plane asks `layers.json` where the worker lives (#3394). Nothing a consumer can observe changes.
