// `npm run auth:artifact-scan` (#2560), THROUGH THE COMMAND: the script is spawned, and only its exit code and output are read.
//
// The positive controls are here and not in `auth-leak-detector.test.ts`: that file proves the detector can fire, and this one
// proves the COMMAND points it at what `auth:leak-check`'s `writtenFiles` never reads (a `.md`, a `.txt`, a `.log`) and that it
// will not call an empty look clean. Each assertion names the check whose removal turns it red.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { parseArtifactScanArgs } from "./artifact-scan.js";

const FAKE_USER = "canaryuser6d3f2a";
const FAKE_SECRET = "canarysecretb81c94";
const ROOT = resolve(import.meta.dirname ?? new URL(".", import.meta.url).pathname, "../../../..");
const ARGS = ["--user-env", "FAKE_USER", "--secret-env", "FAKE_SECRET"];

interface Ran { code: number | null; out: string; err: string }

function scan(path: string, env: Record<string, string | undefined> = { FAKE_USER, FAKE_SECRET }): Promise<Ran> {
  return new Promise((done) => {
    const child = spawn(process.execPath, ["--import", "tsx", "scripts/auth-artifact-scan.mjs", "--path", path, ...ARGS], {
      cwd: ROOT, env: { ...process.env, FAKE_USER: undefined, FAKE_SECRET: undefined, ...env } as NodeJS.ProcessEnv,
    });
    let out = ""; let err = "";
    child.stdout.on("data", (chunk) => { out += chunk; });
    child.stderr.on("data", (chunk) => { err += chunk; });
    child.on("close", (code) => done({ code, out, err }));
  });
}

