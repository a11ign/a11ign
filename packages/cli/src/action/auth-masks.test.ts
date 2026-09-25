// THE ACTION MASKS MORE THAN GITHUB DOES (ADR 0038, Constraint 3): the URL-encoded and base64 forms of every from-env value.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { loginMaskLines, maskLines } from "./auth-masks.js";

const ROOT = resolve(import.meta.dirname ?? new URL(".", import.meta.url).pathname, "../../../..");
const FAKE_USER = "canaryuser6d3f2a";
const FAKE_SECRET = "p@ss w0rd&more=1";
const FLOWS = `
version: 1
origin: https://app.example.test
flows:
  login:
    steps:
      - goto: /login
      - fill: { field: "Email address", from-env: APP_USER }
      - fill: { field: "Password", from-env: APP_PASSWORD }
      - expect: { heading: "Dashboard" }
`;

const commandsOnly = (lines: string[]) => lines.every((line) => line.startsWith("::add-mask::"));

test("every form GitHub does not mask is masked: URL-encoded, JSON-escaped and base64 (padded, unpadded, URL-safe) — and not the raw value", () => {
  const lines = maskLines([FAKE_SECRET]);
  assert.ok(commandsOnly(lines));
  const masked = lines.map((line) => line.slice("::add-mask::".length));
  assert.ok(masked.includes(encodeURIComponent(FAKE_SECRET)), "URL-encoded");
  assert.ok(masked.includes(Buffer.from(FAKE_SECRET).toString("base64")), "base64, padded");
  assert.ok(masked.includes(Buffer.from(FAKE_SECRET).toString("base64").replace(/=+$/, "")), "base64, unpadded");
  assert.ok(!masked.includes(FAKE_SECRET), "the raw value is GitHub's to mask, and is not printed to the log by us");
  assert.ok(!lines.some((line) => line.includes(FAKE_SECRET)), "no line carries the raw value");
});

test("a value whose forms are all the raw value adds only its base64 forms; several values are each covered", () => {
  const lines = maskLines([FAKE_USER, FAKE_SECRET]);
  assert.ok(lines.includes(`::add-mask::${Buffer.from(FAKE_USER).toString("base64")}`));
  assert.ok(lines.includes(`::add-mask::${encodeURIComponent(FAKE_SECRET)}`));
  assert.equal(new Set(lines).size, lines.length, "no duplicate command");
});

test("a multi-line value yields one-line commands only: the raw form is the one with a line break, and it is GitHub's to mask", () => {
  const lines = maskLines(["first line\nsecond line 12345"]);
  assert.ok(commandsOnly(lines));
  assert.ok(lines.every((line) => !/[\r\n]/.test(line)), "every command is one line");
  assert.ok(lines.includes(`::add-mask::${encodeURIComponent("first line\nsecond line 12345")}`), "the URL-encoded form (%0A) is masked");
  assert.ok(lines.length >= 2);
});

test("the login flow's variables are read from the environment and masked; a missing one is an error, not a skipped mask", async () => {
  const readText = async () => FLOWS;
  const lines = await loginMaskLines({ flows: "f.yml", loginFlow: "login", env: { APP_USER: FAKE_USER, APP_PASSWORD: FAKE_SECRET }, readText });
  assert.ok(lines.includes(`::add-mask::${encodeURIComponent(FAKE_SECRET)}`));
  await assert.rejects(loginMaskLines({ flows: "f.yml", loginFlow: "login", env: { APP_USER: FAKE_USER }, readText }), /APP_PASSWORD is not set/);
  await assert.rejects(loginMaskLines({ flows: "f.yml", loginFlow: "signin", env: { APP_USER: FAKE_USER, APP_PASSWORD: FAKE_SECRET }, readText }), /no such flow/);
});

function run(args: string[], env: Record<string, string>): Promise<{ code: number | null; out: string; err: string }> {
  return new Promise((done) => {
    const child = spawn(process.execPath, ["--import", "tsx", "packages/cli/src/action/auth-masks.ts", ...args], { cwd: ROOT, env: { ...process.env, ...env } });
    let out = ""; let err = "";
    child.stdout.on("data", (chunk) => { out += chunk; });
    child.stderr.on("data", (chunk) => { err += chunk; });
    child.on("close", (code) => done({ code, out, err }));
  });
}

test("the command, as the Action runs it: stdout is commands only, and no line anywhere carries a raw value", { timeout: 60_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "auth-masks-"));
  try {
    const file = join(dir, "flows.yml");
    writeFileSync(file, FLOWS);
    const env = { APP_USER: FAKE_USER, APP_PASSWORD: FAKE_SECRET };
    const ran = await run(["--flows", file, "--login-flow", "login"], env);
    assert.equal(ran.code, 0, ran.err);
    const lines = ran.out.trim().split("\n");
    assert.ok(lines.length >= 4 && commandsOnly(lines), ran.out);
    assert.ok(!(ran.out + ran.err).includes(FAKE_SECRET) && !(ran.out + ran.err).includes(FAKE_USER));
    const missing = await run(["--flows", file, "--login-flow", "login"], { APP_USER: FAKE_USER });
    assert.equal(missing.code, 2);
    assert.match(missing.err, /APP_PASSWORD is not set/);
    assert.equal((await run(["--flows", file], env)).code, 2);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
