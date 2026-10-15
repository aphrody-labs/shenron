import { afterEach, expect, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import CanonEditor from "../src/app/admin/canon/CanonEditor";
import { DEFAULT_CANON_CONFIG } from "../src/lib/canon-engine";
let root: Root | undefined;
let node: HTMLDivElement;
const originalFetch = globalThis.fetch;
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  node?.remove();
  root = undefined;
  globalThis.fetch = originalFetch;
});
async function render(expected?: string) {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  node = document.createElement("div");
  document.body.append(node);
  root = createRoot(node);
  const config = {
    ...structuredClone(DEFAULT_CANON_CONFIG),
    entries: [],
    references: [],
    heuristics: [],
  };
  await act(async () =>
    root!.render(<CanonEditor initial={config} defaults={config} initialExpected={expected} />),
  );
}
const button = (label: string) =>
  [...node.querySelectorAll("button")].find((x) => x.textContent?.trim() === label)!;
async function edit() {
  const input = node.querySelector("textarea")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(
      input,
      "A revised public promise",
    );
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
test.skipIf(typeof document === "undefined")(
  "a missing baseline never enables a write",
  async () => {
    await render();
    await edit();
    expect(button("Enregistrer").disabled).toBe(true);
  },
);
test.skipIf(typeof document === "undefined")(
  "conflict preserves the draft and requires a fresh baseline",
  async () => {
    const bodies: any[] = [];
    globalThis.fetch = Object.assign(
      async (_input: unknown, init?: RequestInit) => {
        if (init?.method === "PUT") {
          bodies.push(JSON.parse(String(init.body)));
          return Response.json({ error: "conflict" }, { status: 409 });
        }
        return Response.json({}, { status: 503 });
      },
      { preconnect: originalFetch.preconnect },
    ) as typeof fetch;
    await render("snapshot-a");
    await edit();
    expect(button("Enregistrer").disabled).toBe(false);
    await act(async () => {
      button("Enregistrer").click();
    });
    expect(bodies[0].expected).toBe("snapshot-a");
    expect(bodies[0].config.intro).toBe("A revised public promise");
    expect(node.querySelector("textarea")!.value).toBe("A revised public promise");
    expect(button("Enregistrer").disabled).toBe(true);
    await act(async () => button("Recharger la version enregistrée").click());
    expect(node.querySelector("textarea")!.value).toBe("A revised public promise");
    expect(button("Enregistrer").disabled).toBe(true);
  },
);

test.skipIf(typeof document === "undefined")(
  "a successful write adopts the new snapshot for the next edit",
  async () => {
    const tokens: string[] = [];
    globalThis.fetch = Object.assign(
      async (_input: unknown, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body));
        tokens.push(body.expected);
        return Response.json({
          ok: true,
          config: body.config,
          expected: "snapshot-" + tokens.length,
        });
      },
      { preconnect: originalFetch.preconnect },
    ) as typeof fetch;
    await render("snapshot-start");
    await edit();
    await act(async () => button("Enregistrer").click());
    expect(button("Enregistrer").disabled).toBe(true);
    await act(async () => button("Rétablir les défauts").click());
    await act(async () => button("Enregistrer").click());
    expect(tokens).toEqual(["snapshot-start", "snapshot-1"]);
  },
);
