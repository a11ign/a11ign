// THE FAILED-LOGIN ARTEFACT (#4985, #4084 design direction, item 4): per-step screenshots and trees, with nothing a person
// typed or a server set in the written output, and only the last failed attempt kept.
import { test } from "node:test";
import assert from "node:assert/strict";

import { buildScrubSet } from "./scrub.js";
import {
  REDACTED,
  keepLastAttempt,
  recordStep,
  startAttempt,
  writeArtifact,
  type ArtifactIo,
  type ObservedStep,
} from "./login-artifact.js";

const SEED = "JBSWY3DPEHPK3PXP-seed";
const PASSWORD = "correct-horse-battery";
const COOKIE = "sessionvalue-9f8e7d6c";
const SET = buildScrubSet([
  { name: "TOTP_SEED", value: SEED },
  { name: "PASSWORD", value: PASSWORD },
  { name: "SESSION_COOKIE", value: COOKIE },
]);

const png = (label: string): Uint8Array => new TextEncoder().encode(`png:${label}`);

const fakeIo = (): ArtifactIo & { files: Map<string, string | Uint8Array>; resets: string[] } => {
  const files = new Map<string, string | Uint8Array>();
  const resets: string[] = [];
  return {
    files,
    resets,
    reset: (dir) => {
      resets.push(dir);
      for (const path of [...files.keys()]) if (path.startsWith(`${dir}/`)) files.delete(path);
    },
    write: (path, data) => void files.set(path, data),
  };
};

const text = (data: string | Uint8Array): string => (typeof data === "string" ? data : new TextDecoder().decode(data));
const everythingWritten = (io: { files: Map<string, string | Uint8Array> }): string =>
  [...io.files].map(([path, data]) => `${path}\n${text(data)}`).join("\n");

const stepWith = (screen: string, extra: Partial<ObservedStep> = {}): ObservedStep => ({
  origin: "https://idp.example.test",
  screen,
  millis: 120,
  screenshot: png(screen),
  tree: { role: "document", name: screen, children: [{ role: "textbox", name: "Code", value: "" }] },
  ...extra,
});

const failedAttempt = (screens: string[], extra: Partial<ObservedStep> = {}) =>
  screens.reduce((attempt, screen) => recordStep(attempt, stepWith(screen, extra)), startAttempt(SET));

test("POSITIVE CONTROL: a three-step failed attempt writes three screenshots and three trees with origin, screen and millis", () => {
  const io = fakeIo();
  const attempt = failedAttempt(["Username", "Password", "Authenticator code"]);
  const written = writeArtifact("out", attempt, io);

  assert.equal(written.filter((path) => path.endsWith(".png")).length, 3);
  assert.equal(written.filter((path) => path.endsWith(".tree.json")).length, 3);
  assert.ok(io.files.has("out/step-03-authenticator-code.png"));
  const manifest = JSON.parse(text(io.files.get("out/steps.json")!)) as Array<Record<string, unknown>>;
  assert.deepEqual(manifest.map((s) => [s.step, s.origin, s.screen, s.millis]), [
    [1, "https://idp.example.test", "Username", 120],
    [2, "https://idp.example.test", "Password", 120],
    [3, "https://idp.example.test", "Authenticator code", 120],
  ]);
});

test("NEGATIVE CONTROL: the seed, the password and a cookie value appear nowhere in the written output", () => {
  const io = fakeIo();
  let attempt = startAttempt(SET);
  attempt = recordStep(attempt, stepWith("Password", {
    typed: PASSWORD,
    tree: { role: "textbox", name: "Password", value: PASSWORD },
  }));
  attempt = recordStep(attempt, stepWith("Authenticator code", {
    typed: SEED,
    origin: `https://idp.example.test/mfa?token=${COOKIE}`,
    tree: { role: "document", name: `Set-Cookie: sid=${COOKIE}; seed ${SEED}` },
  }));
  writeArtifact("out", attempt, io);

  const output = everythingWritten(io);
  for (const secret of [SEED, PASSWORD, COOKIE]) assert.ok(!output.includes(secret), "a secret reached the written output");
  assert.ok(output.includes(REDACTED), "typed was not marked redacted");
});

test("NEGATIVE CONTROL: a second failed attempt replaces the first, so one attempt's files remain", () => {
  const io = fakeIo();
  const first = failedAttempt(["Username", "Password", "Authenticator code"]);
  const second = failedAttempt(["Username", "Password"]);
  writeArtifact("out", keepLastAttempt([first, second])!, io);

  assert.equal([...io.files.keys()].filter((path) => path.endsWith(".png")).length, 2);
  assert.ok(!io.files.has("out/step-03-authenticator-code.png"), "a step of the first attempt survived");
  assert.equal(keepLastAttempt([]), undefined);
});

test("a value that survives scrubbing refuses the step instead of recording it", () => {
  const spelled = { announcements: [...SEED].map((c) => c) };
  assert.throws(() => recordStep(startAttempt(SET), stepWith("Code", { tree: spelled })), /auth-credential-in-artifact/);
});
