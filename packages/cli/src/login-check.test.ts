// `a11ign login --check` (#4995, #4084 v3 login phase 1): ONLY the login and its verification, against the cross-origin IdP fixture in a
// real Chromium. The command is called in process (`runLoginCheck`) with a page this file opens, so the file can count, on its own, how
// many times the IdP was handed a password: the count is the evidence for "exactly one login", not the command's own bookkeeping.
//
// SKIPS the browser cases, with the reason printed, where no Chromium starts. The pure cases (argument parsing) always run.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, existsSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, type Browser } from "playwright";

import { LoginCheckError, parseLoginArgs, runLoginCheck, type LoginCheckDeps, type LoginCheckResult } from "./cli.js";
import { startCrossOriginIdp } from "./auth/fixtures/cross-origin-idp.ts";

type Fixture = Awaited<ReturnType<typeof startCrossOriginIdp>>;

const launched: { browser?: Browser; reason?: string } = await chromium.launch().then(
  (browser) => ({ browser }),
  (error: unknown) => ({ reason: `no Chromium starts here (${String(error).split("\n")[0]}); the login check was NOT exercised in a browser` }),
);
const SKIP = launched.reason;
console.log(SKIP === undefined ? "login-check: real Chromium started, the browser tests run" : `login-check: SKIPPING the browser tests: ${SKIP}`);

const USER = "APP_USER";
const PASSWORD = "APP_PASSWORD";

const flowsText = (fixture: Fixture, { declare, expectHeading = "Account", start = "/login" }: { declare: boolean; expectHeading?: string; start?: string }) => `version: 1
origin: ${fixture.appUrl}
${declare ? `idp-origins:\n  - ${fixture.idpUrl}\n` : ""}flows:
  login:
    steps:
      - goto: ${start}
      - fill: { field: "Email", from-env: ${USER} }
      - fill: { field: "Password", from-env: ${PASSWORD} }
      - press: "Sign in"
      - expect: { heading: "${expectHeading}", timeout: 3 }
`;

const blockText = (fixture: Fixture) => `login:
  url: ${fixture.appUrl}/login
  username: ${USER}
  password: ${PASSWORD}
  totp: APP_TOTP_SEED
  idp-origins: [${fixture.idpUrl}]
  check: { role: heading, name: Account }
`;

interface Workspace { dir: string; flows: string; artifactDir: string }
const workspace = (text: string): Workspace => {
  const dir = mkdtempSync(join(tmpdir(), "login-check-"));
  const flows = join(dir, "flows.yml");
  writeFileSync(flows, text);
  return { dir, flows, artifactDir: join(dir, "login-check") };
};

/** The command, with the file's own count of passwords handed to the IdP (POSTs to its /authorize). */
async function check(
  fixture: Fixture, w: Workspace, options: { password?: string; loginFlow?: string | null } = {},
): Promise<{ result: LoginCheckResult; submissions: number; pages: number }> {
  const counted = { submissions: 0, pages: 0 };
  const deps: LoginCheckDeps = {
    env: { [USER]: fixture.email, [PASSWORD]: options.password ?? fixture.password },
    readText: async (path) => readFileSync(path, "utf8"),
    // A REAL pause: the screen loop's polling uses it, and a no-op reads the IdP redirect's blank page three times in a row as an unknown screen.
    pause: (millis) => new Promise((done) => setTimeout(done, millis)),
    artifactDir: w.artifactDir,
    openPage: async () => {
      const context = await (launched.browser as Browser).newContext();
      const page = await context.newPage();
      counted.pages += 1;
      page.on("request", (request) => {
        if (request.method() === "POST" && request.url().startsWith(`${fixture.idpUrl}/authorize`)) counted.submissions += 1;
      });
      return { page, close: () => context.close() };
    },
  };
  const loginFlow = options.loginFlow === undefined ? "login" : options.loginFlow;
  const result = await runLoginCheck({ flows: w.flows, loginFlow }, deps);
  return { result, ...counted };
}

const everyFile = (dir: string): string[] => readdirSync(dir).map((name) => readFileSync(join(dir, name)).toString("latin1"));

describe("the arguments", () => {
  test("login needs --check and a flows file, and a flag it does not know is refused by name", () => {
    assert.throws(() => parseLoginArgs(["--flows", "f.yml"]), LoginCheckError);
    assert.throws(() => parseLoginArgs(["--check"]), /needs --flows/);
    assert.throws(() => parseLoginArgs(["--check", "--flows", "f.yml", "--json"]), /does not take --json/);
    assert.deepEqual(parseLoginArgs(["--check", "--flows", "f.yml", "--login-flow", "login"]), { flows: "f.yml", loginFlow: "login" });
    assert.deepEqual(parseLoginArgs(["--check", "--flows", "f.yml"]), { flows: "f.yml", loginFlow: null });
  });
});

