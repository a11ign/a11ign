/**
 * The sign-in loop's trail, written to a file the caller names (a11ign#5510, under a11ign#5495): for each loop step the screen
 * and the control pressed, the alerts and controls each screen showed, and each loop's outcome. Nothing typed is in it. The interpreter
 * maps every branch to `{ screen, kind, alerts, controls }` before it marks, and this writer maps again, so a value a later mark
 * carried would still not reach the file.
 *
 * Named by `A11Y_AUTH_TRAIL_FILE`. Unset (or empty), no file is written and the mark does nothing.
 */
import { writeFileSync } from "node:fs";

import type { Environment, Mark } from "./interpreter.js";

export const AUTH_TRAIL_ENV = "A11Y_AUTH_TRAIL_FILE";

/** A control or alert as the screen showed it: its role and accessible name, and nothing else (a field's value is never one of these). */
export interface TrailShown { readonly role: string; readonly name: string }
export interface TrailBranch {
  readonly screen: string;
  readonly kind: string;
  /** The screen's alerts, so a rejected code is visible as the page said it (#5674); empty when the screen showed none. */
  readonly alerts: readonly TrailShown[];
  /** Every control the screen showed when the branch was taken, so a field error that is not an alert is visible beside it. */
  readonly controls: readonly TrailShown[];
  /** On the branch the loop acted on: how many times its screen was seen again. `0` is a loop that did not look (#5689). */
  readonly reobserved?: number;
  /** The screen as it last showed when seen again; absent when `reobserved` is 0 (#5689). */
  readonly lastSeen?: { readonly alerts: readonly TrailShown[]; readonly controls: readonly TrailShown[] };
}
export interface TrailLoop { readonly phase: string; readonly index: number; readonly outcome: string; readonly branches: readonly TrailBranch[] }

/** The loops written so far, per file: a scan signs in once per page, and every sign-in's loops join the same file. */
const loopsByFile = new Map<string, TrailLoop[]>();

/** Role and name only: a mark that carried more about a control (a value, say) is cut down here, not passed on. */
const shownOnly = (nodes: readonly TrailShown[]): TrailShown[] => nodes.map(({ role, name }) => ({ role, name }));

/** A branch as the trail keeps it: role and name wherever a control or alert is named, and the count and `lastSeen` only where the loop wrote them. */
const trailBranchOf = ({ screen, kind, alerts, controls, reobserved, lastSeen }: TrailBranch): TrailBranch => ({
  screen,
  kind,
  alerts: shownOnly(alerts),
  controls: shownOnly(controls),
  reobserved,
  lastSeen: lastSeen && { alerts: shownOnly(lastSeen.alerts), controls: shownOnly(lastSeen.controls) },
});

function loopOf(detail: Record<string, unknown>): TrailLoop {
  const branches = detail.branches as readonly TrailBranch[];
  return {
    phase: String(detail.phase),
    index: Number(detail.index),
    outcome: String(detail.outcome),
    branches: branches.map(trailBranchOf),
  };
}

/** The mark a sign-in is given: each `authLoop` is appended to the file, which is rewritten whole so it is never behind the run. */
export function authTrailMark(env: Environment): Mark {
  const file = env[AUTH_TRAIL_ENV];
  if (file === undefined || file === "") return () => undefined;
  return (event, detail) => {
    if (event !== "authLoop") return;
    const loops = [...(loopsByFile.get(file) ?? []), loopOf(detail)];
    loopsByFile.set(file, loops);
    writeFileSync(file, `${JSON.stringify({ loops }, null, 2)}\n`);
  };
}
