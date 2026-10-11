import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { judgeBackend } from "./index.js";

/**
 * ONE RESOLUTION OF "WHICH BACKEND IS ACTIVE" — it was written out in four places and they had drifted.
 *
 * `judge.ts` carried the reason, having been bitten by it: "`||`, not `??`: an env var set to the EMPTY
 * string is how CI passes 'unset', and `??` only defaults on nullish — so an empty JUDGE_BACKEND selected
 * no backend at all here rather than the intended default."
 *
 * The remedy reached one of the four. `lab/eval/run.ts` still had `??`, and it uses the value for
 * `c.notApplicableTo?.includes(BACKEND)` — so with `JUDGE_BACKEND=""` no case ever matched and cases the
 * local scorer CANNOT assess were scored rather than excluded, against a comment three lines away saying
 * an exclusion "can never be mistaken for a pass".
 */
const ROOT = join(import.meta.dirname, "../../..");

function withEnv<T>(value: string | undefined, run: () => T): T {
  const previous = process.env.JUDGE_BACKEND;
  if (value === undefined) delete process.env.JUDGE_BACKEND;
  else process.env.JUDGE_BACKEND = value;
  try {
    return run();
  } finally {
    if (previous === undefined) delete process.env.JUDGE_BACKEND;
    else process.env.JUDGE_BACKEND = previous;
  }
}

test("an EMPTY JUDGE_BACKEND resolves to the default, not to nothing", () => {
  // The whole point. `??` would return "" here, and "" matches no backend name anywhere.
  assert.equal(withEnv("", () => judgeBackend()), "local");
});

test("an unset JUDGE_BACKEND resolves to the default", () => {
  assert.equal(withEnv(undefined, () => judgeBackend()), "local");
});

test("a set backend is honoured, lower-cased", () => {
  assert.equal(withEnv("Anthropic", () => judgeBackend()), "anthropic");
});

/**
 * The fleet's laid directory is another repository's code and never this repository's to read (ADR 0045 cut 4, #5082). `doctor` in
 * `@a11ign/screenreader-fleet` keeps its own read of JUDGE_BACKEND because the package must not depend on the judge; this file used to open that
 * laid `doctor.ts` and pin its `|| "local"`, and that pin is the fleet repository's to hold now. A checkout laid before the cut still has the
 * directory, so the walk below skips it by name rather than reporting the one copy that was always allowed.
 */
const LAID_FLEET = join("packages", "worker-fleet");

/** Every non-test source file under packages/, as [path, text]. */
function sources(): [string, string][] {
  const out: [string, string][] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (["node_modules", "dist", ".git"].includes(entry.name) || path === join(ROOT, LAID_FLEET)) continue;
        walk(path);
        continue;
      }
      if (!/\.(ts|mjs)$/.test(entry.name) || /\.test\.[cm]?ts$/.test(entry.name)) continue;
      out.push([path.slice(ROOT.length + 1), readFileSync(path, "utf8")]);
    }
  };
  walk(join(ROOT, "packages"));
  return out;
}

test("nothing else resolves JUDGE_BACKEND itself", () => {
  // The SHAPE, discovered rather than listed: a second reader of this env var is a second place for the
  // default and the empty-string rule to be got wrong, which is exactly what happened.
  const offenders: string[] = [];
  for (const [path, text] of sources()) {
    if (path.endsWith("packages/judge/src/index.ts")) continue; // the one place it may live
    // A comment mentioning the variable is fine; a read of it is not.
    for (const line of text.split("\n")) {
      const code = line.replace(/\/\/.*$/, "").replace(/^\s*\*.*$/, "");
      if (/process\.env\.JUDGE_BACKEND/.test(code)) offenders.push(`${path}: ${line.trim().slice(0, 90)}`);
    }
  }
  assert.deepEqual(offenders, [], "these read JUDGE_BACKEND directly instead of calling judgeBackend(), "
    + `so each is a place the default can drift:\n  ${offenders.join("\n  ")}`);
});
