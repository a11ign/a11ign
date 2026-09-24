/**
 * The rule layer's `AuthDriver`: the browser protocol through a Playwright CDP session (ADR 0038, PR 5).
 *
 * The same protocol calls the worker's own driver makes (`packages/nvda-worker/src/auth-flow.mjs`), for the same
 * reason: controls are bound by ACCESSIBLE NAME from the accessibility tree, so the flow that reaches a control for the
 * screen reader reaches it for axe, and text goes in by `Input.insertText`. Every action is a fixed protocol call or a
 * FIXED function declaration handed its arguments as data (`Runtime.callFunctionOn`'s `arguments`); nothing a flow says
 * is ever spliced into script text.
 *
 * Chromium only, because the CDP session is: the rule layer launches Chromium or the system Edge (`launchBrowser` in
 * `scan/axe.ts`), and both speak it.
 *
 * **There is no purge, and that is deliberate rather than an omission.** The rule layer's browser is launched by
 * `scanWithAxe` with a fresh in-memory context and CLOSED in its `finally`, so the session it holds dies with it and
 * nothing is written to a profile on disk. The worker's browser is the opposite (its profile persists between captures),
 * which is why the worker has a purge and this does not. A driver that outlived its browser would need one.
 */
import type { Page } from "playwright";

import type { AuthDriver, AxNode } from "./interpreter.js";

type Send = (method: string, params?: object) => Promise<any>; // eslint-disable-line @typescript-eslint/no-explicit-any

interface RawAxNode {
  nodeId: unknown;
  role?: { value?: unknown };
  name?: { value?: unknown };
  parentId?: unknown;
  backendDOMNodeId?: number;
  ignored?: boolean;
}

function axNodeOf(node: RawAxNode): AxNode {
  return {
    id: String(node.nodeId),
    role: String(node.role?.value ?? ""),
    name: String(node.name?.value ?? ""),
    parentId: node.parentId === undefined ? undefined : String(node.parentId),
    backendId: node.backendDOMNodeId,
    ignored: Boolean(node.ignored),
  };
}

const CHOOSE_FUNCTION = `function (wanted) {
  const options = Array.from(this.options || []);
  const at = options.findIndex((o) => (o.label || o.text || '').replace(/\\s+/g, ' ').trim() === wanted);
  if (at < 0) return false;
  this.selectedIndex = at;
  this.dispatchEvent(new Event('input', { bubbles: true }));
  this.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}`;

/** Open a driver on a page the caller already created. The caller owns the page and the browser and closes them. */
export async function openPlaywrightDriver(page: Page): Promise<AuthDriver> {
  const session = await page.context().newCDPSession(page);
  const send: Send = (method, params) => (session as unknown as { send: Send }).send(method, params);
  await send("DOM.enable");
  const callOn = async (handle: number, functionDeclaration: string, args: unknown[] = []) => {
    const { object } = await send("DOM.resolveNode", { backendNodeId: handle });
    const { result } = await send("Runtime.callFunctionOn", {
      objectId: object.objectId, functionDeclaration, arguments: args.map((value) => ({ value })), returnByValue: true,
    });
    return result?.value;
  };
  return {
    async navigate(url) {
      try {
        await page.goto(url, { waitUntil: "load" });
        return { ok: true };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
    origin: async () => String(await page.evaluate("location.origin")),
    async axNodes() {
      const { nodes } = await send("Accessibility.getFullAXTree");
      return (nodes as RawAxNode[]).map(axNodeOf);
    },
    inputType: (handle) => callOn(handle, "function () { return this.type === undefined ? '' : String(this.type); }"),
    async fill(handle, text) {
      await send("DOM.focus", { backendNodeId: handle });
      await callOn(handle, "function () { if (typeof this.select === 'function') this.select(); }");
      await send("Input.insertText", { text });
    },
    choose: (handle, option) => callOn(handle, CHOOSE_FUNCTION, [option]),
    isChecked: (handle) => callOn(handle, "function () { return Boolean(this.checked) || this.getAttribute('aria-checked') === 'true'; }"),
    click: async (handle) => { await callOn(handle, "function () { this.click(); }"); },
    close: async () => { await (session as unknown as { detach(): Promise<void> }).detach(); },
  };
}
