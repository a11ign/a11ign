// @ts-check
/**
 * A single-page app that signs a user in THROUGH A SECOND ORIGIN and keeps the token ONLY in page memory (#4086, #4084 outcome 1).
 *
 * It reproduces two behaviours of a hosted identity provider (Auth0 Universal Login with the SPA SDK's default
 * `cacheLocation: 'memory'`), because a sign-in tool meets both at once:
 *
 * 1. THE FORM LOGIN LEAVES THE ORIGIN. The app's `/login` redirects to the IdP origin's `/authorize` (a form: Email, Password,
 *    Sign in), and a correct submit redirects back to the app's `/callback?code=<one-time code>`. A pinned-origin sign-in sees
 *    the browser on another origin.
 * 2. A SAVED STATE CANNOT CARRY THE SESSION. The page script exchanges the code at the IdP's `/token` and holds the token in a
 *    closure variable: no cookie, no `localStorage`, no `sessionStorage`, and the servers never send `Set-Cookie`. A storage
 *    state saved after sign-in loads as SIGNED OUT.
 *
 * `storage: "local"` is the NEGATIVE: the SAME page writes the token to `localStorage`, so a saved state DOES carry the session.
 * It exists so a reading of "the state cannot carry it" has something to differ from.
 *
 * IMPORTS NOTHING BUT NODE BUILT-INS, so a second repository can copy this one file (the worker's interpreter test does; the copy is
 * named as a copy there). Ephemeral ports, and every credential below is fake and belongs to no account. LOOPBACK IS THE DEFAULT:
 * with no options both origins bind `127.0.0.1`. A LAN bind (`host`, and `publicHost` for the name the URLs carry) is an explicit
 * option, and `serve-cross-origin-idp.mjs` is the one place that offers it, so a worker on another machine can open the fixture.
 */
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";

const LOOPBACK = "127.0.0.1";
const REDIRECT = 302;

/**
 * `host` is the address both servers bind (default loopback); `publicHost` is the name written into the URLs and redirects they hand
 * out (default the bind address). They differ because a wildcard bind (`0.0.0.0`) is an address no URL can carry.
 * @typedef {{ storage?: "memory" | "local", email?: string, password?: string, host?: string, publicHost?: string }} IdpOptions
 */
/** @typedef {{ appUrl: string, idpUrl: string, email: string, password: string, stop: () => Promise<void> }} CrossOriginIdp */

