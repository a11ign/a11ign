// no-token: workflowRefusals -- pure over workflow text and a stand-in `readFile`; the one filesystem read is the real `.github/workflows` tree, which is read, never written, and no `gh` or network is reached
/**
 * #5274 (from #5114): a workflow in this public repository that passes login secrets to an authenticated capture is refused at review.
 *
 * Acceptance: `node --test scripts/public-repo-login-workflow-check.test.ts`.
 *
 * POSITIVE CONTROL for the emptiness asserted over the real tree: the fixtures below are each flagged for their own reason, and the
 * negative fixture (a scan with no login) is not. A check that flags nothing would pass the real-tree case, and these cases are what show
 * it does not.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { loginReasonsOf, refusalMessage, workflowRefusals, type ReadFile } from "./public-repo-login-workflow-check.ts";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const noFiles: ReadFile = () => undefined;

const LOGIN_INPUT = `
name: capture
on: workflow_dispatch
jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: a11ign/a11ign@v3
        with:
          url: https://app.example.test/
          flows: flows/app.yml
          login-flow: sign-in
`;

const LOGIN_BLOCK_FILE = `
login:
  url: https://app.example.test/login
  user: APP_TEST_USER
`;

const LOGIN_SECRETS_IN_SCAN = `
name: nightly
on: workflow_dispatch
jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - name: Sign in and read the page
        env:
          APP_TEST_USER: \${{ secrets.APP_TEST_USER }}
          APP_TEST_PASSWORD: \${{ secrets.APP_TEST_PASSWORD }}
        run: pnpm exec tsx packages/cli/src/cli.ts http://localhost:4173/ --json --flows "$flows"
`;

const SECRETS_NOT_IN_SCAN = `
name: nightly
on: workflow_dispatch
jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - name: Set the tenant file
        env:
          AUTH0_TEST_USER: \${{ secrets.AUTH0_TEST_USER }}
        run: echo "set"
`;

const SCAN_WITHOUT_LOGIN = `
name: scan
on: workflow_dispatch
jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: a11ign/a11ign@v3
        with:
          url: https://app.example.test/
`;

test("POSITIVE CONTROL: an Action step given login-flow: is refused, and the reason names the input", () => {
  assert.deepEqual(loginReasonsOf(LOGIN_INPUT, noFiles), ["gives the Action a login-flow: input"]);
});

test("a flows file named in flows: with a login: block is refused, and the reason names the file", () => {
  const readFile: ReadFile = (path) => (path === "flows/app.yml" ? LOGIN_BLOCK_FILE : undefined);
  const workflow = LOGIN_INPUT.replace("login-flow: sign-in\n", "");
  assert.deepEqual(loginReasonsOf(workflow, readFile), ["names flows/app.yml, a flows file with a login: block"]);
});

test("a flows file without a login: block is not refused", () => {
  const readFile: ReadFile = () => "flows:\n  - name: open\n    steps: []\n";
  const workflow = LOGIN_INPUT.replace("login-flow: sign-in\n", "");
  assert.deepEqual(loginReasonsOf(workflow, readFile), []);
});

test("a literal --flows path in a script is read as a flows file the same way", () => {
  const readFile: ReadFile = (path) => (path === "flows/app.yml" ? LOGIN_BLOCK_FILE : undefined);
  const workflow = `
jobs:
  scan:
    steps:
      - run: a11ign http://localhost/ --flows flows/app.yml
`;
  assert.deepEqual(loginReasonsOf(workflow, readFile), ["names flows/app.yml, a flows file with a login: block"]);
});

test("a login secret in the env of a step that runs a scan is refused, and the reason names the variables", () => {
  assert.deepEqual(loginReasonsOf(LOGIN_SECRETS_IN_SCAN, noFiles), [
    "passes APP_TEST_USER, APP_TEST_PASSWORD to a step that runs a scan",
  ]);
});

test("a login secret in a step that runs no scan is not refused", () => {
  assert.deepEqual(loginReasonsOf(SECRETS_NOT_IN_SCAN, noFiles), []);
});

test("a login secret set at workflow level still reaches a scanning step, and is refused", () => {
  const workflow = `
env:
  AUTH0_TOTP_SEED: \${{ secrets.AUTH0_TOTP_SEED }}
jobs:
  scan:
    steps:
      - uses: ./
`;
  assert.deepEqual(loginReasonsOf(workflow, noFiles), ["passes AUTH0_TOTP_SEED to a step that runs a scan"]);
});

test("NEGATIVE CONTROL: a scan with no login, no login secret and no login flows file is not refused", () => {
  assert.deepEqual(loginReasonsOf(SCAN_WITHOUT_LOGIN, noFiles), []);
});

test("the refusal names a11ign/auth-capture-check and docs/try-it.md section 1", () => {
  const message = refusalMessage(".github/workflows/x.yml", "gives the Action a login-flow: input");
  assert.match(message, /a11ign\/auth-capture-check/);
  assert.match(message, /docs\/try-it\.md section 1/);
  assert.match(message, /^\.github\/workflows\/x\.yml: gives the Action a login-flow: input\./);
});

test("the real .github/workflows tree has no workflow that passes login secrets to an authenticated capture", () => {
  // The control above proves the check flags these shapes. An empty list here is a reading of the tree, and it names the files
  // that break it so a red run says which one.
  assert.deepEqual(workflowRefusals(ROOT).map((refusal) => refusal.file), []);
});
