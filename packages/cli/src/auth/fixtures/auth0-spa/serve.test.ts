// THE AUTH0 TEST-PAGE SERVER (#4973): what it serves, what it refuses, and what it never says.
//
//   POSITIVE CONTROL: the server answers `/` with the page, the page carries the configured domain and client id, `cacheLocation:
//   'memory'` is the only cache setting, and the signed-in heading is a literal. The NEGATIVE CONTROLS are the refusals for a missing
//   variable and the sentinel scans: both secrets are set to sentinels, and every response and every log line is searched for them.
//
// NOT PROVEN HERE: the Auth0 round trip. It needs the tenant and is the end-to-end row's.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { readAuth0Config, readPort, startAuth0Spa, READ_VARIABLES, DEFAULT_PORT } from "./serve.ts";

const SERVE = fileURLToPath(new URL("./serve.ts", import.meta.url));
const read = (name: string) => readFileSync(new URL(name, import.meta.url), "utf8");
const DOMAIN = "sentinel-tenant.example.auth0.com";
const CLIENT_ID = "sentinelClientId0123456789abcdef";
const PASSWORD_SENTINEL = "SENTINEL-PASSWORD-7d41c0";
const SEED_SENTINEL = "SENTINEL-TOTP-SEED-93be2a";
const ROUTES = ["/", "/app.js", "/vendor/auth0-spa-js.production.js", "/nothing-here"];
const VENDORED_SHA256 = "c38bf49684201f9f1d93d6fbf995b0c4d5c8821fb32984f869da164aa7531ed1";

async function bodies(url: string): Promise<string[]> {
  return Promise.all(ROUTES.map(async (route) => (await fetch(url + route)).text()));
}

describe("the page it serves", () => {
  test("POSITIVE CONTROL: / is the page, carrying the configured domain and client id", async () => {
    const running = await startAuth0Spa({ config: { domain: DOMAIN, clientId: CLIENT_ID }, port: 0 });
    try {
      const response = await fetch(`${running.url}/`);
      const html = await response.text();
      assert.equal(response.status, 200);
      assert.match(response.headers.get("content-type") ?? "", /text\/html/);
      assert.match(html, /<h1[^>]*>Sign in required<\/h1>/);
      assert.match(html, /<button[^>]*>Sign in<\/button>/);
      const config = JSON.parse(/<script type="application\/json" id="auth0-config">(.*?)<\/script>/s.exec(html)?.[1] ?? "null");
      assert.deepEqual(config, { domain: DOMAIN, clientId: CLIENT_ID });
      assert.doesNotMatch(html, /__AUTH0_CONFIG__/);
    } finally {
      await running.stop();
    }
  });

  test("the default port is the origin the chairman registers", () => {
    assert.equal(DEFAULT_PORT, 4173);
    assert.equal(readPort([]), 4173);
    assert.equal(readPort(["--port", "0"]), 0);
    assert.throws(() => readPort(["--port", "nope"]), /--port must be an integer/);
  });

  test("a config value cannot close the script element it is injected into", async () => {
    const running = await startAuth0Spa({ config: { domain: "x</script><b>", clientId: CLIENT_ID }, port: 0 });
    try {
      const html = await (await fetch(`${running.url}/`)).text();
      assert.doesNotMatch(html, /<\/script><b>/);
    } finally {
      await running.stop();
    }
  });

  test("the cache setting is 'memory' and is the only one; the script names no browser storage", () => {
    const script = read("./app.js");
    assert.equal(script.match(/cacheLocation:\s*'memory'/g)?.length, 1, "app.js must set cacheLocation: 'memory' exactly once");
    assert.deepEqual(script.match(/cacheLocation:\s*[^,\s}]+/g), ["cacheLocation: 'memory'"]);
    assert.doesNotMatch(script, /localStorage|sessionStorage|document\.cookie/);
  });

  test("the signed-in heading is a literal the end-to-end row can name", () => {
    assert.match(read("./app.js"), /"Signed in to the a11y-witness test page"/);
  });

  test("the vendored SDK is the bytes that were reviewed", () => {
    const bytes = readFileSync(new URL("./vendor/auth0-spa-js.production.js", import.meta.url));
    const afterDirective = bytes.subarray(bytes.indexOf(0x0a) + 1);
    assert.equal(createHash("sha256").update(afterDirective).digest("hex"), VENDORED_SHA256);
  });
});