/** A directory holding these files (name to content), removed afterwards. */
async function withDir<T>(files: Record<string, string | Buffer>, run: (dir: string) => Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "artifact-scan-test-"));
  try {
    for (const [name, content] of Object.entries(files)) {
      mkdirSync(join(dir, name, ".."), { recursive: true });
      writeFileSync(join(dir, name), content);
    }
    return await run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const PNG_WITH_NUL = Buffer.from("PNG\u0000IHDR"); // valid UTF-8 that a NUL byte still marks as binary
const INVALID_UTF8 = Buffer.from("c328", "hex"); // a lead byte with no continuation
const SPELLED_LENGTH = 6; // more than the detector's run of four
const SUBSTRING_LENGTH = 4;
const CLEAN = "# Summary\n\nThe page has 3 landmarks and a form.\nNVDA said: Account, heading level 1\n";
const NOTHING_OF_THE_VALUE = (out: string): void => {
  for (const value of [FAKE_USER, FAKE_SECRET]) {
    for (let start = 0; start + SUBSTRING_LENGTH <= value.length; start += 1) assert.ok(!out.includes(value.slice(start, start + SUBSTRING_LENGTH)), `the output carries "${value.slice(start, start + SUBSTRING_LENGTH)}" of a value`);
  }
};

test("a .md holding the raw credential exits 1: the file `writtenFiles` never read", async () => {
  await withDir({ "summary.md": `${CLEAN}\nSigned in as ${FAKE_USER}\n`, "report.json": "{}" }, async (dir) => {
    const ran = await scan(dir);
    assert.equal(ran.code, 1, ran.out + ran.err);
    assert.match(ran.out, /LEAK in summary\.md: FAKE_USER \(contiguous, raw\)/);
  });
});

test("the secret is checked as well as the user, and named as itself", async () => {
  await withDir({ "job.log": `password=${FAKE_SECRET}\n` }, async (dir) => {
    const ran = await scan(dir);
    assert.equal(ran.code, 1, ran.out + ran.err);
    assert.match(ran.out, /FAKE_SECRET/);
    assert.doesNotMatch(ran.out, /FAKE_USER/);
  });
});

test("the credential URL-encoded in a .txt exits 1", async () => {
  // A value with a character the encoder rewrites, so the url-encoded form differs from the raw one.
  const value = "canary user&6d3f2a";
  await withDir({ "comment.txt": `see https://example.test/?u=${encodeURIComponent(value)}\n` }, async (dir) => {
    const ran = await scan(dir, { FAKE_USER: value, FAKE_SECRET });
    assert.equal(ran.code, 1, ran.out + ran.err);
    assert.match(ran.out, /FAKE_USER \(contiguous, url-encoded\)/);
  });
});

test("the credential spelled out as a run of one-character lines exits 1", async () => {
  await withDir({ "transcript.txt": `${CLEAN}${FAKE_USER.slice(0, SPELLED_LENGTH).split("").join("\n")}\nSubmit, button\n` }, async (dir) => {
    const ran = await scan(dir);
    assert.equal(ran.code, 1, ran.out + ran.err);
    assert.match(ran.out, /FAKE_USER \(spelled-out\)/);
  });
});

test("a run of one-character JSON list items in a .json exits 1 (the structure, not the text)", async () => {
  await withDir({ "witness.json": JSON.stringify({ transcript: ["Account", ...FAKE_USER.split("")] }, null, 2) }, async (dir) => {
    const ran = await scan(dir);
    assert.equal(ran.code, 1, ran.out + ran.err);
    assert.match(ran.out, /FAKE_USER \(spelled-out\)/);
  });
});

test("a credential in a file a level down, with no extension, exits 1", async () => {
  await withDir({ "logs/step-1/output": `token ${FAKE_SECRET}\n` }, async (dir) => {
    const ran = await scan(dir);
    assert.equal(ran.code, 1, ran.out + ran.err);
    assert.match(ran.out, /LEAK in logs[\\/]step-1[\\/]output: FAKE_SECRET/);
  });
});

test("a single FILE can be scanned, not only a directory", async () => {
  await withDir({ "summary.md": `${CLEAN}${FAKE_USER}\n` }, async (dir) => {
    assert.equal((await scan(join(dir, "summary.md"))).code, 1);
    await withDir({ "summary.md": CLEAN }, async (clean) => assert.equal((await scan(join(clean, "summary.md"))).code, 0));
  });
});

test("clean files exit 0 and print a non-zero examined count before saying clean", async () => {
  await withDir({ "summary.md": CLEAN, "job.log": "step 1 ok\nstep 2 ok\n" }, async (dir) => {
    const ran = await scan(dir);
    assert.equal(ran.code, 0, ran.out + ran.err);
    assert.match(ran.out, /examined 2 files and [1-9]\d* announcements/);
    assert.ok(ran.out.indexOf("examined") < ran.out.indexOf("CLEAN"), "the examined count comes before the verdict");
  });
});

test("an EMPTY directory exits 2, never 0", async () => {
  await withDir({}, async (dir) => {
    const ran = await scan(dir);
    assert.equal(ran.code, 2, ran.out + ran.err);
    assert.match(ran.out, /COULD NOT EXAMINE/);
  });
});

test("a directory holding only files with no text in them (blank or a binary) exits 2", async () => {
  await withDir({ "shot.png": PNG_WITH_NUL, "blank.md": "\n\n" }, async (dir) => {
    const ran = await scan(dir);
    assert.equal(ran.code, 2, ran.out + ran.err);
    assert.match(ran.out, /SKIPPED shot\.png: binary/);
  });
});

test("a binary file beside clean text is NAMED as skipped and does not fail the scan", async () => {
  await withDir({ "shot.png": PNG_WITH_NUL, "invalid.bin": INVALID_UTF8, "summary.md": CLEAN }, async (dir) => {
    const ran = await scan(dir);
    assert.equal(ran.code, 0, ran.out + ran.err);
    assert.match(ran.out, /SKIPPED shot\.png: binary \(holds a NUL byte\)/);
    assert.match(ran.out, /SKIPPED invalid\.bin: binary \(not valid UTF-8\)/);
    assert.match(ran.out, /examined 1 file /);
  });
});

test("a symbolic link is named as skipped and not followed", async () => {
  await withDir({ "summary.md": CLEAN }, async (dir) => {
    await withDir({ "outside.md": FAKE_USER }, async (outside) => {
      symlinkSync(join(outside, "outside.md"), join(dir, "link.md"));
      const ran = await scan(dir);
      assert.equal(ran.code, 0, ran.out + ran.err);
      assert.match(ran.out, /SKIPPED link\.md: symbolic link/);
    });
  });
});

test("a hit's output names the variable and carries no substring of either value", async () => {
  await withDir({ "a.md": `${FAKE_USER}\n`, "b.log": `${Buffer.from(FAKE_SECRET).toString("base64")}\n`, "c.txt": FAKE_USER.split("").join("\n") }, async (dir) => {
    const ran = await scan(dir);
    assert.equal(ran.code, 1, ran.out + ran.err);
    assert.match(ran.out, /FAKE_USER/);
    assert.match(ran.out, /FAKE_SECRET \(contiguous, base64\)/);
    NOTHING_OF_THE_VALUE(ran.out + ran.err);
  });
});

test("a path that does not exist, and a variable that is not set, exit 2", async () => {
  const missing = await scan(join(tmpdir(), "artifact-scan-test-no-such-directory"));
  assert.equal(missing.code, 2, missing.out + missing.err);
  assert.match(missing.err, /does not exist/);
  await withDir({ "summary.md": CLEAN }, async (dir) => {
    const unset = await scan(dir, { FAKE_USER, FAKE_SECRET: undefined });
    assert.equal(unset.code, 2, unset.out + unset.err);
    assert.match(unset.err, /FAKE_SECRET is not set/);
  });
});

test("a mistyped or missing flag is refused by name", () => {
  assert.throws(() => parseArtifactScanArgs(["--pth", "x", ...ARGS]), /unknown argument "--pth"/);
  assert.throws(() => parseArtifactScanArgs(ARGS), /--path is required/);
  assert.throws(() => parseArtifactScanArgs(["--path", "a", "--path", "b", ...ARGS]), /--path was given twice/);
  assert.deepEqual(parseArtifactScanArgs(["--path=out", ...ARGS]), { path: "out", userEnv: "FAKE_USER", secretEnv: "FAKE_SECRET" });
});
