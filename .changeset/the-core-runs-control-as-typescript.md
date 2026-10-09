---
---

The core's 19 `package.json` scripts that ran `node packages/control/src/<f>.mjs` run `node --import tsx packages/control/src/<f>.ts` (#4343), and `layers.json` pins `control` at v0.1.17, the first release whose `src/` holds the TypeScript entry points and whose `layerPinTag` names the tag the layer really made (a11ign/control#26 and #27, #4341, #4363). Scripts and pin move together: a script naming a file the laid layer does not carry does not start. Nothing this workspace exports or ships changed.