describe("the refusals", () => {
  test("NEGATIVE CONTROL: each missing variable is refused by NAME, and the other's value is not quoted", () => {
    assert.throws(() => readAuth0Config({ AUTH0_CLIENT_ID: CLIENT_ID }), (error: Error) => error.message.includes("AUTH0_DOMAIN") && !error.message.includes(CLIENT_ID));
    assert.throws(() => readAuth0Config({ AUTH0_DOMAIN: DOMAIN }), (error: Error) => error.message.includes("AUTH0_CLIENT_ID") && !error.message.includes(DOMAIN));
  });

  test("NEGATIVE CONTROL: the process exits 1 naming the variable, with neither value on stdout or stderr", () => {
    for (const [missing, env] of [
      ["AUTH0_DOMAIN", { AUTH0_CLIENT_ID: CLIENT_ID }],
      ["AUTH0_CLIENT_ID", { AUTH0_DOMAIN: DOMAIN }],
    ] as const) {
      const run = spawnSync(process.execPath, [SERVE, "--port", "0"], { env: { PATH: process.env.PATH ?? "", ...env }, encoding: "utf8" });
      assert.equal(run.status, 1);
      assert.match(run.stderr, new RegExp(missing));
      assert.doesNotMatch(run.stdout + run.stderr, new RegExp(`${DOMAIN}|${CLIENT_ID}`));
    }
  });
});

describe("what it never reads or says", () => {
  test("NEGATIVE CONTROL: it reads only the two variables it names", () => {
    const touched = new Set<string>();
    const env = new Proxy({ AUTH0_DOMAIN: DOMAIN, AUTH0_CLIENT_ID: CLIENT_ID, AUTH0_TEST_PASSWORD: PASSWORD_SENTINEL, AUTH0_TOTP_SEED: SEED_SENTINEL } as Record<string, string>, {
      get(target, key) { touched.add(String(key)); return target[key as string]; },
    });
    readAuth0Config(env);
    assert.deepEqual([...touched].sort(), [...READ_VARIABLES].sort());
  });

  test("NEGATIVE CONTROL: with both secrets set to sentinels, no response and no log line carries them, or the domain or client id", async () => {
    const env = { PATH: process.env.PATH ?? "", AUTH0_DOMAIN: DOMAIN, AUTH0_CLIENT_ID: CLIENT_ID, AUTH0_TEST_PASSWORD: PASSWORD_SENTINEL, AUTH0_TOTP_SEED: SEED_SENTINEL };
    const child = spawn(process.execPath, [SERVE, "--port", "0"], { env });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { output += chunk; });
    try {
      const url = await new Promise<string>((resolveUrl, rejectUrl) => {
        const poll = setInterval(() => {
          const found = /serving the Auth0 test page at (http:\/\/localhost:\d+)/.exec(output);
          if (found) { clearInterval(poll); resolveUrl(found[1]); }
        }, 25);
        child.once("exit", () => { clearInterval(poll); rejectUrl(new Error(`server exited before listening: ${output}`)); });
      });
      const served = (await bodies(url)).join("\n");
      assert.ok(served.includes(DOMAIN), "the page must carry the domain (otherwise the scan below is vacuous)");
      for (const sentinel of [PASSWORD_SENTINEL, SEED_SENTINEL, "AUTH0_TEST_PASSWORD", "AUTH0_TOTP_SEED"]) {
        assert.ok(!served.includes(sentinel), `a response carries ${sentinel}`);
        assert.ok(!output.includes(sentinel), `a log line carries ${sentinel}`);
      }
      for (const value of [DOMAIN, CLIENT_ID]) assert.ok(!output.includes(value), "a log line carries a configured value");
      assert.ok(output.length > 0, "the server logged nothing, so the log scan saw nothing");
    } finally {
      child.kill("SIGINT");
    }
  });
});
