/**
 * The evidence pack: a result JSON rendered as Markdown an accessibility programme can attach to its own
 * conformance report (#4244, #4084 outcome 7).
 *
 * A pure function, so the document is testable without a capture, and so the next row (a CLI flag and an Action
 * output that write it beside the result JSON) has nothing to wire but the call.
 *
 * Three rules shape every line. It says what it is NOT (a VPAT or an ACR) in the header, because an assessor
 * pastes from it. It carries ONE row per criterion in `outcomes` and never drops or merges one. And what the run
 * did not cover is listed apart from the passes: `untested` and `cantTell` are not passes, and the WCAG 2.2
 * additions are the criteria an outsider targeting 2.2 most needs named.
 */
import { WCAG_22_AA } from "@a11ign/evidence/wcag";

/** The sentence the header must carry. A test pins it: it is the claim this document refuses to make. */
export const NOT_A_VPAT =
  "This is assistive-technology evidence for an assessor to use; it is not a VPAT or an ACR and it does not state conformance.";

/** The slice of a result JSON the pack reads. Every field optional: an older result lacks some, and absent is "not recorded". */
export interface EvidencePackInput {
  url?: string;
  screenReader?: string;
  transcript?: string[];
  outcomes?: { criterion: string; outcome: string; reason: string; assessor?: string }[];
  environment?: {
    measuredAt?: string; screenReaderVersion?: string; browser?: string; browserVersion?: string; captureProtocol?: number;
  } | null;
  earl?: { "@graph"?: Record<string, unknown>[] } | null;
}

/** A row of the announcements column holds at most this many quotes: a pointer into the transcript, not a copy of it. */
const MAX_QUOTES_PER_CRITERION = 3;

const NOT_RECORDED = "not recorded in this result";

/**
 * The roles NVDA speaks for the elements a criterion is about. A transcript line "bears on" a criterion when it
 * announces one of these. That is a pointer for the assessor to read, never a verdict: whether the announcement is
 * adequate is the assessor's to say, and the outcome column is where the tool says what it concluded.
 */
const CONTROL_ROLES = ["button", "edit", "check box", "combo box", "radio button"];
const ROLES_BEARING_ON: Record<string, readonly string[]> = {
  "1.1.1": ["graphic"],
  "1.3.1": ["heading", "landmark", "list"],
  "2.4.1": ["landmark"],
  "2.4.4": ["link"],
  "2.4.6": ["heading"],
  "3.3.2": ["edit", "check box", "combo box", "radio button"],
  "4.1.2": CONTROL_ROLES,
};

function announcesRole(line: string, role: string): boolean {
  return line.split(", ").some((token) => token === role || token.endsWith(` ${role}`));
}

function announcementsBearingOn(criterion: string, transcript: readonly string[]): string[] {
  const roles = ROLES_BEARING_ON[criterion] ?? [];
  const matching = transcript.filter((line) => roles.some((role) => announcesRole(line, role)));
  return [...new Set(matching)].slice(0, MAX_QUOTES_PER_CRITERION);
}

/** A Markdown table cell: no pipe, angle bracket or line break may end the cell or open markup. The text is otherwise verbatim. */
function cell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\s*\n\s*/g, " ");
}

function quoted(announcements: readonly string[]): string {
  return announcements.map((line) => `“${cell(line)}”`).join("<br>");
}

function decidedBy(outcome: { outcome: string; assessor?: string }, screenReader: string): string {
  if (outcome.outcome === "untested") return "none";
  return outcome.assessor ?? `${screenReader} layer`;
}

function criterionLabel(num: string): string {
  const name = WCAG_22_AA.find((c) => c.num === num)?.name;
  return name ? `${num} ${name}` : num;
}

function versionOf(input: EvidencePackInput): string {
  const assertor = input.earl?.["@graph"]?.find((node) => node["@id"] === "_:assertor");
  const version = assertor?.["dct:hasVersion"];
  return typeof version === "string" ? version : NOT_RECORDED;
}

function headerLines(input: EvidencePackInput): string[] {
  const env = input.environment ?? {};
  const reader = [input.screenReader ?? NOT_RECORDED, env.screenReaderVersion].filter(Boolean).join(" ");
  const browser = [env.browser, env.browserVersion].filter(Boolean).join(" ") || NOT_RECORDED;
  return [
    "# a11ign evidence pack", "",
    `> ${NOT_A_VPAT}`, "",
    `- **Page:** ${input.url ?? NOT_RECORDED}`,
    `- **Date measured:** ${env.measuredAt ?? NOT_RECORDED}`,
    `- **a11ign version:** ${versionOf(input)}`,
    `- **Screen reader:** ${reader}`,
    `- **Browser:** ${browser}`,
    `- **Capture protocol:** ${env.captureProtocol ?? NOT_RECORDED}`,
    "",
  ];
}

function tableLines(input: EvidencePackInput): string[] {
  const screenReader = input.screenReader ?? "screen-reader";
  const rows = (input.outcomes ?? []).map((o) => {
    const announcements = announcementsBearingOn(o.criterion, input.transcript ?? []);
    return `| ${criterionLabel(o.criterion)} | ${o.outcome} | ${decidedBy(o, screenReader)} | ${quoted(announcements)} |`;
  });
  return [
    "## Criteria", "",
    "One row per WCAG 2.2 A/AA criterion this result records. An announcement quoted in a row is a line of the NVDA transcript "
    + "about the kind of element the criterion concerns, for the assessor to read; it is not a finding.", "",
    "| Criterion | Outcome | Decided by | NVDA announcements |",
    "| --- | --- | --- | --- |",
    ...rows, "",
  ];
}

function notCoveredLines(input: EvidencePackInput): string[] {
  const outcomes = input.outcomes ?? [];
  const newIn22 = new Set(WCAG_22_AA.filter((c) => c.since === "2.2").map((c) => c.num));
  const items = (kind: string) => outcomes.filter((o) => o.outcome === kind).map((o) =>
    `- **${criterionLabel(o.criterion)}**${newIn22.has(o.criterion) ? " (new in WCAG 2.2)" : ""}: ${cell(o.reason)}`);
  return [
    "## Not covered or not determined", "",
    "None of these is a pass. The assessor must evaluate them by other means.", "",
    "### Untested: no assessor of a11ign covers the criterion", "", ...items("untested"), "",
    "### Cannot tell: examined, and not determined", "", ...items("cantTell"), "",
  ];
}

/** Render a result JSON as the Markdown evidence pack. */
export function renderEvidencePack(input: EvidencePackInput): string {
  return [...headerLines(input), ...tableLines(input), ...notCoveredLines(input)].join("\n");
}
