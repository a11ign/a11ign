/**
 * The failed-login artefact (v3, #4084 item 4): when a login stops, the adopter sees the screen that stopped it.
 *
 * Per step it keeps the screenshot and the accessibility tree, plus the step's origin, its classified screen and its
 * timing. What was TYPED is never kept: `typed` becomes `[redacted]`, and every string the step carries (origin,
 * screen, tree) goes through `scrub.ts`'s scrubber, so a cookie or token value handed to the scrub set is stripped
 * from them too. Only the last failed attempt is kept, so a retry leaves one attempt's files and not a mixture.
 *
 * **What it cannot do: it cannot scrub pixels.** A screenshot is written as given, so the caller must capture it with
 * its fields masked; the tree is where the typed value would otherwise survive, and that one is scrubbed.
 *
 * PURE apart from the `io` `writeArtifact` is handed. No file reads and no environment.
 */
import { scrubArtifact, type ScrubSet } from "./scrub.js";

/** What replaces what was typed. Distinct from scrub's marker: the value is never inspected, only dropped. */
export const REDACTED = "[redacted]";

/** A step as the driver observed it. `typed` is what the driver typed on this screen, if anything. */
export interface ObservedStep {
  readonly origin: string;
  readonly screen: string;
  readonly millis: number;
  readonly screenshot: Uint8Array;
  readonly tree: unknown;
  readonly typed?: string;
}

export interface RecordedStep {
  readonly origin: string;
  readonly screen: string;
  readonly millis: number;
  readonly screenshot: Uint8Array;
  readonly tree: unknown;
  readonly typed?: typeof REDACTED;
}

export interface Attempt {
  readonly scrub: ScrubSet;
  readonly steps: readonly RecordedStep[];
}

/** Where the files go. `reset` empties the directory first, so a shorter attempt leaves no step of an earlier one. */
export interface ArtifactIo {
  reset(dir: string): void;
  write(path: string, data: string | Uint8Array): void;
}

export const startAttempt = (scrub: ScrubSet): Attempt => ({ scrub, steps: [] });

/**
 * Add a step, redacted. Throws `ScrubError` (`auth-credential-in-artifact`) when a value survives scrubbing, so a
 * step that cannot be made safe is not recorded at all.
 */
export function recordStep(attempt: Attempt, step: ObservedStep): Attempt {
  const { value } = scrubArtifact({ origin: step.origin, screen: step.screen, tree: step.tree }, attempt.scrub);
  const recorded: RecordedStep = {
    ...value,
    millis: step.millis,
    screenshot: step.screenshot,
    ...(step.typed === undefined ? {} : { typed: REDACTED }),
  };
  return { scrub: attempt.scrub, steps: [...attempt.steps, recorded] };
}

/** The attempt that failed last, or undefined when none did. */
export function keepLastAttempt(attempts: readonly Attempt[]): Attempt | undefined {
  return attempts[attempts.length - 1];
}

const fileStem = (index: number, screen: string): string => {
  const slug = screen.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "screen";
  return `step-${String(index + 1).padStart(2, "0")}-${slug}`;
};

/** Write `steps.json` and, per step, `<stem>.png` and `<stem>.tree.json`. Returns the paths written. */
export function writeArtifact(dir: string, attempt: Attempt, io: ArtifactIo): string[] {
  io.reset(dir);
  const written: string[] = [];
  const put = (name: string, data: string | Uint8Array): void => {
    const path = `${dir}/${name}`;
    io.write(path, data);
    written.push(path);
  };
  const manifest = attempt.steps.map((step, index) => ({
    step: index + 1,
    origin: step.origin,
    screen: step.screen,
    millis: step.millis,
    ...(step.typed === undefined ? {} : { typed: step.typed }),
    screenshot: `${fileStem(index, step.screen)}.png`,
    tree: `${fileStem(index, step.screen)}.tree.json`,
  }));
  attempt.steps.forEach((step, index) => {
    put(`${fileStem(index, step.screen)}.png`, step.screenshot);
    put(`${fileStem(index, step.screen)}.tree.json`, `${JSON.stringify(step.tree, null, 2)}\n`);
  });
  put("steps.json", `${JSON.stringify(manifest, null, 2)}\n`);
  return written;
}
