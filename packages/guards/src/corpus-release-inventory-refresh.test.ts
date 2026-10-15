// no-token: none -- runs the unit's own refresh line against a stub `ssh` in a temp HOME; never reaches `gh`, the fleet or the network
/**
 * #5518: THE NIGHTLY CORPUS RELEASE'S `lab:fetch` MUST FIND THE LAB, AND THE LINE THAT GIVES IT ITS INVENTORY MUST BEHAVE.
 *
 * The agents host holds no control-layer `inventory.yml`, so `lab-fetch.yml` matched no `a11y_lab` host and refused (the 2026-10-15 firing). The unit now points Ansible at a copy
 * under `~/.config/a11ign/` and refreshes it from the control plane in an `ExecStartPre`. A source-text match on that line would pass if it stopped writing the file, so this
 * RUNS the line, exactly as the unit spells it (`$$` is systemd's `$`), with a stub `ssh` that stands in for the control plane.
 *
 * WHAT IS PINNED: a good read lands in the path `ANSIBLE_INVENTORY` names, at mode 0600, with no `.new` left; a failed or EMPTY read leaves yesterday's copy standing; the host
 * is read from `A11Y_CONTROL_HOST_FILE` and the one file asked for is the control plane's installed inventory. Where `ansible-inventory` is installed, the copy is also
 * read by Ansible itself and must resolve an `a11y_lab` group.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const unit = readFileSync(fileURLToPath(new URL("../../../.agent-org/units/a11ign-corpus-release-nightly.service", import.meta.url)), "utf8");
const directives = unit.split("\n").map((l) => l.trim()).filter((l) => l !== "" && !l.startsWith("#"));

/** The `ExecStartPre=-/bin/sh -c '<script>'` line that refreshes the copy, as the script text systemd would hand the shell. */
function refreshScript(): string {
  const line = directives.find((d) => d.startsWith("ExecStartPre=-/bin/sh -c '") && d.includes("/etc/a11ign/inventory.yml"));
  assert.ok(line, "the unit has no ExecStartPre that refreshes the inventory copy from the control plane");
  return line.slice("ExecStartPre=-/bin/sh -c '".length, -1).replaceAll("$$", "$");
}

const INVENTORY = "all:\n  children:\n    a11y_lab:\n      hosts:\n        a11y-lab:\n          ansible_host: 192.0.2.10\n";

type Stub = { mode: "ok" | "fail" | "empty"; };

/** A temp HOME with a stub `ssh` (records its argv) and a control-host file, then the refresh run against it. */
function fire({ mode }: Stub, previous?: string) {
  const home = mkdtempSync(join(tmpdir(), "inventory-refresh-"));
  const bin = join(home, "bin");
  const config = join(home, ".config", "a11ign");
  mkdirSync(bin, { recursive: true });
  mkdirSync(config, { recursive: true });
  writeFileSync(join(config, "control-host"), "192.0.2.1\n");
  if (previous !== undefined) writeFileSync(join(config, "inventory.yml"), previous);
  const stub = [
    "#!/bin/sh",
    `echo "$@" > "${home}/ssh-argv"`,
    `case "${mode}" in ok) printf '%s' '${INVENTORY}';; fail) printf 'partial'; exit 255;; empty) exit 0;; esac`,
  ].join("\n");
  writeFileSync(join(bin, "ssh"), stub);
  chmodSync(join(bin, "ssh"), 0o755);
  const ran = spawnSync("/bin/sh", ["-c", refreshScript()], {
    env: { PATH: `${bin}:/usr/bin:/bin`, HOME: home, A11Y_PVE_KEY: join(home, "key"), A11Y_CONTROL_HOST_FILE: join(config, "control-host") },
    encoding: "utf8",
  });
  const copy = join(config, "inventory.yml");
  return { home, copy, status: ran.status, argv: existsSync(join(home, "ssh-argv")) ? readFileSync(join(home, "ssh-argv"), "utf8") : "" };
}

test("positive control: a good read lands at the path ANSIBLE_INVENTORY names, mode 0600, with no .new left", () => {
  const named = directives.find((d) => d.startsWith("Environment=ANSIBLE_INVENTORY="));
  assert.equal(named, "Environment=ANSIBLE_INVENTORY=%h/.config/a11ign/inventory.yml");
  const run = fire({ mode: "ok" });
  try {
    assert.equal(run.status, 0);
    assert.equal(readFileSync(run.copy, "utf8"), INVENTORY);
    assert.equal(statSync(run.copy).mode & 0o777, 0o600);
    assert.equal(existsSync(`${run.copy}.new`), false);
    assert.match(run.argv, /root@192\.0\.2\.1 cat \/etc\/a11ign\/inventory\.yml/, `ssh was asked: ${run.argv}`);
  } finally { rmSync(run.home, { recursive: true, force: true }); }
});

test("a failed read leaves yesterday's copy standing and no .new behind", () => {
  const run = fire({ mode: "fail" }, "yesterday\n");
  try {
    assert.equal(readFileSync(run.copy, "utf8"), "yesterday\n");
    assert.equal(existsSync(`${run.copy}.new`), false);
  } finally { rmSync(run.home, { recursive: true, force: true }); }
});

test("an EMPTY read is not written over yesterday's copy", () => {
  const run = fire({ mode: "empty" }, "yesterday\n");
  try {
    assert.equal(readFileSync(run.copy, "utf8"), "yesterday\n");
    assert.equal(existsSync(`${run.copy}.new`), false);
  } finally { rmSync(run.home, { recursive: true, force: true }); }
});

const ansibleInstalled = spawnSync("ansible-inventory", ["--version"], { encoding: "utf8" }).status === 0;

test("Ansible resolves the a11y_lab group from the refreshed copy", { skip: ansibleInstalled ? false : "ansible-inventory is not installed here" }, () => {
  const run = fire({ mode: "ok" });
  try {
    const listed = spawnSync("ansible-inventory", ["--list"], {
      env: { PATH: process.env.PATH ?? "", HOME: run.home, ANSIBLE_INVENTORY: run.copy }, encoding: "utf8",
    });
    assert.equal(listed.status, 0, listed.stderr);
    assert.deepEqual(JSON.parse(listed.stdout).a11y_lab.hosts, ["a11y-lab"]);
  } finally { rmSync(run.home, { recursive: true, force: true }); }
});
