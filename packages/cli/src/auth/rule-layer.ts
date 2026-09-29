/**
 * The rule layer's own login — ADR 0038, "The rule layer logs in for itself" (PR 5, clause 10 of the row).
 *
 * `scanWithAxe` opens the page in the CLI's OWN Playwright browser, concurrently with the worker's capture. Given a
 * login it runs the same flow there, in that browser, from the same environment, over the same driver interface the
 * worker uses, and then scans the page it landed on. It never receives a session from the worker: nothing here takes
 * one, and the worker's answer is not an input.
 *
 * The result of a run that cannot log in is an ERROR and not a report (`AuthError`, never swallowed by
 * `pageContext`); a rule layer that fails for any OTHER reason is `findings: null`, "unchecked", which is what the
 * ADR's cut says and what ADR 0020 demands: the rule layer is never reported clean when it did not look.
 */
import { readFile } from "node:fs/promises";

import type { Page } from "playwright";

import { assertCredentialsPresent, signIn, type AuthPlan, type Environment, type Mark } from "./interpreter.js";
import { openPlaywrightDriver } from "./playwright-driver.js";
import { stateEntriesFor, type StateEntries } from "./scrub.js";
import { readStorageState } from "./state-file.js";

/** The entries of the plan's saved state that belong to `url`'s origin, read from the person's own file; undefined when the plan names none. */
async function loadedState(plan: AuthPlan, url: string, readText: (path: string) => Promise<string>): Promise<StateEntries | undefined> {
  if (plan.state === undefined) return undefined;
  return stateEntriesFor(await readStorageState(plan.state.path, readText), new URL(url).origin);
}

/**
 * The hook `scanWithAxe` runs INSTEAD of `page.goto(url)`: sign in, and arrive at `url`. The variables are checked
 * before the driver is opened, so a missing one fails before the browser is driven at all.
 */
export function ruleLayerSignIn(
  { plan, url, env = process.env, mark = () => undefined, readText = (path) => readFile(path, "utf8") }:
  { plan: AuthPlan; url: string; env?: Environment; mark?: Mark; readText?: (path: string) => Promise<string> },
): (page: Page) => Promise<void> {
  return async (page) => {
    assertCredentialsPresent(plan, env);
    const state = await loadedState(plan, url, readText); // before the browser is driven: a file that cannot be read costs no page load
    const driver = await openPlaywrightDriver(page);
    try {
      await signIn({ plan, url, driver, env, mark, state });
    } finally {
      await driver.close();
    }
  };
}
