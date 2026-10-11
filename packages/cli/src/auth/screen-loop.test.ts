// THE SCREEN LOOP (#4993, under #4084). Every case is a plain observation and an injected clock: no browser, no network.
//
// POSITIVE CONTROL marks the cases that must act (the four-screen login, the skip, each recognised screen). NEGATIVE
// CONTROL marks the cases that must NOT act or must end: an ambiguous screen, an unmatched one, a blocked account, a bot
// challenge, a form that comes back unchanged, a loop that never matches. A suite of only the first could not tell a
// loop that works from one that acts on everything.
import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  classifyScreen,
  nextAction,
  runLoop,
  UNKNOWN_SETTLE_OBSERVATIONS,
  type Action,
  type LoopConfig,
  type LoopResult,
  type ScreenControl,
  type ScreenObservation,
} from "./screen-loop.js";

const EMAIL: ScreenControl = { role: "textbox", name: "Email address", autocomplete: "username" };
const PASSWORD: ScreenControl = { role: "textbox", name: "Password", autocomplete: "current-password" };
const CODE: ScreenControl = { role: "textbox", name: "Enter the code", autocomplete: "one-time-code" };
const CONTINUE: ScreenControl = { role: "button", name: "Continue" };
const SIGN_IN_BUTTON: ScreenControl = { role: "button", name: "Log in" };

const screen = (headings: readonly string[], controls: readonly ScreenControl[]): ScreenObservation => ({ headings, controls, signedIn: false });
const SIGNED_IN: ScreenObservation = { headings: ["Dashboard"], controls: [], signedIn: true };

const IDENTIFIER = screen(["Welcome"], [EMAIL, CONTINUE]);
const PASSWORD_SCREEN = screen(["Enter your password"], [PASSWORD, CONTINUE]);
const COMBINED = screen(["Log in"], [EMAIL, PASSWORD, SIGN_IN_BUTTON]);
const OTP = screen(["Verify your identity"], [CODE, CONTINUE]);
const PASSKEY = screen(["Log in faster with a passkey"], [
  { role: "button", name: "Create a passkey" },
  { role: "button", name: "Continue without passkeys" },
]);
const BLOCKED = screen(["Account blocked"], [{ role: "alert", name: "Your account has been blocked." }]);
const BOT = screen(["One more step"], [{ role: "checkbox", name: "I'm not a robot" }]);
const CONFIG: LoopConfig = { totpSeedConfigured: true };

interface Rig {
  readonly run: (script: ScreenObservation[], overrides?: Partial<{ budgetMillis: number; config: LoopConfig }>) => Promise<LoopResult>;
  readonly acted: Action[];
  readonly observed: () => number;
}

/** A scripted page: each observe reads the next entry and the last one repeats, as a page that stopped changing. */
const rig = (): Rig => {
  const acted: Action[] = [];
  let observations = 0;
  const run: Rig["run"] = (script, overrides = {}) => {
    let clock = 0;
    let index = 0;
    return runLoop({
      observe: async () => {
        observations += 1;
        const seen = script[Math.min(index, script.length - 1)];
        index += 1;
        return seen;
      },
      act: async (action) => {
        acted.push(action);
      },
      pause: async (millis) => {
        clock += millis;
      },
      now: () => clock,
      budgetMillis: overrides.budgetMillis ?? 60_000,
      config: overrides.config ?? CONFIG,
    });
  };
  return { run, acted, observed: () => observations };
};

