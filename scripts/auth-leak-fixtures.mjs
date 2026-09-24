// @ts-check
/**
 * The two fixture sites of `npm run auth:leak-check` (ADR 0038, Constraint 4): a form login, and an account page.
 *
 * `login-quiet` shows the signed-in page WITHOUT the username. `login-echo` shows the same page with the username
 * PRE-FILLED into an edit field, which the form-field sweep reads aloud: it is the fixture that makes the credential
 * appear in the transcript, so the check's positive controls have something real to find. Both accept ONE login, the
 * credential the run was handed, and both keep the session in a cookie so that "signed in" is something the server
 * decided and not a page the tool happened to reach.
 *
 * The values are the FAKE credential the ADR names, and this file never holds one: it is handed them by the script,
 * which read them from the environment.
 *
 * Every path is under `/<fixture>/`, so a URL says which site it is and one server can serve either.
 */
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";

export const LOGIN_HEADING = "Sign in";
export const ACCOUNT_HEADING = "Account";
const HTTP_FOUND = 302;
const HTTP_OK = 200;
const HTTP_NOT_FOUND = 404;

/** @param {string} text */
const escapeHtml = (text) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** @param {string} title @param {string} body */
const page = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title></head>
<body><header><a href="#main">Skip to content</a></header><main id="main">${body}</main>
<footer><p>Fixture site for the leak check. Every credential here is fake.</p></footer></body></html>`;

/**
 * The login flow the check runs, as the worker's wire shape (`AuthRequest.login`): what `--login-flow` would name.
 * @param {{ fixture: string, userEnv: string, secretEnv: string }} names
 * @returns {import("../packages/cli/src/auth/flows.ts").FlowStep[]}
 */
export function loginFlow({ fixture, userEnv, secretEnv }) {
  return [
    { goto: `/${fixture}/login` },
    { fill: { field: "Email address", fromEnv: userEnv } },
    { fill: { field: "Password", fromEnv: secretEnv } },
    { press: { control: "Sign in" } },
    { expect: { kind: /** @type {"heading"} */ ("heading"), name: ACCOUNT_HEADING, timeoutSeconds: 20 } },
  ];
}

/** @param {"login-quiet" | "login-echo"} fixture @param {string} user */
function accountPage(fixture, user) {
  const orders = `<h2>Orders</h2><ul><li><a href="#order-1001">Order 1001</a></li><li><a href="#order-1002">Order 1002</a></li></ul>
    <h2>Help</h2><p><a href="#contact">Contact support</a></p>`;
  const echo = fixture === "login-echo"
    ? `<h2>Profile</h2><label for="username">Username</label><input id="username" name="username" type="text" value="${escapeHtml(user)}">`
    : "";
  return page("Account", `<h1>${ACCOUNT_HEADING}</h1><p>Welcome back. This is the page behind the login.</p>${echo}${orders}`);
}

/**
 * Serve one fixture on a loopback port.
 * @param {{ fixture: "login-quiet" | "login-echo", user: string, secret: string }} credential
 * @returns {Promise<{ origin: string, close: () => Promise<void> }>}
 */
export async function startFixtureSite({ fixture, user, secret }) {
  const session = randomBytes(12).toString("hex");
  const server = createServer((req, res) => {
    const signedIn = (req.headers.cookie ?? "").split(/;\s*/).includes(`session=${session}`);
    /** @param {number} status @param {string} body @param {Record<string, string>} [headers] */
    const send = (status, body, headers = {}) => { res.writeHead(status, { "content-type": "text/html; charset=utf-8", ...headers }); res.end(body); };
    if (req.url === `/${fixture}/login` && req.method === "POST") {
      let raw = "";
      req.on("data", (chunk) => { raw += chunk; });
      req.on("end", () => {
        const form = new URLSearchParams(raw);
        if (form.get("user") === user && form.get("password") === secret) {
          send(HTTP_FOUND, "", { location: `/${fixture}/account`, "set-cookie": `session=${session}; Path=/; HttpOnly` });
        } else send(HTTP_OK, page(LOGIN_HEADING, `<h1>${LOGIN_HEADING}</h1><p>That login was not recognised.</p>`));
      });
    } else if (req.url === `/${fixture}/login`) {
      send(HTTP_OK, page(LOGIN_HEADING, `<h1>${LOGIN_HEADING}</h1><form method="post" action="/${fixture}/login">
        <label for="user">Email address</label><input id="user" name="user" type="text" autocomplete="off">
        <label for="password">Password</label><input id="password" name="password" type="password" autocomplete="off">
        <button type="submit">Sign in</button></form>`));
    } else if (req.url === `/${fixture}/account`) {
      if (signedIn) send(HTTP_OK, accountPage(fixture, user));
      else send(HTTP_FOUND, "", { location: `/${fixture}/login` });
    } else send(HTTP_NOT_FOUND, page("Not found", "<h1>Not found</h1>"));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(undefined)));
  const port = /** @type {import("node:net").AddressInfo} */ (server.address()).port;
  return {
    origin: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => { server.close(() => resolve(undefined)); server.closeAllConnections(); }),
  };
}
