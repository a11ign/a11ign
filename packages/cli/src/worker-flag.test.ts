/**
 * `--worker` is validated by the fleet layer's `assertWorkerUrl` before the CLI leases or captures (#4593).
 *
 * Imports `worker-flag.ts` only: `cli.ts` reaches the corpus, and a test importing it is refused by `pr-open`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { workerFlagValue } from "./worker-flag.ts";

test("a host-less address is refused, naming --worker", () => {
  assert.throws(() => workerFlagValue("http://:8765"), /--worker/);
});

test("a missing value is refused, naming --worker, rather than kept as the default", () => {
  assert.throws(() => workerFlagValue(undefined), /--worker/);
});

test("a well-formed address passes with its trailing slash removed", () => {
  assert.equal(workerFlagValue("http://w:8765/"), "http://w:8765");
});
