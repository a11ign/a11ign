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
import type { Page } from "playwright";

import { assertCredentialsPresent, signIn, type AuthPlan, type Environment, type Mark } from "./interpreter.js";
import { openPlaywrightDriver } from "./playwright-driver.js";

/**
 * The hook `scanWithAxe` runs INSTEAD of `page.goto(url)`: sign in, and arrive at `url`. The variables are checked
 * before the driver is opened, so a missing one fails before the browser is driven at all.
 */
export function ruleLayerSignIn(
  { plan, url, env = process.env, mark = () => undefined }:
  { plan: AuthPlan; url: string; env?: Environment; mark?: Mark },
): (page: Page) => Promise<void> {
  return async (page) => {
    assertCredentialsPresent(plan, env);
    const driver = await openPlaywrightDriver(page);
    try {
      await signIn({ plan, url, driver, env, mark });
    } finally {
      await driver.close();
    }
  };
}