describe("login --check against the cross-origin IdP fixture", () => {
  let fixture: Fixture;
  before(async () => { fixture = await startCrossOriginIdp(); });
  after(async () => { await fixture.stop(); });

  test("POSITIVE CONTROL: the declared origin signs in, exits 0, and prints the idp-origins line", { skip: SKIP }, async () => {
    const w = workspace(flowsText(fixture, { declare: true }));
    try {
      const { result, submissions } = await check(fixture, w);
      assert.equal(result.outcome, "signed-in", result.lines.join("\n"));
      assert.equal(result.exitCode, 0);
      assert.equal(result.attempts, 1);
      assert.equal(submissions, 1, "one password was handed to the IdP");
      const line = `idp-origins: [${fixture.idpUrl}]`;
      assert.equal(result.idpOriginsLine, line);
      assert.ok(result.lines.includes(line), `the line to paste is printed:\n${result.lines.join("\n")}`);
      assert.equal(result.artifact, null, "a run that signed in writes no failure artefact");
      assert.equal(existsSync(w.artifactDir), false);
    } finally { rmSync(w.dir, { recursive: true, force: true }); }
  });

  test("POSITIVE CONTROL, the login: block: the screen loop signs in the same fixture", { skip: SKIP }, async () => {
    const w = workspace(blockText(fixture));
    try {
      const { result } = await check(fixture, w, { loginFlow: null });
      assert.equal(result.outcome, "signed-in", result.lines.join("\n"));
      assert.equal(result.exitCode, 0);
      assert.equal(result.idpOriginsLine, `idp-origins: [${fixture.idpUrl}]`);
    } finally { rmSync(w.dir, { recursive: true, force: true }); }
  });

});

describe("login --check against the cross-origin IdP fixture, the failures", () => {
  let fixture: Fixture;
  before(async () => { fixture = await startCrossOriginIdp(); });
  after(async () => { await fixture.stop(); });

  test("NEGATIVE CONTROL: the same fixture WITHOUT the declaration ends left-origin, with the line to paste in the message", { skip: SKIP }, async () => {
    const w = workspace(flowsText(fixture, { declare: false }));
    try {
      const { result, submissions } = await check(fixture, w);
      assert.equal(result.outcome, "left-origin", result.lines.join("\n"));
      assert.equal(result.exitCode, 2);
      assert.equal(submissions, 0, "nothing was typed on the provider's page");
      assert.ok(result.lines.includes(`idp-origins: [${fixture.idpUrl}]`), result.lines.join("\n"));
      assert.ok(result.artifact !== null, "a failed run writes the artefact");
    } finally { rmSync(w.dir, { recursive: true, force: true }); }
  });

  test("NEGATIVE CONTROL: a wrong password ends credentials-rejected and attempts exactly one login", { skip: SKIP }, async () => {
    const w = workspace(flowsText(fixture, { declare: true }));
    try {
      const { result, submissions, pages } = await check(fixture, w, { password: "not the right horse" });
      assert.equal(result.outcome, "credentials-rejected", result.lines.join("\n"));
      assert.equal(result.exitCode, 2);
      assert.equal(result.attempts, 1);
      assert.equal(pages, 1, "one browser page was opened: no second attempt");
      assert.equal(submissions, 1, "the IdP was handed ONE wrong password, and never a second");
      assert.ok(result.lines.some((line) => /username or password was refused/.test(line)), "the remedy is printed");
    } finally { rmSync(w.dir, { recursive: true, force: true }); }
  });

  test("NEGATIVE CONTROL: a failed run writes the artefact, and no secret is in it", { skip: SKIP }, async () => {
    const wrong = "not the right horse";
    const w = workspace(flowsText(fixture, { declare: true }));
    try {
      const { result } = await check(fixture, w, { password: wrong });
      assert.equal(result.artifact, w.artifactDir);
      const names = readdirSync(w.artifactDir);
      assert.ok(names.includes("steps.json"), names.join(", "));
      assert.ok(names.some((name) => name.endsWith(".png")), "a screenshot per step");
      assert.ok(names.some((name) => name.endsWith(".tree.json")), "a tree per step");
      for (const content of everyFile(w.artifactDir)) {
        assert.ok(!content.includes(wrong), "the typed password is nowhere in the artefact");
        assert.ok(!content.includes(fixture.password), "the right one is not either");
      }
    } finally { rmSync(w.dir, { recursive: true, force: true }); }
  });

  test("NEGATIVE CONTROL: a check the signed-out page already passes is refused before anything is typed", { skip: SKIP }, async () => {
    const w = workspace(flowsText(fixture, { declare: true, expectHeading: "Home", start: "/" }));
    try {
      const { result, submissions } = await check(fixture, w);
      assert.equal(result.outcome, "signed-in-check-matches-signed-out", result.lines.join("\n"));
      assert.equal(submissions, 0);
    } finally { rmSync(w.dir, { recursive: true, force: true }); }
  });
});

after(async () => { await launched.browser?.close(); });
