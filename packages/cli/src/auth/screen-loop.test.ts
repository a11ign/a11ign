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
  type TypeAction,
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
const LANDING = screen(["Sign in required"], [{ role: "button", name: "Sign in" }]);
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

describe("runLoop: what a branch records of its screen (#5674)", () => {
  test("POSITIVE CONTROL: a branch records the alert its screen showed and the controls beside it, and a screen with none records an empty list", async () => {
    const r = rig();
    const result = await r.run([IDENTIFIER, BLOCKED]);
    assert.deepEqual(result.branches[0].alerts, []);
    const stop = result.branches.at(-1);
    assert.equal(stop?.kind, "stop");
    assert.deepEqual(stop?.alerts, [{ role: "alert", name: "Your account has been blocked." }]);
    assert.deepEqual(stop?.controls, BLOCKED.controls);
  });
});

describe("runLoop: the landing screen, the app's own signed-out page", () => {
  test("POSITIVE CONTROL: a landing screen with one Sign in button presses it, and the login continues from there", async () => {
    assert.equal(classifyScreen(LANDING), "landing");
    const r = rig();
    const result = await r.run([LANDING, IDENTIFIER, SIGNED_IN]);
    assert.equal(result.outcome, "signed-in");
    assert.equal(r.acted[0].kind === "submit" && r.acted[0].target.name, "Sign in");
    assert.deepEqual(result.branches.map((b) => b.screen), ["landing", "identifier"]);
  });

  test("NEGATIVE CONTROL: a landing that returns after the login's forms is the callback in flight, and is not pressed again (a11ign#5534)", async () => {
    // The trail of run 38750473983: landing, identifier-and-password, one-time-code, then the SPA's callback page reads
    // `Sign in required` with its button until the token exchange settles, and the loop pressed it a second time.
    const r = rig();
    const result = await r.run([LANDING, COMBINED, OTP, LANDING, LANDING, SIGNED_IN]);
    assert.equal(result.outcome, "signed-in");
    assert.deepEqual(result.branches.map((b) => b.screen), ["landing", "identifier-and-password", "one-time-code"]);
    assert.equal(r.acted.filter((a) => a.kind === "submit").length, 1, "the app's Sign in is pressed once");
  });

  test("NEGATIVE CONTROL: a callback that never settles ends signed-in-check-never-matched, with Sign in pressed once", async () => {
    const r = rig();
    const result = await r.run([LANDING, COMBINED, OTP, LANDING], { budgetMillis: 5_000 });
    assert.equal(result.outcome, "signed-in-check-never-matched");
    assert.equal(r.acted.filter((a) => a.kind === "submit").length, 1);
  });
});

describe("runLoop: a provider's button on the landing page (a11ign#5534)", () => {
  test("NEGATIVE CONTROL: a provider's button is never a landing, and beside the app's own Sign in it is never the one pressed (a11ign#5534)", async () => {
    const providerOnly = screen(["Sign in required"], [{ role: "button", name: "Sign in with Google" }]);
    assert.notEqual(classifyScreen(providerOnly), "landing", "a provider-named control alone is not the app's sign-in");
    const beside = screen(["Sign in required"], [{ role: "button", name: "Continue with Google" }, { role: "button", name: "Sign in" }]);
    assert.equal(classifyScreen(beside), "landing");
    const r = rig();
    await r.run([beside, SIGNED_IN]);
    assert.equal(r.acted[0].kind === "submit" && r.acted[0].target.name, "Sign in");
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

  test("NEGATIVE CONTROL: a landing screen with TWO sign-in controls is not pressed, since which one starts the login is a guess", async () => {
    const twins = screen(["Sign in required"], [{ role: "button", name: "Sign in" }, { role: "button", name: "Log in" }]);
    const r = rig();
    const result = await r.run([twins], { budgetMillis: 5_000 });
    assert.equal(r.acted.length, 0, "two sign-in controls must never be pressed");
    assert.equal(result.outcome, "unknown-screen");
  });

  test("NEGATIVE CONTROL: a landing screen that comes back unchanged is pressed once, never again", async () => {
    const r = rig();
    const result = await r.run([LANDING], { budgetMillis: 5_000 });
    assert.equal(r.acted.length, 1, "the same landing is never pressed twice in a row");
    assert.equal(result.outcome, "signed-in-check-never-matched");
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

describe("the submit a typed form presses: a provider's button is never it, and two candidates are never picked by order", () => {
  const GOOGLE: ScreenControl = { role: "button", name: "Continue with Google" };
  const VERIFY: ScreenControl = { role: "button", name: "Verify" };
  const NEXT: ScreenControl = { role: "button", name: "Next" };

  /** The first action on an identifier page with these buttons beside the email field, when it is typed. */
  const typedFirst = async (buttons: readonly ScreenControl[]): Promise<TypeAction | undefined> => {
    const r = rig();
    await r.run([screen(["Welcome"], [EMAIL, ...buttons]), SIGNED_IN]);
    const first = r.acted[0];
    return first?.kind === "type" ? first : undefined;
  };

  test("POSITIVE CONTROL: the plain Continue is pressed beside a provider's button, whichever comes first on the page", async () => {
    assert.equal((await typedFirst([GOOGLE, CONTINUE]))?.submit?.name, "Continue");
    assert.equal((await typedFirst([CONTINUE, GOOGLE]))?.submit?.name, "Continue");
  });

  test("POSITIVE CONTROL: every provider the row names is never the submit, even when it is the only button", async () => {
    for (const name of ["Continue with Google", "Sign in with Apple", "Continue using GitHub", "Continue with Microsoft", "Continue with Facebook"]) {
      const alone = await typedFirst([{ role: "button", name }]);
      assert.ok(alone, `${name}: the identifier must still be typed`);
      assert.equal(alone.submit, undefined, name);
    }
  });

  test("the exact name wins over a looser one, whichever comes first", async () => {
    assert.equal((await typedFirst([VERIFY, SIGN_IN_BUTTON]))?.submit?.name, "Log in");
    assert.equal((await typedFirst([SIGN_IN_BUTTON, VERIFY]))?.submit?.name, "Log in");
  });

  test("NEGATIVE CONTROL: a provider's button alone is no submit, so the field is typed and Enter presses it", async () => {
    const typed = await typedFirst([GOOGLE]);
    assert.ok(typed, "the identifier must still be typed");
    assert.equal(typed.submit, undefined);
  });

  test("NEGATIVE CONTROL: a page whose only sign-in control is a provider's is unknown-screen, not a form", () => {
    assert.equal(classifyScreen(screen(["Welcome"], [GOOGLE])), "unknown-screen");
  });

  test("NEGATIVE CONTROL: two submits with no exact name are ambiguous, and nothing is typed or pressed", async () => {
    const both = screen(["Welcome"], [EMAIL, NEXT, VERIFY]);
    assert.equal(classifyScreen(both), "ambiguous");
    const r = rig();
    const result = await r.run([both]);
    assert.equal(r.acted.length, 0, "an ambiguous submit must never be guessed at");
    assert.equal(result.outcome, "unknown-screen");
  });
});
