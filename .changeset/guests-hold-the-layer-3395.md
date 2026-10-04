---
---

Names no release (`@a11ign/control` is private). The guest plays can hold a layer that lives in its own repository as a second checkout, pinned to its own commit beside the core's: `fleet:deploy` takes `--layer-ref=<layer>=<sha>`, the deploy, provision and provision-role plays fetch, merge and assert each half separately, the two origin plays take a layer's remote by name, and the bootstrap script reads the same `layers.json`. No layer declares a `remote` yet, so nothing a worker does changes (#3395).
