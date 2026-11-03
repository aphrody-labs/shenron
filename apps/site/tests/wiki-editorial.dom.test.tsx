// SPDX-License-Identifier: Apache-2.0
import { expect, mock, spyOn, test } from "bun:test";
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LocaleProvider } from "../src/lib/i18n/client";
let authenticated = true;
mock.module("../src/lib/use-me", () => ({ useMe: () => ({ authenticated, username: "editor" }) }));
mock.module("../src/components/admin/ContributionRightsPanel", () => ({
  ContributionRightsPanel: () => null,
}));
const { default: ContributionQueue } = await import("../src/app/admin/wiki/contributions/page");
const { WikiAiAssistant } = await import("../src/components/admin/WikiAiAssistant");
const { MesContributions } = await import("../src/components/wiki/MesContributions");
const domTest = test.skipIf(typeof document === "undefined");

async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 25));
}
async function mount() {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  document.cookie = "NEXT_LOCALE=fr; path=/";
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return {
    container,
    async render(children: ReactNode) {
      await act(async () => {
        root.render(
          <LocaleProvider>
            <QueryClientProvider client={client}>{children}</QueryClientProvider>
          </LocaleProvider>,
        );
      });
      await act(async () => {
        await settle();
      });
    },
    async close() {
      await act(async () => root.unmount());
      container.remove();
      client.clear();
    },
  };
}
function button(container: HTMLElement, text: string) {
  const result = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find((node) =>
    node.textContent?.includes(text),
  );
  if (!result) throw new Error(`Button not found: ${text}`);
  return result;
}
async function click(element: HTMLElement) {
  await act(async () => {
    element.click();
    await settle();
  });
}
async function submit(element: HTMLFormElement) {
  await act(async () => {
    element.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await settle();
  });
}
async function fill(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  await act(async () => {
    const prototype =
      element.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    await settle();
  });
}
function intercept(
  handler: (input: RequestInfo | URL, options?: RequestInit) => Promise<Response>,
) {
  return spyOn(globalThis, "fetch").mockImplementation(
    Object.assign(handler, { preconnect: fetch.preconnect }),
  );
}
function row(id: string) {
  return {
    id,
    createdAt: "2026-11-03T10:00:00Z",
    authorName: "Membre",
    tableName: "db_planets",
    rowId: id,
    columnName: "description",
    entityLabel: `Namek ${id}`,
    entityPath: `/wiki/locations/namek-${id}`,
    valueBefore: "Published",
    valueAfter: "Correction",
    comment: null,
    sources: "Manga tome 22",
    status: "pending",
    reviewerName: null,
    reviewNote: null,
  };
}

domTest(
  "review queue distinguishes failed loads from an empty queue and paginates on the server",
  async () => {
    const view = await mount();
    const requests: string[] = [];
    let failed = true;
    const network = intercept(async (input) => {
      requests.push(String(input));
      if (failed) return Response.json({}, { status: 503 });
      return Response.json({
        rows: [row(new URL(String(input), location.href).searchParams.get("offset") ?? "0")],
        total: 21,
        counts: { pending: 21, accepted: 0 },
      });
    });
    try {
      await view.render(<ContributionQueue />);
      expect(view.container.querySelector('[role="alert"]')?.textContent).toContain("chargées");
      expect(view.container.textContent).not.toContain("file de relecture est à jour");
      failed = false;
      await click(button(view.container, "Réessayer"));
      expect(view.container.textContent).toContain("Namek 0");
      await click(button(view.container, "Suivant"));
      expect(requests.at(-1)).toContain("offset=20");
      expect(view.container.textContent).toContain("Namek 20");
      await click(button(view.container, "Acceptées"));
      expect(requests.at(-1)).toContain("offset=0");
      expect(requests.at(-1)).toContain("status=accepted");
      expect(button(view.container, "Acceptées").getAttribute("aria-pressed")).toBe("true");
    } finally {
      network.mockRestore();
      await view.close();
    }
  },
);

domTest("moderation busy and conflict feedback stay on the affected proposal", async () => {
  const view = await mount();
  let resolveDecision!: (response: Response) => void;
  const network = intercept(async (_input, options) =>
    options?.method === "POST"
      ? new Promise<Response>((resolve) => {
          resolveDecision = resolve;
        })
      : Response.json({ rows: [row("one"), row("two")], total: 2, counts: { pending: 2 } }),
  );
  try {
    await view.render(<ContributionQueue />);
    const cards = view.container.querySelectorAll<HTMLLIElement>("li");
    await fill(cards[0]!.querySelector("textarea")!, "Please recheck chapter 252");
    await click(button(cards[0]!, "Accepter et publier"));
    expect(button(cards[0]!, "Accepter et publier").disabled).toBe(true);
    expect(button(cards[1]!, "Accepter et publier").disabled).toBe(false);
    await act(async () => {
      resolveDecision(Response.json({}, { status: 409 }));
      await settle();
    });
    expect(cards[0]!.querySelector('[role="alert"]')?.textContent).toContain("changé");
    expect(cards[1]!.querySelector('[role="alert"]')).toBeNull();
    expect(cards[0]!.querySelector("textarea")?.value).toBe("Please recheck chapter 252");
  } finally {
    network.mockRestore();
    await view.close();
  }
});

