// THE MECHANISM 3 SPIKE (ADR 0038, #4087): can this repository's driver attach to a browser a PERSON launched and signed into?
//
// Two halves, kept apart on purpose:
//   - `runQuestion` drives a REAL Chromium and prints what it saw. It is run by hand (`node --import tsx <this file> <q1|q2|q3>`)
//     and its output is pasted into `docs/auth-attach-spike.md`. `--import tsx` because the driver it exercises is TypeScript and the
//     agent host's plain `node` has no type stripping.
//   - `checkSpikeDocument` reads only the DOCUMENT. It is what `attach-spike.test.ts` runs, so the test needs no browser and no
//     libraries and never skips: it asserts the SHAPE of the result (a verdict, a transcript per question, citations that exist).
//
// The person's sign-in is a stand-in: a mouse click sent over a raw CDP socket, by a different process from the one that attaches.
// It is not a human at a keyboard and not an identity provider, and the document says so.
import { spawn, execFileSync } from "node:child_process";
import { createServer, request } from "node:http";
import { createServer as createTcpServer, connect } from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { networkInterfaces, tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { pathToFileURL } from "node:url";

const SIGN_IN_HEADING = "Sign in";
const SIGNED_IN_HEADING = "Welcome back, Dana";
const SETTLE_MS = 1500;
const READY_MS = 15_000;
const POLL_MS = 100;

/** A page that signs in IN PAGE MEMORY, the way the SDK of the outside evaluator does: no cookie, no storage, nothing to save. */
const FIXTURE_PAGE = `<!doctype html><html lang="en"><title>Fixture</title><body>
<h1 id="h">${SIGN_IN_HEADING}</h1><button id="b">Continue with the identity provider</button>
<script>let session = null;
document.getElementById('b').onclick = () => { session = { token: 'held-in-page-memory-only' };
  document.getElementById('h').textContent = '${SIGNED_IN_HEADING}'; document.getElementById('b').hidden = true; };</script>`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const say = (line = "") => process.stdout.write(`${line}\n`);

function chromePath() {
  const found = execFileSync("sh", ["-c", `ls -d "${homedir()}"/.cache/ms-playwright/chromium-*/chrome-linux*/chrome | tail -n 1`], { encoding: "utf8" });
  return found.trim();
}

async function freePort() {
  return new Promise((resolve) => {
    const probe = createTcpServer().listen(0, "127.0.0.1", () => { const { port } = probe.address(); probe.close(() => resolve(port)); });
  });
}

function startFixture() {
  return new Promise((resolve) => {
    const server = createServer((_req, res) => { res.setHeader("content-type", "text/html"); res.end(FIXTURE_PAGE); });
    server.listen(0, "127.0.0.1", () => resolve({ server, url: `http://127.0.0.1:${server.address().port}/` }));
  });
}

/** A browser started the way a person would start it: its own profile, a debugging port on loopback, the page already open. */
function startPersonBrowser({ port, url }) {
  const profile = mkdtempSync(join(tmpdir(), "attach-spike-profile-"));
  const args = [`--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--headless=new", "--no-sandbox", "--no-first-run", url];
  const child = spawn(chromePath(), args, { stdio: ["ignore", "ignore", "pipe"], env: process.env });
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const stop = async () => {
    const exited = new Promise((resolve) => child.once("exit", resolve));
    child.kill();
    await exited; // Chromium keeps writing its profile until it is gone; removing it first races the browser
    rmSync(profile, { recursive: true, force: true, maxRetries: 5 });
  };
  return { child, profile, stderr: () => stderr, stop };
}

async function endpointVersion(port, host = "127.0.0.1") {
  const response = await fetch(`http://${host}:${port}/json/version`, { signal: AbortSignal.timeout(2000) });
  return response.json();
}

async function waitForEndpoint(port) {
  const deadline = Date.now() + READY_MS;
  while (Date.now() < deadline) {
    try { return await endpointVersion(port); } catch { await sleep(POLL_MS); }
  }
  throw new Error(`no debugging endpoint on ${port} within ${READY_MS} ms`);
}

/** The person's click, over a raw CDP socket that is NOT Playwright: the signed-in state must exist before anything attaches. */
async function personSignsIn(port) {
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const socket = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
  await new Promise((resolve) => { socket.onopen = resolve; });
  let id = 0;
  const pending = new Map();
  socket.onmessage = (event) => { const m = JSON.parse(event.data); pending.get(m.id)?.(m); };
  const call = (method, params) => new Promise((resolve) => { id += 1; pending.set(id, resolve); socket.send(JSON.stringify({ id, method, params })); });
  const where = await call("Runtime.evaluate", { expression: "(() => { const r = document.getElementById('b').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()", returnByValue: true });
  const [x, y] = where.result.result.value;
  for (const type of ["mousePressed", "mouseReleased"]) await call("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1 });
  socket.close();
}

async function loadPlaywright() {
  const require = createRequire(import.meta.url);
  return require("playwright");
}

async function headingsOf(page) {
  const { openPlaywrightDriver } = await import(pathToFileURL(join(import.meta.dirname, "playwright-driver.ts")).href);
  const driver = await openPlaywrightDriver(page);
  const nodes = await driver.axNodes();
  return { driver, headings: nodes.filter((n) => n.role === "heading" && !n.ignored).map((n) => n.name) };
}

async function q1() {
  const { server, url } = await startFixture();
  const port = await freePort();
  const person = startPersonBrowser({ port, url });
  try {
    const version = await waitForEndpoint(port);
    say(`person's browser: ${version.Browser}   endpoint: http://127.0.0.1:${port}   page: ${url}`);
    await sleep(SETTLE_MS);
    await personSignsIn(port);
    const { chromium } = await loadPlaywright();
    const attached = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    const page = attached.contexts()[0].pages().find((p) => p.url() === url);
    say(`attached through the endpoint; pages found in the person's own context: ${attached.contexts()[0].pages().length}`);
    say(`attached page, heading read by playwright-driver.ts (axNodes):  ${JSON.stringify((await headingsOf(page)).headings)}`);
    const fresh = await attached.newContext();
    const freshPage = await fresh.newPage();
    await freshPage.goto(url);
    say(`FALSIFIER, fresh context of the same browser at the same URL:    ${JSON.stringify((await headingsOf(freshPage)).headings)}`);
    const separate = await chromium.launch({ executablePath: chromePath(), args: ["--no-sandbox"] });
    const separatePage = await (await separate.newContext()).newPage();
    await separatePage.goto(url);
    say(`FALSIFIER, a separately launched Playwright browser, same URL:   ${JSON.stringify((await headingsOf(separatePage)).headings)}`);
    await separate.close();
    const { driver } = await headingsOf(page);
    await driver.navigate(url);
    say(`after the driver's navigate(url) on the attached page:           ${JSON.stringify((await headingsOf(page)).headings)}`);
    await attached.close();
  } finally { await person.stop(); server.close(); }
}

async function q2() {
  const { server, url } = await startFixture();
  const port = await freePort();
  const owner = startPersonBrowser({ port, url });
  try {
    const before = await waitForEndpoint(port);
    say(`person's browser (profile A) holds port ${port}: ${before.webSocketDebuggerUrl}`);
    const second = startPersonBrowser({ port, url });
    await sleep(SETTLE_MS * 2);
    const after = await endpointVersion(port);
    say(`a second browser, profile B, launched with the SAME --remote-debugging-port=${port} (what launchReusable spawns):`);
    say(`  second browser still running: ${second.child.exitCode === null}`);
    say(`  second browser's stderr about the port: ${(second.stderr().split("\n").find((l) => /bind|address already in use|port/i.test(l)) ?? "(none)").slice(0, 160)}`);
    say(`  endpoint after the second launch: ${after.webSocketDebuggerUrl}`);
    say(`  endpoint answered by profile A's browser, not B's: ${after.webSocketDebuggerUrl === before.webSocketDebuggerUrl}`);
    await second.stop();
  } finally { await owner.stop(); server.close(); }
}

/** The host's LAN address is printed with its last two octets masked: the transcript is committed, and a real internal address is a leak (tracked-source-leak-guard). */
const masked = (address) => address.replace(/\.\d+\.\d+$/, ".x.x");

function lanAddress() {
  return Object.values(networkInterfaces()).flat().find((i) => i && i.family === "IPv4" && !i.internal)?.address;
}

function getWithHost({ port, host, address }) {
  return new Promise((resolve) => {
    const req = request({ host: address, port, path: "/json/version", headers: { host }, timeout: 2000 }, (res) => {
      let body = ""; res.on("data", (c) => { body += c; }); res.on("end", () => resolve(`HTTP ${res.statusCode} ${body.slice(0, 70).replace(/\s+/g, " ")}`));
    });
    req.on("error", (e) => resolve(`error ${e.code ?? e.message}`));
    req.on("timeout", () => { req.destroy(); resolve("timeout"); });
    req.end();
  });
}

async function q3() {
  const { server, url } = await startFixture();
  const port = await freePort();
  const person = startPersonBrowser({ port, url });
  try {
    await waitForEndpoint(port);
    const lan = lanAddress();
    say(`this host's non-loopback IPv4: ${lan ? masked(lan) : "(none)"}`);
    say(`listening sockets for the debugging port:`);
    say(execFileSync("sh", ["-c", `ss -ltn | grep ":${port} " || true`], { encoding: "utf8" }).trimEnd());
    if (lan) say(`from this host, via its own LAN address ${masked(lan)}:${port}  -> ${await getWithHost({ port, host: `${lan}:${port}`, address: lan })}`);
    const forward = createTcpServer((client) => { const up = connect(port, "127.0.0.1"); client.pipe(up).pipe(client); client.on("error", () => up.destroy()); up.on("error", () => client.destroy()); });
    await new Promise((resolve) => forward.listen(0, "0.0.0.0", resolve));
    const relay = forward.address().port;
    say(`a plain TCP relay 0.0.0.0:${relay} -> 127.0.0.1:${port} (what an SSH -R or a port proxy amounts to):`);
    if (lan) say(`  Host: ${masked(lan)}:${relay}            -> ${await getWithHost({ port: relay, host: `${lan}:${relay}`, address: lan })}`);
    say(`  Host: person-laptop.example   -> ${await getWithHost({ port: relay, host: "person-laptop.example", address: "127.0.0.1" })}`);
    say(`  Host: localhost:${relay}        -> ${await getWithHost({ port: relay, host: `localhost:${relay}`, address: "127.0.0.1" })}`);
    forward.close();
  } finally { await person.stop(); server.close(); }
}

const QUESTIONS = { q1, q2, q3 };

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const question = QUESTIONS[process.argv[2] ?? ""];
  if (!question) { say("usage: node --import tsx attach-spike.mjs <q1|q2|q3>"); process.exit(2); }
  await question();
}

// ---------------------------------------------------------------------------------------------------------------------------------
// The document's shape. Pure: no browser, no filesystem but the injected reader.

const VERDICT_LINE = /^Verdict: (attach works|attach conflicts: \S.*)$/m;
const QUESTION_HEADING = /^## Question ([123])\b/m;
const FENCE = /^```(?:\w*)\n([\s\S]*?)^```$/gm;

/** The fenced blocks of one section, in order. */
function blocksOf(section) { return [...section.matchAll(FENCE)].map((m) => m[1]); }

/** A transcript block is a command line (`$ …`) with at least one line of output directly under it. */
function transcriptProblem(block) {
  const lines = block.split("\n").filter((l) => l.trim() !== "");
  if (!lines[0]?.startsWith("$ ")) return "does not begin with a command line ($ …)";
  if (lines.length < 2 || lines.slice(1).every((l) => l.startsWith("$ "))) return "has a command and no output under it";
  return undefined;
}

/** `path:line` cites of this repository, written `` `path/to/file.ext:NN` `` and resolved at `commit`. */
const REPO_CITE = /`((?:packages|docs|scripts|\.github)\/[\w./-]+\.\w+):(\d+)`/g;
/** Cites of the worker, written `` `screenreader-worker@<sha> src/file.mjs:NN` ``; the evidence is the `grep -n` output pasted in the document. */
const WORKER_CITE = /`screenreader-worker@([0-9a-f]{7,40}) (src\/[\w./-]+\.\w+):(\d+)`/g;

/**
 * @param {string} text the document
 * @param {{ lineCountAt: (commit: string, path: string) => number | undefined, commit: string }} where
 * @returns {string[]} every way the document fails its shape; empty means it holds
 */
export function checkSpikeDocument(text, where) {
  const problems = [];
  if (!VERDICT_LINE.test(text)) problems.push("no `Verdict: attach works` / `Verdict: attach conflicts: <reason>` line");
  const sections = text.split(/^(?=## Question [123]\b)/m).filter((s) => QUESTION_HEADING.test(s));
  for (const n of ["1", "2", "3"]) {
    const section = sections.find((s) => s.startsWith(`## Question ${n}`));
    const blocks = section ? blocksOf(section) : [];
    if (!blocks.length) { problems.push(`question ${n} has no transcript block`); continue; }
    for (const block of blocks) {
      const problem = transcriptProblem(block);
      if (problem) problems.push(`question ${n}: a transcript block ${problem}`);
    }
  }
  for (const [, path, line] of text.matchAll(REPO_CITE)) {
    const count = where.lineCountAt(where.commit, path);
    if (count === undefined) problems.push(`cites ${path}:${line}, which does not exist at ${where.commit}`);
    else if (Number(line) > count) problems.push(`cites ${path}:${line}, but the file has ${count} lines at ${where.commit}`);
  }
  for (const [, , path, line] of text.matchAll(WORKER_CITE)) {
    const base = path.split("/").pop();
    const evidence = new RegExp(`^${line}:`, "m");
    const quoted = [...text.matchAll(FENCE)].some((m) => m[1].includes(base) && evidence.test(m[1].split("\n").slice(1).join("\n")));
    if (!quoted) problems.push(`cites ${path}:${line} of the worker with no \`grep -n\` line ${line}: pasted from ${base}`);
  }
  return problems;
}
