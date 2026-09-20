/**
 * #1105: the judge's prompt must not print a formChanges entry whose `after` is only NVDA's unresolved
 * document-title placeholder as though it were an announcement -- the same treatment #1616 gave a failed
 * re-read (`after: null`). Reading `"unknown"` as "no status was announced" is exactly the false negative
 * this row opened on: the page HAD announced something, the retry just had not resolved it yet.
 *
 * Same seam as `state-change-after-null.test.ts` -- driven through the real exported `judge()` over the
 * Anthropic transport, with a loopback server standing in for the provider.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

const bodies: string[] = [];
let call = 0;
const sseEvent = (type: string, data: unknown): string => `event: ${type}\ndata: ${JSON.stringify({ type, ...(data as object) })}\n\n`;
const server = createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    bodies.push(body);
    call++;
    const text = JSON.stringify(call % 2 === 1 ? { issues: [] } : { taskCompletable: true, summary: "Summary.", findings: [], confidence: 0.7 });
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.write(sseEvent("message_start", { message: { id: "msg_test", type: "message", role: "assistant", content: [], model: "claude-test", stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 0 } } }));
    res.write(sseEvent("content_block_start", { index: 0, content_block: { type: "text", text: "", citations: null } }));
    res.write(sseEvent("content_block_delta", { index: 0, delta: { type: "text_delta", text } }));
    res.write(sseEvent("content_block_stop", { index: 0 }));
    res.write(sseEvent("message_delta", { delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 1 } }));
    res.write(sseEvent("message_stop", {}));
    res.end();
  });
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
process.env.JUDGE_BACKEND = "anthropic";
process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
process.env.ANTHROPIC_API_KEY = "unused-loopback-key";
const { judge } = await import("./judge.js");
test.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

/** Every text the judge sent the provider, from the recorded request bodies. */
const promptsSent = (): string[] => bodies.flatMap((b) => {
  const parsed = JSON.parse(b) as { system?: unknown; messages?: { content: unknown }[] };
  const texts = (value: unknown): string[] => typeof value === "string" ? [value]
    : Array.isArray(value) ? value.flatMap((v) => texts((v as { text?: unknown }).text ?? v)) : [];
  return [...texts(parsed.system), ...(parsed.messages ?? []).flatMap((m) => texts(m.content))];
});

test("#1105 a formChanges entry flagged afterUnresolved is not printed into the judge's prompt as an announcement", async () => {
  bodies.length = 0; call = 0;
  await judge({
    url: "https://example.com/claim", task: "submit the claim form", screenReader: "NVDA", transcript: ["heading, level 1, Claim"],
    interaction: {
      controls: [],
      stateChanges: [],
      formChanges: [
        { control: "Submit, button", after: "unknown", kind: "submit", afterUnresolved: true },
        { control: "Search, button", after: "There is a problem, enter your email", kind: "submit" },
      ],
      postSubmitFields: [],
    },
  } as Parameters<typeof judge>[0]);
  const prompts = promptsSent();
  assert.ok(prompts.length >= 2, `the population: the recall and verify prompts were recorded (got ${prompts.length})`);
  for (const prompt of prompts) {
    assert.doesNotMatch(prompt, /"Submit, button" -> "unknown"/, "the unresolved pair reached the prompt as an announcement");
  }
  // The control: the resolved pair still reaches every prompt.
  assert.ok(
    prompts.every((p) => p.includes('"Search, button" -> "There is a problem, enter your email"')),
    "the resolved pair no longer reaches the prompt",
  );
});