domTest(
  "AI draft preserves edits made while generation runs and publishes only after explicit review",
  async () => {
    const view = await mount();
    const payloads: Record<string, unknown>[] = [];
    let resolveDraft!: (response: Response) => void;
    const sources = [
      {
        title: "Manga tome 22",
        url: "/wiki/manga",
        snippet: "Passage de référence vérifié.",
        score: 1,
        kind: "manga",
      },
    ];
    const network = intercept(async (_input, options) => {
      const body = JSON.parse(String(options?.body)) as Record<string, unknown>;
      payloads.push(body);
      if (body.action === "draft")
        return new Promise<Response>((resolve) => {
          resolveDraft = resolve;
        });
      if (body.action === "search")
        return Response.json({
          results: sources,
          markdown: "Initial sourced text",
          draftKind: "extracts",
          reviewRequired: true,
        });
      return Response.json({ ok: true });
    });
    try {
      await view.render(<WikiAiAssistant entityType="planet" entityId="1" entityName="Namek" />);
      await submit(view.container.querySelector("form")!);
      expect(view.container.querySelector("textarea")?.value).toBe("Initial sourced text");
      await click(button(view.container, "Rédiger un brouillon IA"));
      await fill(view.container.querySelector("textarea")!, "My manual revision");
      await act(async () => {
        resolveDraft(
          Response.json({
            results: sources,
            markdown: "Generated sourced draft",
            draftKind: "generated",
            reviewRequired: true,
          }),
        );
        await settle();
      });
      expect(view.container.querySelector("textarea")?.value).toBe("My manual revision");
      expect(view.container.textContent).toContain("Nouveau brouillon disponible");
      expect(payloads.map((body) => body.action)).toEqual(["search", "draft"]);
      await click(button(view.container, "Utiliser ce brouillon"));
      expect(view.container.querySelector("textarea")?.value).toBe("Generated sourced draft");
      expect(view.container.textContent).toContain("Brouillon rédigé par IA");
      await fill(
        view.container.querySelector<HTMLInputElement>('input[name="label"]')!,
        "Histoire de Namek",
      );
      await submit(view.container.querySelectorAll("form")[1]!);
      expect(payloads).toHaveLength(2);
      await click(view.container.querySelector<HTMLInputElement>('input[type="checkbox"]')!);
      await submit(view.container.querySelectorAll("form")[1]!);
      expect(payloads).toHaveLength(3);
      expect(payloads[2]).toMatchObject({
        entityType: "planet",
        entityId: "1",
        label: "Histoire de Namek",
        body: "Generated sourced draft",
      });
      expect(view.container.textContent).toContain("Section créée");
    } finally {
      network.mockRestore();
      await view.close();
    }
  },
);

domTest(
  "switching entities discards pending assistant results from the previous entry",
  async () => {
    const view = await mount();
    let resolveSearch!: (response: Response) => void;
    const network = intercept(
      async () =>
        new Promise<Response>((resolve) => {
          resolveSearch = resolve;
        }),
    );
    try {
      await view.render(<WikiAiAssistant entityType="planet" entityId="1" entityName="Namek" />);
      await submit(view.container.querySelector("form")!);
      await view.render(<WikiAiAssistant entityType="planet" entityId="2" entityName="Earth" />);
      await act(async () => {
        resolveSearch(
          Response.json({
            results: [{ title: "Old source", snippet: "Old entry", url: "/wiki/manga" }],
            markdown: "Namek draft",
          }),
        );
        await settle();
      });
      expect(view.container.querySelector<HTMLInputElement>('input[name="query"]')?.value).toBe(
        "Earth",
      );
      expect(view.container.querySelector("textarea")).toBeNull();
      expect(view.container.textContent).not.toContain("Namek draft");
    } finally {
      network.mockRestore();
      await view.close();
    }
  },
);

domTest(
  "signed out contributors get a sign-in return link and no private proposals request",
  async () => {
    authenticated = false;
    const view = await mount();
    const requests: string[] = [];
    const network = intercept(async (input) => {
      requests.push(String(input));
      return Response.json({});
    });
    try {
      await view.render(<MesContributions />);
      expect(view.container.querySelector("a")?.getAttribute("href")).toBe(
        "/signin?callbackURL=%2Fwiki%2Fcontribute%23my-contributions",
      );
      expect(requests).toEqual([]);
    } finally {
      authenticated = true;
      network.mockRestore();
      await view.close();
    }
  },
);

domTest(
  "contributors can retry a failed private list and navigate beyond the first page",
  async () => {
    const view = await mount();
    const requests: string[] = [];
    let failed = true;
    const network = intercept(async (input) => {
      requests.push(String(input));
      if (failed) return Response.json({}, { status: 503 });
      const offset = new URL(String(input), location.href).searchParams.get("offset") ?? "0";
      return Response.json({ rows: [row(offset)], total: 21 });
    });
    try {
      await view.render(<MesContributions />);
      expect(view.container.querySelector('[role="alert"]')?.textContent).toContain("conservées");
      failed = false;
      await click(button(view.container, "Réessayer"));
      expect(view.container.textContent).toContain("Namek 0");
      await click(button(view.container, "Voir la suite"));
      expect(requests.at(-1)).toContain("offset=20");
      expect(view.container.textContent).toContain("Namek 20");
      expect(view.container.textContent).toContain("Page 2");
    } finally {
      network.mockRestore();
      await view.close();
    }
  },
);
