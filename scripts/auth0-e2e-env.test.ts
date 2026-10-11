/**
 * #4974 (part of #4084, v3 MFA): THE TENANT FILE IS CHECKED BY NAME, MODE AND SEED SHAPE, AND ITS VALUES REACH `gh` ON STDIN AND NOWHERE ELSE.
 *
 * Acceptance: `npx rstest run --config scripts/rstest/rstest.config.ts --include scripts/auth0-e2e-env.test.ts`.
 *
 * NOT RUN AGAINST THE REAL FILE: every file here is a throwaway holding SENTINEL values, and `gh` is a stub on `PATH` that records argv and stdin.
 *
 * POSITIVE CONTROL: the mode-600 file with five sentinels reports all five present by name, and the stub receives each value on stdin exactly once.
 * That is what makes the emptiness assertions below readings: "no sentinel in stdout, stderr or argv" is asserted over runs in which the stub DID
 * receive the sentinels on stdin, and `leaks()` is itself shown to find a sentinel that is planted in a channel.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
// The script is NOT imported: the acceptance job refuses a test whose import closure reaches `gh` ("needs `token`"), and every
// test here drives it as a process, which is the only way a stub `gh` on PATH is what it reaches.
const NAMES = ["AUTH0_DOMAIN", "AUTH0_CLIENT_ID", "AUTH0_TEST_USER", "AUTH0_TEST_PASSWORD", "AUTH0_TOTP_SEED"];

const SCRIPT = fileURLToPath(new URL("./auth0-e2e-env.ts", import.meta.url));
const SENTINELS: Record<string, string> = {
  AUTH0_DOMAIN: "sentinel-domain-4f1c.tenant.example",
  AUTH0_CLIENT_ID: "SENTINELCLIENTID9b2e7a",
  AUTH0_TEST_USER: "sentinel-user-31d8@example.test",
  AUTH0_TEST_PASSWORD: "Sentinel-Passw0rd-c0ffee!",
  AUTH0_TOTP_SEED: "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP",
};
const MODE_OK = 0o600;
const MODE_WIDE = 0o644;

function scratch(): string {
  return mkdtempSync(join(tmpdir(), "auth0-e2e-env-"));
}

function envFile(values: Record<string, string | undefined>, mode = MODE_OK): string {
  const path = join(scratch(), "auth0-e2e.env");
  const text = Object.entries(values).filter(([, v]) => v !== undefined).map(([k, v]) => `${k}=${v}`).join("\n") + "\n";
  writeFileSync(path, text);
  chmodSync(path, mode);
  return path;
}

/** A `gh` that appends {argv, stdin} to a JSON-lines record and exits with `exit`. */
function stubGh(exit = 0): { dir: string; record: string } {
  const dir = scratch();
  const record = join(dir, "calls.jsonl");
  const gh = join(dir, "gh");
  writeFileSync(gh, `#!${process.execPath}\nconst fs = require("node:fs");\nfs.appendFileSync(${JSON.stringify(record)}, JSON.stringify({ argv: process.argv.slice(2), stdin: fs.readFileSync(0, "utf8") }) + "\\n");\nprocess.stdout.write("stub gh stdout\\n");\nprocess.exit(${exit});\n`);
  chmodSync(gh, 0o755);
  return { dir, record };
}

