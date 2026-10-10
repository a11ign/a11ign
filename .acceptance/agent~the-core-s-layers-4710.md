`layers.json` `pinned.control.tag` moves `v0.3.0` to `v0.3.2`, the control tag that carries #4708's protocol-guard fix (`PROTOCOL_VERSION_FILE = "protocol-version.ts"`). One line; no script name or `package.json` line needed to follow.

Measured: `git -C /home/agent/repos/control show v0.3.2:src/fleet-playbook.ts` line 15 reads `export const PROTOCOL_VERSION_FILE = "protocol-version.ts";`. v0.3.0 and v0.3.1 do not carry it.

Acceptance: bash -c 'case "$(node -p "require(\"./layers.json\").pinned.control.tag")" in v0.3.0|v0.3.1) exit 1;; *) exit 0;; esac'

Closes #4710