/** @param {string} title @param {string} body */
const page = (title: string, body: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title></head><body><main>${body}</main></body></html>`;

/** @param {string} text */
const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * The two places the token can live, as page-script source. The memory variant must not NAME any browser storage at all, since the
 * test scans the served script for those names; the local variant names `localStorage` so that same scan has something to find.
 * @param {"memory" | "local"} storage
 */
function tokenStoreSource(storage: "memory" | "local") {
  if (storage === "local") {
    return `const store = { save(t) { localStorage.setItem("token", t); }, load() { return localStorage.getItem("token"); } };`;
  }
  return `let held = null; const store = { save(t) { held = t; }, load() { return held; } };`;
}

/** The app's one script: every app path serves the same shell, and the script decides what the path shows. @param {"memory" | "local"} storage */
function appScript(storage: "memory" | "local") {
  return `(() => {
  const IDP = document.documentElement.dataset.idp;
  ${tokenStoreSource(storage)}
  const root = document.querySelector("main");
  const show = (heading, extra) => { root.innerHTML = "<h1>" + heading + "</h1>" + (extra || ""); document.title = heading; };
  const valid = (token) => fetch(IDP + "/userinfo", { headers: { authorization: "Bearer " + token } }).then((r) => r.ok);
  const signedOut = () => show("Sign in", '<p><a href="/login">Continue to sign in</a></p>');
  const account = () => show("Account", "<p>You are signed in.</p>");
  async function exchange(code) {
    const response = await fetch(IDP + "/token", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code }) });
    if (!response.ok) return signedOut();
    store.save((await response.json()).access_token);
    history.replaceState(null, "", "/account");
    account();
  }
  async function resume() {
    const token = store.load();
    if (token && (await valid(token))) account(); else signedOut();
  }
  const code = new URLSearchParams(location.search).get("code");
  if (location.pathname === "/callback" && code) exchange(code);
  else if (location.pathname === "/account") resume();
  else show("Home", '<p><a href="/account">Your account</a></p>');
})();`;
}

/** @param {{ storage: "memory" | "local", idpOrigin: string }} config */
const appShell = ({ storage, idpOrigin }: { storage: "memory" | "local"; idpOrigin: string; }) => `<!doctype html><html lang="en" data-idp="${idpOrigin}"><head><meta charset="utf-8"><title>App</title></head><body><main></main><script>${appScript(storage)}</script></body></html>`;

/** @param {string} location */
const redirectTo = (location: string) => ({ status: REDIRECT, headers: { location }, body: "" });
/** @param {number} status @param {string} body @param {string} [type] */
const reply = (status: number, body: string, type: string = "text/html; charset=utf-8") => ({ status, headers: { "content-type": type }, body });
const notFound = () => reply(404, page("Not found", "<h1>Not found</h1>"));

/** @param {{ requested: Record<string, string>, error?: string }} form */
function authorizePage({ requested, error }: { requested: Record<string, string>; error?: string; }) {
  const hidden = Object.entries(requested).map(([name, value]) => `<input type="hidden" name="${name}" value="${escapeHtml(value)}">`).join("");
  const message = error ? `<p role="alert">${escapeHtml(error)}</p>` : "";
  return page("Log in", `<h1>Log in to continue</h1>${message}<form method="post" action="/authorize">${hidden}`
    + `<label>Email <input name="email" type="email" autocomplete="username"></label>`
    + `<label>Password <input name="password" type="password" autocomplete="current-password"></label>`
    + `<button type="submit">Sign in</button></form>`);
}

/** @param {import("node:http").IncomingMessage} req @returns {Promise<string>} */
function readBody(req: import("node:http").IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => { raw += chunk; });
    req.on("end", () => resolve(raw));
    req.on("error", reject);
  });
}

/** Run a handler that returns a plain description of the response, and write it. @param {(req: import("node:http").IncomingMessage, url: URL) => Promise<{ status: number, headers: Record<string, string>, body: string }>} handler */
function serve(handler: (req: import("node:http").IncomingMessage, url: URL) => Promise<{ status: number; headers: Record<string, string>; body: string; }>) {
  return createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://${LOOPBACK}`);
    handler(req, url).then(
      ({ status, headers, body }) => { res.writeHead(status, headers); res.end(body); },
      () => { res.writeHead(500); res.end(); },
    );
  });
}

/** @param {{ storage: "memory" | "local", origins: { app: string, idp: string } }} config */
function appServer({ storage, origins }: { storage: "memory" | "local"; origins: { app: string; idp: string; }; }) {
  return serve(async (_req, url) => {
    if (url.pathname === "/login") return redirectTo(authorizeUrl(origins));
    if (["/", "/account", "/callback"].includes(url.pathname)) return reply(200, appShell({ storage, idpOrigin: origins.idp }));
    return notFound();
  });
}

/** @param {{ app: string, idp: string }} origins */
function authorizeUrl(origins: { app: string; idp: string; }) {
  const query = new URLSearchParams({ client_id: "fixture-app", redirect_uri: `${origins.app}/callback`, state: randomBytes(8).toString("hex") });
  return `${origins.idp}/authorize?${query}`;
}

