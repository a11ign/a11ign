/**
 * The sign-in loop's trail, written to a file the caller names (a11ign#5510, under a11ign#5495): for each loop step the screen
 * and the control pressed, and each loop's outcome. Nothing typed is in it. The interpreter maps every branch to `{ screen, kind }`
 * before it marks, and this writer maps again, so a value a later mark carried would still not reach the file.
 *
 * Named by `A11Y_AUTH_TRAIL_FILE`. Unset (or empty), no file is written and the mark does nothing.
 */
import { writeFileSync } from "node:fs";

import type { Environment, Mark } from "./interpreter.js";

export const AUTH_TRAIL_ENV = "A11Y_AUTH_TRAIL_FILE";

export interface TrailBranch { readonly screen: string; readonly kind: string }
export interface TrailLoop { readonly phase: string; readonly index: number; readonly outcome: string; readonly branches: readonly TrailBranch[] }

/** The loops written so far, per file: a scan signs in once per page, and every sign-in's loops join the same file. */
const loopsByFile = new Map<string, TrailLoop[]>();

function loopOf(detail: Record<string, unknown>): TrailLoop {
  const branches = detail.branches as readonly TrailBranch[];
  return {
    phase: String(detail.phase),
    index: Number(detail.index),
    outcome: String(detail.outcome),
    branches: branches.map(({ screen, kind }) => ({ screen, kind })),
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
