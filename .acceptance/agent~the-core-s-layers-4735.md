`layers.json` `pinned.control.tag` moves `v0.3.2` to `v0.3.3`, the control tag that carries `fleet-watch`'s `control-unit-drift` reading (control#38, #4714). One line; nothing else in the file changes.

Measured: `git -C /home/agent/repos/control grep -c control-unit-drift v0.3.3 -- src/fleet-watch.ts` prints `3`, and the same against `v0.3.2` prints nothing (that file has no hit). `git ls-remote https://github.com/a11ign/control refs/tags/v0.3.3` resolves to `e4389dd94e9c2d0734c255c8f20a0812afbbfa98`.

Acceptance: node -e 'const l=JSON.parse(require("fs").readFileSync("layers.json","utf8")); const e=Object.values(l.pinned??l).find(x=>x&&x.remote&&/control/.test(x.remote)); process.exit(e&&e.tag==="v0.3.3"?0:1)'

Closes #4735