function calls(record: string): { argv: string[]; stdin: string }[] {
  return existsSync(record) ? readFileSync(record, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
}

interface Run { status: number | null; stdout: string; stderr: string; argv: string[] }

function run(args: string[], gh = stubGh()): Run & { record: string } {
  const result = spawnSync(process.execPath, [SCRIPT, ...args], {
    encoding: "utf8",
    env: { PATH: `${gh.dir}${delimiter}${process.env.PATH ?? ""}`, HOME: scratch() },
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, argv: calls(gh.record).flatMap((c) => c.argv), record: gh.record };
}

/** The sentinel values found in any of the channels the row names: stdout, stderr, and the stub's recorded argv. */
function leaks(result: Run, values: Record<string, string> = SENTINELS): string[] {
  const channels = [result.stdout, result.stderr, ...result.argv];
  return Object.values(values).filter((value) => channels.some((c) => c.includes(value)));
}

test("POSITIVE CONTROL: a mode-600 file with five sentinels reports all five present by name", () => {
  const result = run(["--check", "--file", envFile(SENTINELS)]);
  assert.equal(result.status, 0, result.stdout);
  for (const name of NAMES) assert.match(result.stdout, new RegExp(`ok: ${name} is present`));
  assert.match(result.stdout, /file mode is 600/);
  assert.deepEqual(leaks(result), []);
});

test("POSITIVE CONTROL: --check is the default and runs no gh", () => {
  const gh = stubGh();
  const result = run(["--file", envFile(SENTINELS)], gh);
  assert.equal(result.status, 0);
  assert.deepEqual(calls(gh.record), []);
});

test("POSITIVE CONTROL: --apply-secrets gives the stub each value on stdin once and none in argv", () => {
  const gh = stubGh();
  const result = run(["--apply-secrets", "--repo", "a11ign/example", "--file", envFile(SENTINELS)], gh);
  assert.equal(result.status, 0, result.stdout);
  const made = calls(gh.record);
  assert.deepEqual(made.map((c) => c.argv), NAMES.map((n) => ["secret", "set", n, "--repo", "a11ign/example"]));
  assert.deepEqual(made.map((c) => c.stdin), NAMES.map((n) => SENTINELS[n]));
  assert.deepEqual(leaks(result), []);
  assert.match(result.stdout, /set: AUTH0_TOTP_SEED/);
});

test("the leak finder finds a sentinel planted in each channel", () => {
  const planted = SENTINELS.AUTH0_TEST_PASSWORD;
  assert.deepEqual(leaks({ status: 0, stdout: planted, stderr: "", argv: [] }), [planted]);
  assert.deepEqual(leaks({ status: 0, stdout: "", stderr: planted, argv: [] }), [planted]);
  assert.deepEqual(leaks({ status: 0, stdout: "", stderr: "", argv: ["x", planted] }), [planted]);
});

const REFUSALS: [string, Record<string, string | undefined>, number, RegExp][] = [
  ["a missing name", { ...SENTINELS, AUTH0_TEST_USER: undefined }, MODE_OK, /REFUSED: AUTH0_TEST_USER is missing/],
  ["an empty value", { ...SENTINELS, AUTH0_CLIENT_ID: "" }, MODE_OK, /REFUSED: AUTH0_CLIENT_ID is empty/],
  ["a mode 644 file", SENTINELS, MODE_WIDE, /REFUSED: file mode is 644, it must be 600/],
  ["a non-base32 seed", { ...SENTINELS, AUTH0_TOTP_SEED: "not-base32-SENTINEL-1!" }, MODE_OK, /REFUSED: AUTH0_TOTP_SEED is not RFC 4648 base32/],
];

for (const [label, values, mode, expected] of REFUSALS) {
  test(`NEGATIVE CONTROL: ${label} is refused by name, --apply-secrets runs no gh, and nothing leaks`, () => {
    const file = envFile(values, mode);
    const gh = stubGh();
    const checked = run(["--check", "--file", file], gh);
    const applied = run(["--apply-secrets", "--repo", "a11ign/example", "--file", file], gh);
    for (const result of [checked, applied]) {
      assert.equal(result.status, 1);
      assert.match(result.stdout, expected);
      const present = Object.fromEntries(Object.entries(values).filter(([, v]) => v)) as Record<string, string>;
      assert.deepEqual(leaks(result, { ...SENTINELS, ...present, seed: "not-base32-SENTINEL-1!" }), []);
    }
    assert.deepEqual(calls(gh.record), []);
  });
}

test("a failing gh is reported by name and exit code, its output is not forwarded, and no value leaks", () => {
  const gh = stubGh(3);
  const result = run(["--apply-secrets", "--repo", "a11ign/example", "--file", envFile(SENTINELS)], gh);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /FAILED: AUTH0_DOMAIN \(gh exit 3\)/);
  assert.doesNotMatch(result.stdout + result.stderr, /stub gh stdout/);
  assert.deepEqual(leaks(result), []);
});

test("a malformed line is reported by number, never by content", () => {
  const path = envFile(SENTINELS);
  writeFileSync(path, `${SENTINELS.AUTH0_TEST_PASSWORD}\n` + readFileSync(path, "utf8"));
  const result = run(["--check", "--file", path]);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /REFUSED: line 1 is not NAME=value/);
  assert.deepEqual(leaks(result), []);
});

test("usage errors: --apply-secrets without --repo, a malformed repo, and an unknown flag exit 2 and read nothing", () => {
  for (const args of [["--apply-secrets"], ["--apply-secrets", "--repo", "no-slash"], ["--apply-secrets", "--repo", "x a11ign/example"], ["--apply-secrets", "--repo"], ["--nope"]]) {
    const result = run([...args, "--file", envFile(SENTINELS)]);
    assert.equal(result.status, 2, args.join(" "));
    assert.deepEqual(calls(result.record), []);
  }
});

test("an unreadable file is refused by its error code only", () => {
  const result = run(["--check", "--file", join(scratch(), "absent.env")]);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /cannot read the tenant file \(ENOENT\)/);
});

const SEED_CASES: [string, string, boolean][] = [
  ["JBSWY3DPEHPK3PXP", "16 characters, the shortest accepted", true],
  ["jbswy3dpehpk3pxp", "lowercase", true],
  ["JBSWY3DPEHPK3PXPJB======", "padded to a multiple of eight", true],
  ["JBSWY3DPEHPK3PXPJB====", "padding that does not reach a multiple of eight", false],
  ["JBSWY3DPEHPK3PXPJ", "17 characters: remainder 1 mod 8 cannot be whole bytes", false],
  ["JBSWY3DPEHPK3PXPJBS", "19 characters: remainder 3 mod 8", false],
  ["JBSWY3DPEHPK3PXPJBSWYD", "22 characters: remainder 6 mod 8", false],
  ["JBSWY3DPEHPK3PXPJBSW", "20 characters: remainder 4 mod 8 is whole bytes", true],
  ["JBSWY3DPEHPK3P", "too short to be a seed", false],
  ["JBSWY3DPEHPK3P1X", "1 is not in the alphabet", false],
  ["JBSW=Y3DPEHPK3PXP", "padding mid-value", false],
];

for (const [seed, why, accepted] of SEED_CASES) {
  test(`seed shape: ${seed} (${why}) is ${accepted ? "accepted" : "refused"}`, () => {
    const result = run(["--check", "--file", envFile({ ...SENTINELS, AUTH0_TOTP_SEED: seed })]);
    assert.equal(result.status, accepted ? 0 : 1);
    assert.deepEqual(leaks(result, { seed }), []);
  });
}

test("a quoted value and an `export` prefix are read as the value", () => {
  const path = envFile({});
  writeFileSync(path, Object.entries(SENTINELS).map(([k, v], i) => (i % 2 ? `export ${k}="${v}"` : `${k}='${v}'`)).join("\n") + "\n");
  const result = run(["--apply-secrets", "--repo", "a11ign/example", "--file", path]);
  assert.equal(result.status, 0, result.stdout);
  assert.deepEqual(calls(result.record).map((c) => c.stdin), NAMES.map((n) => SENTINELS[n]));
});
