#!/usr/bin/env node
/**
 * THE AUTH0 SINGLE-PAGE-APP TEST PAGE (#4973, #4084 outcome 1): a small page that signs in through an Auth0 tenant's Universal Login
 * and keeps its token only in memory, served at `http://localhost:4173` because that is the origin the chairman registers as the
 * callback, logout and web origin.
 *
 *   AUTH0_DOMAIN=<tenant> AUTH0_CLIENT_ID=<id> node serve.ts [--port <n>]
 *
 * The domain and client id are injected into the page at serve time. A missing one is a refusal that names the VARIABLE, and neither
 * value is ever printed: they are not secrets, but the file that carries them also carries the ones that are. This server reads no
 * other variable, and in particular never `AUTH0_TEST_PASSWORD` or `AUTH0_TOTP_SEED`.
 *
 * The SDK is vendored at `@auth0/auth0-spa-js` 2.28.3 (MIT), so the page has no CDN dependency. `vendor/auth0-spa-js.production.js` is
 * the package's `dist/auth0-spa-js.production.js` byte for byte (sha256
 * c38bf49684201f9f1d93d6fbf995b0c4d5c8821fb32984f869da164aa7531ed1, which the test pins) after ONE added first line, an
 * eslint-disable directive: the repository lints every `.js` and the bundle is minified.
 *
 * WHAT THIS DOES NOT PROVE: the Auth0 round trip is not run by this row. It needs the tenant and is the end-to-end row's.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { readFileSync, realpathSync } from "node:fs";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";

export const DEFAULT_PORT = 4173;
export const DOMAIN_VARIABLE = "AUTH0_DOMAIN";
export const CLIENT_ID_VARIABLE = "AUTH0_CLIENT_ID";
/** The only two variables this server reads. */
export const READ_VARIABLES = [DOMAIN_VARIABLE, CLIENT_ID_VARIABLE] as const;
const CONFIG_PLACEHOLDER = "__AUTH0_CONFIG__";

const here = (name: string) => new URL(name, import.meta.url);
const ASSETS: Record<string, { file: URL; type: string }> = {
  "/app.js": { file: here("./app.js"), type: "text/javascript; charset=utf-8" },
  "/vendor/auth0-spa-js.production.js": { file: here("./vendor/auth0-spa-js.production.js"), type: "text/javascript; charset=utf-8" },
};

export type Auth0Config = { domain: string; clientId: string };

/**
 * Read the tenant's domain and client id. Throws a sentence naming the missing VARIABLE and never quoting a value.
 * @param {Record<string, string | undefined>} env
 */
export function readAuth0Config(env: Record<string, string | undefined>): Auth0Config {
  const domain = env[DOMAIN_VARIABLE];
  const clientId = env[CLIENT_ID_VARIABLE];
  if (!domain) throw new Error(`${DOMAIN_VARIABLE} is not set: the page cannot name the tenant to sign in to.`);
  if (!clientId) throw new Error(`${CLIENT_ID_VARIABLE} is not set: the page cannot name the application to sign in as.`);
  return { domain, clientId };
}

/** JSON safe to place inside a `<script>` element: `<` is escaped so a value cannot close it. @param {Auth0Config} config */
const configJson = (config: Auth0Config) => JSON.stringify(config).replace(/</g, "\\u003c");

/** @param {Auth0Config} config */
const renderIndex = (config: Auth0Config) =>
  readFileSync(here("./index.html"), "utf8").replace(CONFIG_PLACEHOLDER, () => configJson(config));

/**
 * Start the server on loopback. `port: 0` takes a free port, for tests.
 * @param {{ config: Auth0Config, port?: number }} options
 */
export async function startAuth0Spa({ config, port = DEFAULT_PORT }: { config: Auth0Config; port?: number }) {
  const server: Server = createServer((request, response) => {
    const path = new URL(request.url ?? "/", "http://localhost").pathname;
    const asset = ASSETS[path];
    if (path === "/") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      response.end(renderIndex(config));
    } else if (asset) {
      response.writeHead(200, { "content-type": asset.type, "cache-control": "no-store" });
      response.end(readFileSync(asset.file));
    } else {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("not found");
    }
  });
  await new Promise<void>((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(port, "127.0.0.1", resolveListen);
  });
  const bound = (server.address() as AddressInfo).port;
  return {
    url: `http://localhost:${bound}`,
    port: bound,
    stop: () => new Promise<void>((resolveStop) => { server.close(() => resolveStop()); server.closeAllConnections(); }),
  };
}

export const USAGE = "usage: AUTH0_DOMAIN=<tenant> AUTH0_CLIENT_ID=<id> serve.ts [--port <n>]";

/** @param {string[]} argv */
export function readPort(argv: string[]): number {
  const { values } = parseArgs({ args: argv, options: { port: { type: "string" } }, strict: true });
  if (values.port === undefined) return DEFAULT_PORT;
  const port = Number(values.port);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error(`--port must be an integer from 0 to 65535. ${USAGE}`);
  return port;
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  try {
    const config = readAuth0Config(process.env);
    const running = await startAuth0Spa({ config, port: readPort(process.argv.slice(2)) });
    console.log(`serving the Auth0 test page at ${running.url}`);
    process.once("SIGINT", () => { running.stop().then(() => process.exit(0)); });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