describe("classifyScreen: recognised by accessible name and autocomplete token", () => {
  test("POSITIVE CONTROL: each login form is named from its controls and headings", () => {
    assert.equal(classifyScreen(IDENTIFIER), "identifier");
    assert.equal(classifyScreen(PASSWORD_SCREEN), "password");
    assert.equal(classifyScreen(COMBINED), "identifier-and-password");
    assert.equal(classifyScreen(OTP), "one-time-code");
    assert.equal(classifyScreen(PASSKEY), "passkey-nudge");
    assert.equal(classifyScreen(screen(["Stay signed in?"], [{ role: "button", name: "Yes" }, { role: "button", name: "No" }])), "stay-signed-in");
    assert.equal(classifyScreen(screen(["Authorize App"], [{ role: "button", name: "Accept" }, { role: "button", name: "Deny" }])), "consent");
    assert.equal(
      classifyScreen(screen(["Verify your identity"], [{ role: "button", name: "Google Authenticator" }, { role: "button", name: "SMS" }])),
      "factor-picker",
    );
  });

  test("the autocomplete token alone recognises a field whose label is unhelpful", () => {
    const odd = screen(["Hi"], [{ role: "textbox", name: "Field 1", autocomplete: "section-a one-time-code" }, CONTINUE]);
    assert.equal(classifyScreen(odd), "one-time-code");
  });

  test("the classification ignores CSS class names: a rebuilt stylesheet does not move a screen", () => {
    const rebuilt = screen(["Welcome"], [{ ...EMAIL, className: "c8f2a91" }, { ...CONTINUE, className: "_x_93kd" }]);
    assert.equal(classifyScreen(rebuilt), classifyScreen(IDENTIFIER));
  });

  test("NEGATIVE CONTROL: a control that only LOOKS right by its class name is not a login form", () => {
    const decoy = screen(["Welcome"], [{ role: "textbox", name: "", className: "username-input password-field" }]);
    assert.equal(classifyScreen(decoy), "unknown-screen");
  });

  test("NEGATIVE CONTROL: a screen whose controls match two screens is ambiguous", () => {
    const both = screen(
      ["Stay signed in?", "Authorize App"],
      [{ role: "button", name: "Accept" }, { role: "button", name: "No" }],
    );
    assert.equal(classifyScreen(both), "ambiguous");
  });

  test("NEGATIVE CONTROL: an unmatched screen is unknown-screen", () => {
    assert.equal(classifyScreen(screen(["Pick a nickname"], [{ role: "textbox", name: "Nickname" }, CONTINUE])), "unknown-screen");
  });

  test("an alert on the one-time-code form ends it as rejected, not as the form again", () => {
    const rejected = screen(OTP.headings, [...OTP.controls, { role: "alert", name: "The code you entered is invalid" }]);
    assert.equal(classifyScreen(rejected), "totp-rejected");
    const wrongPassword = screen(COMBINED.headings, [...COMBINED.controls, { role: "alert", name: "Wrong email or password" }]);
    assert.equal(classifyScreen(wrongPassword), "credentials-rejected");
  });
});

describe("runLoop: act, observe, repeat, within one budget", () => {
  test("POSITIVE CONTROL: identifier, password, one-time code, signed in take four actions in order and list them", async () => {
    const r = rig();
    const result = await r.run([IDENTIFIER, PASSWORD_SCREEN, OTP, SIGNED_IN]);
    assert.equal(result.outcome, "signed-in");
    assert.deepEqual(result.branches.map((b) => b.screen), ["identifier", "password", "one-time-code"]);
    assert.deepEqual(r.acted.map((a) => (a.kind === "type" ? a.fields.map((f) => f.source).join("+") : a.kind)), [
      "identifier",
      "password",
      "one-time-code",
    ]);
  });

  test("POSITIVE CONTROL: a passkey nudge is skipped and the skip is recorded", async () => {
    const r = rig();
    const result = await r.run([COMBINED, PASSKEY, SIGNED_IN]);
    assert.equal(result.outcome, "signed-in");
    const skipped = result.branches.find((b) => b.screen === "passkey-nudge");
    assert.equal(skipped?.kind, "skip");
    assert.match(skipped?.note ?? "", /passkey/);
    const skip = r.acted.find((a) => a.kind === "skip");
    assert.equal(skip?.kind === "skip" && skip.target.name, "Continue without passkeys");
  });

  test("a combined login screen types both fields in one action, naming where each value comes from", async () => {
    const r = rig();
    await r.run([COMBINED, SIGNED_IN]);
    const typed = r.acted[0];
    assert.equal(typed.kind, "type");
    assert.deepEqual(typed.kind === "type" && typed.fields.map((f) => f.source), ["identifier", "password"]);
  });

  test("stay signed in is answered No, and a consent screen is accepted with the tenant fix in the summary", async () => {
    const r = rig();
    const stay = screen(["Stay signed in?"], [{ role: "button", name: "Yes" }, { role: "button", name: "No" }]);
    const consent = screen(["Authorize App"], [{ role: "button", name: "Accept" }, { role: "button", name: "Deny" }]);
    const result = await r.run([stay, consent, SIGNED_IN]);
    assert.equal(result.outcome, "signed-in");
    assert.equal(r.acted[0].kind === "choose" && r.acted[0].target.name, "No");
    assert.match(result.branches[1].note ?? "", /first-party/);
  });

  test("an organization picker is answered with the configured name, and ends organization-required without one", async () => {
    const picker = screen(["Select an organization"], [{ role: "button", name: "Acme" }, { role: "button", name: "Globex" }]);
    const withName = await rig().run([picker, SIGNED_IN], { config: { ...CONFIG, organization: "acme" } });
    assert.equal(withName.outcome, "signed-in");
    const r = rig();
    const without = await r.run([picker, SIGNED_IN]);
    assert.equal(without.outcome, "organization-required");
    assert.equal(r.acted.length, 0);
  });

  test("a factor picker chooses the authenticator app; with no seed it ends before choosing", async () => {
    const picker = screen(["Verify your identity"], [{ role: "button", name: "SMS" }, { role: "button", name: "Authenticator app" }]);
    const r = rig();
    await r.run([picker, SIGNED_IN]);
    assert.equal(r.acted[0].kind === "choose" && r.acted[0].target.name, "Authenticator app");
    const noSeed = rig();
    const ended = await noSeed.run([picker], { config: { totpSeedConfigured: false } });
    assert.equal(ended.outcome, "mfa-required-no-seed");
    assert.equal(noSeed.acted.length, 0);
  });

  test("a required enrolment with no way to skip it ends mfa-enrollment-required; an offered one is skipped", () => {
    const required = screen(["Secure your account"], [{ role: "button", name: "Set up authenticator" }]);
    assert.deepEqual(nextAction("mfa-enrollment", CONFIG, required).kind, "stop");
    const offered = screen(["Secure your account"], [{ role: "button", name: "Remind me later" }]);
    assert.equal(nextAction("mfa-enrollment", CONFIG, offered).kind, "skip");
  });

});

