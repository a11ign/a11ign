#!/usr/bin/env node
// @ts-check
/**
 * Serve #4086's declared-IdP fixture so a worker on ANOTHER machine can reach it, and print the command that runs an authenticated
 * capture of it through that worker (#4110, #4084 outcome 1; the reading itself is #4107's).
 *
 *   node serve-cross-origin-idp.mjs --out <dir> [--host <address>] [--public-host <name>] [--worker <url>]
 *
 * The fixture's two origins are two PORTS on one host, which are two origins, so one LAN address is enough. `--host` is what the
 * servers bind (default loopback, which no other machine can reach); `--public-host` is the name the URLs and redirects carry, and
 * what the worker's browser has to resolve. A wildcard bind (`0.0.0.0`, `::`) is REFUSED without `--public-host`, because a URL
 * cannot carry a wildcard and the first redirect would send the browser to an address it cannot open.
 *
 * Nothing here talks to a worker. It prints a command; running it is another session's job.
 */
import { parseArgs } from "node:util";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { startCrossOriginIdp } from "./cross-origin-idp.mjs";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "[::1]", "localhost"]);
const WILDCARD_HOSTS = new Set(["0.0.0.0", "::", "[::]"]);
const LOGIN_FLOW = "login";
const FLOWS_FILE = "flows.yml";
const USER_VARIABLE = "IDP_USER";
const PASSWORD_VARIABLE = "IDP_PASSWORD";
/** Printed where the worker's address is not known to this script, so the line still parses and shows what is missing. */
const WORKER_PLACEHOLDER = "<worker-url>";
export const USAGE = "usage: serve-cross-origin-idp.mjs --out <dir> [--host <address>] [--public-host <name>] [--worker <url>]";

/** @typedef {{ out: string, host: string | undefined, publicHost: string | undefined, worker: string }} ServeOptions */

/**
 * Read the command line. A sentence a person can act on is thrown for a missing `--out` and for a wildcard bind with no name to
 * put in the URLs.
 * @param {string[]} argv
 * @returns {ServeOptions}
 */
export function readServeOptions(argv) {
  const { values } = parseArgs({
    args: argv,
    options: { out: { type: "string" }, host: { type: "string" }, "public-host": { type: "string" }, worker: { type: "string" } },
    strict: true,
  });
  if (!values.out) throw new Error(`--out <dir> is required: the flows file is written there. ${USAGE}`);
  const options = { out: values.out, host: values.host, publicHost: values["public-host"], worker: values.worker ?? WORKER_PLACEHOLDER };
  refuseWildcardWithoutName(options);
  return options;
}

/** @param {ServeOptions} options */
function refuseWildcardWithoutName({ host, publicHost }) {
  if (host !== undefined && WILDCARD_HOSTS.has(host) && !publicHost) {
    throw new Error(`--host ${host} binds every interface, and a URL cannot carry a wildcard address: pass --public-host <name> with the name or address the worker reaches this machine by.`);
  }
}

/** Whether the bound address is one only this machine can reach. @param {string | undefined} host */
export const isLoopbackBind = (host) => host === undefined || LOOPBACK_HOSTS.has(host);

/** The sentence printed on start for a bind other machines can reach. @param {string | undefined} host */
export const networkNotice = (host) => isLoopbackBind(host)
  ? ""
  : `NOTICE: this server is reachable from the network (bound to ${host}). It serves only fake credentials, and belongs to no account; stop it when the reading is taken.`;

/**
 * The flows file the printed command names. The origin is the app's and the IdP's is declared, so the login may leave the app for it
 * and nothing else. The credentials are read from the environment, never written here.
 * @param {{ appUrl: string, idpUrl: string }} fixture
 */
export const flowsText = ({ appUrl, idpUrl }) => `version: 1
origin: ${appUrl}
idp-origins:
  - ${idpUrl}
flows:
  ${LOGIN_FLOW}:
    steps:
      - goto: /login
      - fill: { field: "Email", from-env: ${USER_VARIABLE} }
      - fill: { field: "Password", from-env: ${PASSWORD_VARIABLE} }
      - press: "Sign in"
      - expect: { heading: "Account" }
`;

/** A path with a space would split into two arguments. @param {string} token */
const shellToken = (token) => (/\s/.test(token) ? `"${token}"` : token);

/** The one line `orchestrator` runs, with the two credentials in the environment. @param {{ appUrl: string, flowsPath: string, worker: string }} run */
export const witnessCommand = ({ appUrl, flowsPath, worker }) =>
  ["npm run witness --", appUrl, "--flows", shellToken(flowsPath), "--login-flow", LOGIN_FLOW, "--worker", worker].join(" ");

/** @param {{ fixture: { appUrl: string, idpUrl: string, email: string, password: string }, flowsPath: string, worker: string, host: string | undefined }} run */
export function startupReport({ fixture, flowsPath, worker, host }) {
  const lines = [
    `app URL:    ${fixture.appUrl}`,
    `IdP URL:    ${fixture.idpUrl}`,
    `credentials (fake, belong to no account): ${USER_VARIABLE}=${fixture.email} ${PASSWORD_VARIABLE}=${fixture.password}`,
    `flows file: ${flowsPath}`,
    networkNotice(host),
    worker === WORKER_PLACEHOLDER ? `${WORKER_PLACEHOLDER} is not known to this script: pass --worker <url> to have it printed, or replace it.` : "",
    `run this with the two credentials above in the environment:`,
    witnessCommand({ appUrl: fixture.appUrl, flowsPath, worker }),
  ];
  return lines.filter((line) => line !== "").join("\n");
}

/** @param {ServeOptions} options */
async function serve(options) {
  const fixture = await startCrossOriginIdp({ host: options.host, publicHost: options.publicHost });
  const directory = resolve(options.out);
  await mkdir(directory, { recursive: true });
  const flowsPath = resolve(directory, FLOWS_FILE);
  await writeFile(flowsPath, flowsText(fixture));
  console.log(startupReport({ fixture, flowsPath, worker: options.worker, host: options.host }));
  process.once("SIGINT", () => { fixture.stop().then(() => process.exit(0)); });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await serve(readServeOptions(process.argv.slice(2)));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
