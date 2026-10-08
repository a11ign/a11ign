// A WORKER ON ANOTHER MACHINE CAN REACH THE DECLARED-IdP FIXTURE, AND A SCRIPT PRINTS THE COMMAND THAT CAPTURES IT (#4110, #4084 outcome 1).
//
// Four claims, each with a control that shows the reading able to differ:
//   1. `host` + `publicHost`: the URLs the fixture hands out NAME the public host while the bound address still answers. The CONTROL is
//      the same call with `publicHost` left out, whose URLs name the bind address.
//   2. With neither option the fixture is today's: loopback bind, `127.0.0.1` in every URL it hands out.
//   3. The serve script refuses a wildcard bind without `--public-host`, naming the flag; with one it starts.
//   4. The command the script PRINTS parses with the CLI's own `parseArgs`, and the flows file it names loads through the CLI's own
//      flows reader with `idp-origins:` declared and the IdP's origin in it. The script is RUN as a child process, so the printed text
//      is the real one. The CONTROL is the flows file with the `idp-origins:` block removed, which the same reader reads as declaring none.
//   5. The printed command reaches a worker only over loopback (ADR 0038 Constraint 1): with a remote `--worker` the CLI exits 2 with
//      `auth-refused-remote-worker`, so the script says so beside the command (#4172). The CONTROL is a loopback `--worker`, which gets no
//      such sentence, and the script's loopback test is held to the CLI's own `isRemoteWorker` over a list of addresses.
//
// NOTHING HERE REACHES A WORKER: it proves the printed command is well-formed, not that a worker opened the fixture (#4107's reading).
import { after, describe, test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { parseArgs } from "../cli.js";
import { parseFlowsFile } from "./flows.js";
import { startCrossOriginIdp } from "./fixtures/cross-origin-idp.mjs";
import { readServeOptions, remoteWorkerNotice } from "./fixtures/serve-cross-origin-idp.mjs";
import { isRemoteWorker } from "./refusals.js";

const SERVE_SCRIPT = fileURLToPath(new URL("./fixtures/serve-cross-origin-idp.mjs", import.meta.url));
const WORKER_URL = "http://worker.example.test:8765";
const LOGIN_FLOW = "login";
const COMMAND_PREFIX = "npm run witness -- ";

const portOf = (url: string) => new URL(url).port;
const scratch: string[] = [];
after(async () => { await Promise.all(scratch.map((dir) => rm(dir, { recursive: true, force: true }))); });

describe("host and publicHost", () => {
  test("the URLs name the public host while the bound address still answers", async () => {
    const fixture = await startCrossOriginIdp({ host: "127.0.0.1", publicHost: "localhost" });
    try {
      assert.equal(new URL(fixture.appUrl).hostname, "localhost");
      assert.equal(new URL(fixture.idpUrl).hostname, "localhost");
      const direct = `http://127.0.0.1:${portOf(fixture.appUrl)}`;
      const login = await fetch(`${direct}/login`, { redirect: "manual" });
      assert.equal(login.status, 302);
      const location = new URL(login.headers.get("location") ?? "");
      assert.equal(location.origin, fixture.idpUrl, "the redirect names the public host, on the IdP's port");
      assert.equal(decodeURIComponent(location.searchParams.get("redirect_uri") ?? ""), `${fixture.appUrl}/callback`);
      assert.equal((await fetch(`http://127.0.0.1:${portOf(fixture.idpUrl)}${location.pathname}${location.search}`)).status, 200);
    } finally { await fixture.stop(); }
  });

  test("CONTROL: the same bind with no publicHost names the bind address", async () => {
    const fixture = await startCrossOriginIdp({ host: "127.0.0.1" });
    try {
      assert.equal(new URL(fixture.appUrl).hostname, "127.0.0.1");
    } finally { await fixture.stop(); }
  });

  test("with neither option the URLs and the bind are today's: loopback", async () => {
    const fixture = await startCrossOriginIdp();
    try {
      assert.match(fixture.appUrl, /^http:\/\/127\.0\.0\.1:\d+$/);
      assert.match(fixture.idpUrl, /^http:\/\/127\.0\.0\.1:\d+$/);
      assert.notEqual(portOf(fixture.appUrl), portOf(fixture.idpUrl), "two ports, which are two origins");
    } finally { await fixture.stop(); }
  });

  test("a wildcard bind with a public host starts, and answers on loopback", async () => {
    const fixture = await startCrossOriginIdp({ host: "0.0.0.0", publicHost: "localhost" });
    try {
      assert.equal(new URL(fixture.appUrl).hostname, "localhost");
      assert.equal((await fetch(`http://127.0.0.1:${portOf(fixture.appUrl)}/`)).status, 200);
    } finally { await fixture.stop(); }
  });
});

describe("the serve script's refusals", () => {
  test("--host 0.0.0.0 and --host :: with no --public-host are refused with a sentence naming --public-host", () => {
    for (const host of ["0.0.0.0", "::"]) {
      assert.throws(() => readServeOptions(["--out", "x", "--host", host]), /--public-host/);
    }
  });

  test("CONTROL: the same wildcard with a --public-host is accepted, and a missing --out is refused", () => {
    const options = readServeOptions(["--out", "x", "--host", "0.0.0.0", "--public-host", "192.0.2.10"]);
    assert.equal(options.publicHost, "192.0.2.10");
    assert.throws(() => readServeOptions(["--host", "127.0.0.1"]), /--out/);
  });
});

/** Run the script until it has printed its command line, then stop it. Resolves with everything printed. */
async function runServeScript(args: string[]): Promise<{ stdout: string; stderr: string; code: number | null }> {
  const child = spawn(process.execPath, [SERVE_SCRIPT, ...args], { stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const exited = new Promise<number | null>((resolve) => child.on("close", resolve));
  const printed = new Promise<void>((resolve) => {
    child.stdout.on("data", (chunk) => { stdout += chunk; if (stdout.includes(COMMAND_PREFIX)) resolve(); });
  });
  await Promise.race([printed, exited]);
  child.kill("SIGINT");
  return { stdout, stderr, code: await exited };
}

/** Split a printed line into arguments, honouring the double quotes the script adds around a path with a space. */
const tokens = (line: string) => [...line.matchAll(/"([^"]*)"|(\S+)/g)].map((match) => match[1] ?? match[2]);

describe("the printed command", () => {
  test("parses with the CLI's own parseArgs, and the flows file it names loads with idp-origins: declared", async () => {
    const out = await mkdtemp(join(tmpdir(), "serve-idp-"));
    scratch.push(out);
    const { stdout, stderr } = await runServeScript(["--out", out, "--host", "127.0.0.1", "--public-host", "localhost", "--worker", WORKER_URL]);
    assert.equal(stderr, "");
    const line = stdout.split("\n").find((candidate) => candidate.startsWith(COMMAND_PREFIX));
    assert.ok(line, `the script printed a command line:\n${stdout}`);
    const args = parseArgs(tokens(line.slice(COMMAND_PREFIX.length)));
    assert.equal(args.worker, WORKER_URL);
    assert.equal(args.loginFlow, LOGIN_FLOW);
    assert.equal(args.urls.length, 1, "the one app URL is the capture's page");
    assert.equal(new URL(args.url).hostname, "localhost");

    const text = await readFile(args.flows ?? "", "utf8");
    const file = parseFlowsFile(text, args.flows ?? "");
    assert.equal(file.origin, new URL(args.url).origin);
    const idp = stdout.split("\n").find((candidate) => candidate.startsWith("IdP URL:"))?.split(/\s+/).at(-1) ?? "";
    assert.deepEqual(file.idpOrigins, [idp]);
    assert.notEqual(new URL(idp).origin, file.origin, "the IdP is a second origin");
    assert.ok(file.flows.some((flow) => flow.name === LOGIN_FLOW));

    const without = parseFlowsFile(text.replace(/idp-origins:\n {2}- .*\n/, ""), "the control");
    assert.deepEqual(without.idpOrigins, [], "CONTROL: the reader reports no declaration when the block is absent");
  });

  test("a LAN bind says on start that the server is reachable from the network, and a loopback bind does not", async () => {
    const out = await mkdtemp(join(tmpdir(), "serve-idp-"));
    scratch.push(out);
    const lan = await runServeScript(["--out", out, "--host", "0.0.0.0", "--public-host", "localhost"]);
    assert.match(lan.stdout, /reachable from the network/);
    assert.match(lan.stdout, /fake credentials/);
    const local = await runServeScript(["--out", out]);
    assert.doesNotMatch(local.stdout, /reachable from the network/);
  });

  test("run as a process, --host 0.0.0.0 with no --public-host exits non-zero naming --public-host and starts nothing", async () => {
    const out = await mkdtemp(join(tmpdir(), "serve-idp-"));
    scratch.push(out);
    const { stdout, stderr, code } = await runServeScript(["--out", out, "--host", "0.0.0.0"]);
    assert.equal(code, 1);
    assert.match(stderr, /--public-host/);
    assert.equal(stdout, "");
  });
});

describe("the printed command and a remote worker", () => {
  const printed = async (worker: string[]) => {
    const out = await mkdtemp(join(tmpdir(), "serve-idp-"));
    scratch.push(out);
    return (await runServeScript(["--out", out, ...worker])).stdout.split("\n");
  };

  test("a LAN --worker prints the refusal beside the command, naming the fault and the constraint", async () => {
    const lines = await printed(["--worker", "http://203.0.113.7:8765"]);
    const command = lines.findIndex((line) => line.startsWith(COMMAND_PREFIX));
    assert.ok(command > 0, lines.join("\n"));
    assert.match(lines[command - 1], /auth-refused-remote-worker/, "the sentence is the line above the command");
    assert.match(lines[command - 1], /Constraint 1/);
  });

  test("CONTROL: a loopback --worker, and no --worker at all, print no such sentence", async () => {
    for (const worker of [["--worker", "http://127.0.0.1:8765"], []]) {
      const text = (await printed(worker)).join("\n");
      assert.doesNotMatch(text, /auth-refused-remote-worker|Constraint 1/, worker.join(" "));
      assert.ok(text.includes(COMMAND_PREFIX), "the command is still printed");
    }
  });

  test("the script's loopback reading agrees with the CLI's isRemoteWorker on every address", () => {
    const workers = [
      "http://127.0.0.1:8765", "http://127.9.9.9:1", "http://localhost:8765", "http://[::1]:8765", "http://[::ffff:7f00:1]:1",
      "http://203.0.113.7:8765", "http://worker.example.test:8765", "http://0.0.0.0:8765", "http://198.51.100.9:8765", "not a url",
    ];
    for (const worker of workers) {
      assert.equal(remoteWorkerNotice(worker) !== "", isRemoteWorker(worker), worker);
    }
  });
});