describe("runLoop: the screens it must not act on, and the ends it must not retry", () => {
  test("NEGATIVE CONTROL: an ambiguous screen is not acted on, and is acted on once it resolves", async () => {
    const both = screen(["Stay signed in?", "Authorize App"], [{ role: "button", name: "Accept" }, { role: "button", name: "No" }]);
    const r = rig();
    const stuck = await r.run([both], { budgetMillis: 5_000 });
    assert.equal(r.acted.length, 0, "an ambiguous screen must never be acted on");
    assert.equal(stuck.outcome, "unknown-screen");
    const settling = rig();
    const resolved = await settling.run([both, IDENTIFIER, SIGNED_IN]);
    assert.equal(resolved.outcome, "signed-in");
    assert.deepEqual(resolved.branches.map((b) => b.screen), ["identifier"]);
  });

  test("NEGATIVE CONTROL: an unmatched screen ends unknown-screen with the step text, and is never acted on", async () => {
    const r = rig();
    const odd = screen(["Pick a nickname"], [{ role: "textbox", name: "Nickname" }, { role: "button", name: "Save nickname" }]);
    const result = await r.run([odd]);
    assert.equal(result.outcome, "unknown-screen");
    assert.equal(r.acted.length, 0);
    assert.match(result.flowsStep ?? "", /press: \{ control: "Save nickname" \}/);
    assert.match(result.flowsStep ?? "", /flows step/);
    assert.equal(r.observed(), UNKNOWN_SETTLE_OBSERVATIONS, "ends once the page stops changing, not at the budget");
  });

  test("NEGATIVE CONTROL: a blocked-account screen ends at once, never acted on and never retried", async () => {
    const r = rig();
    const result = await r.run([BLOCKED, IDENTIFIER, SIGNED_IN]);
    assert.equal(result.outcome, "account-blocked");
    assert.equal(r.acted.length, 0);
    assert.equal(r.observed(), 1);
  });

  test("NEGATIVE CONTROL: a bot-challenge screen ends at once, never acted on and never retried", async () => {
    const r = rig();
    const result = await r.run([BOT, IDENTIFIER, SIGNED_IN]);
    assert.equal(result.outcome, "bot-challenge");
    assert.equal(r.acted.length, 0);
    assert.equal(r.observed(), 1);
  });

  test("NEGATIVE CONTROL: wrong credentials end the login after one attempt, with the password typed once", async () => {
    const rejected = screen(COMBINED.headings, [...COMBINED.controls, { role: "alert", name: "Wrong email or password" }]);
    const r = rig();
    const result = await r.run([COMBINED, rejected, COMBINED]);
    assert.equal(result.outcome, "credentials-rejected");
    assert.equal(r.acted.length, 1);
  });

  test("NEGATIVE CONTROL: a form that comes back unchanged is waited on, never typed into twice, and stops at the budget", async () => {
    const r = rig();
    const result = await r.run([PASSWORD_SCREEN], { budgetMillis: 5_000 });
    assert.equal(r.acted.length, 1, "the same screen is never acted on twice in a row");
    assert.equal(result.outcome, "signed-in-check-never-matched");
  });

});

describe("runLoop: the budget is enforced around observation too", () => {
  test("NEGATIVE CONTROL: an observation that spends the budget is not acted on", async () => {
    let clock = 0;
    const acted: Action[] = [];
    const result = await runLoop({
      observe: async () => {
        clock = 5_000;
        return IDENTIFIER;
      },
      act: async (action) => {
        acted.push(action);
      },
      pause: async () => {},
      now: () => clock,
      budgetMillis: 1_000,
      config: CONFIG,
    });
    assert.equal(acted.length, 0, "the deadline passed during observe, so nothing may be typed");
    assert.equal(result.outcome, "signed-in-check-never-matched");
  });

  test("a spent budget ends the loop without a further observation", async () => {
    const r = rig();
    const result = await r.run([IDENTIFIER], { budgetMillis: 0 });
    assert.equal(r.observed(), 0);
    assert.equal(result.outcome, "signed-in-check-never-matched");
  });
});