/** The IdP's own state: one-time codes waiting to be exchanged, and the tokens they were exchanged for. @param {{ origins: { app: string, idp: string }, email: string, password: string }} config */
function idpServer({ origins, email, password }: { origins: { app: string; idp: string; }; email: string; password: string; }) {
  /** @type {Set<string>} */ const codes: Set<string> = new Set();
  /** @type {Set<string>} */ const tokens: Set<string> = new Set();
  // A function, because the app's origin is not known until it listens, which is after this server is built.
  const cors = () => ({ "access-control-allow-origin": origins.app, "access-control-allow-headers": "authorization, content-type" });
  /** @param {number} status @param {unknown} value */
  const json = (status: number, value: unknown) => ({ ...reply(status, JSON.stringify(value), "application/json"), headers: { ...cors(), "content-type": "application/json" } });

  /** @param {URLSearchParams} form */
  const submit = (form: URLSearchParams) => {
    const requested = Object.fromEntries(["client_id", "redirect_uri", "state"].map((name) => [name, form.get(name) ?? ""]));
    if (requested.redirect_uri !== `${origins.app}/callback`) return reply(400, page("Error", "<h1>Unknown redirect</h1>"));
    if (form.get("email") !== email || form.get("password") !== password) return reply(401, authorizePage({ requested, error: "Wrong email or password." }));
    const code = randomBytes(12).toString("hex");
    codes.add(code);
    return redirectTo(`${requested.redirect_uri}?${new URLSearchParams({ code, state: requested.state })}`);
  };
  /** @param {import("node:http").IncomingMessage} req */
  const exchange = async (req: import("node:http").IncomingMessage) => {
    const code = JSON.parse((await readBody(req)) || "{}").code;
    if (!codes.delete(code)) return json(400, { error: "invalid_grant" });
    const token = randomBytes(16).toString("hex");
    tokens.add(token);
    return json(200, { access_token: token, token_type: "Bearer" });
  };
  /** @param {import("node:http").IncomingMessage} req */
  const userinfo = (req: import("node:http").IncomingMessage) => {
    const token = (req.headers.authorization ?? "").replace(/^Bearer /, "");
    return json(tokens.has(token) ? 200 : 401, { email });
  };

  return serve(async (req, url) => {
    if (req.method === "OPTIONS") return { status: 204, headers: cors(), body: "" };
    if (url.pathname === "/authorize" && req.method === "GET") {
      return reply(200, authorizePage({ requested: Object.fromEntries(["client_id", "redirect_uri", "state"].map((name) => [name, url.searchParams.get(name) ?? ""])) }));
    }
    if (url.pathname === "/authorize" && req.method === "POST") return submit(new URLSearchParams(await readBody(req)));
    if (url.pathname === "/token" && req.method === "POST") return exchange(req);
    if (url.pathname === "/userinfo") return userinfo(req);
    return notFound();
  });
}

/** An IPv6 literal needs brackets to sit in a URL. @param {string} host */
const hostInUrl = (host: string) => (host.includes(":") && !host.startsWith("[") ? `[${host}]` : host);

/** @param {import("node:http").Server} server @param {{ host: string, publicHost: string }} where @returns {Promise<string>} the origin it is reached at */
async function listen(server: import("node:http").Server, { host, publicHost }: { host: string; publicHost: string; }): Promise<string> {
  await new Promise((resolve) => server.listen(0, host, () => resolve(undefined)));
  const address = /** @type {import("node:net").AddressInfo} */ (server.address());
  return `http://${hostInUrl(publicHost)}:${address.port}`;
}

/** @param {import("node:http").Server} server */
const close = (server: import("node:http").Server) => new Promise((resolve) => { server.close(() => resolve(undefined)); server.closeAllConnections(); });

/**
 * Start the two origins. The servers are created first and given the origins afterwards, because each must name the other's port
 * and neither exists until it listens.
 * @param {IdpOptions} [options]
 * @returns {Promise<CrossOriginIdp>}
 */
export async function startCrossOriginIdp({ storage = "memory", email = "user@example.test", password = "correct horse battery", host = LOOPBACK, publicHost = host }: IdpOptions = {}): Promise<CrossOriginIdp> {
  const where = { host, publicHost };
  const origins = { app: "", idp: "" };
  const app = appServer({ storage, origins });
  const idp = idpServer({ origins, email, password });
  origins.app = await listen(app, where);
  origins.idp = await listen(idp, where);
  return {
    appUrl: origins.app, idpUrl: origins.idp, email, password,
    stop: async () => { await Promise.all([close(app), close(idp)]); },
  };
}
