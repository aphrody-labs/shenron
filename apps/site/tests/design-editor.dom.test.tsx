// SPDX-License-Identifier: Apache-2.0
import { afterEach, expect, mock, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { DEFAULT_SITE_THEME, THEME_COLOR_VARS, type SiteTheme } from "@/lib/site-theme";
import fr from "../messages/fr.json";

let refreshes = 0;
mock.module("next/navigation", () => ({ useRouter: () => ({ refresh: () => refreshes++ }) }));
const { default: DesignEditor, saveTheme } = await import("../src/app/admin/design/DesignEditor");
const originalFetch = globalThis.fetch;
let root: Root | undefined;
let container: HTMLDivElement | undefined;
const actEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const originalAct = actEnvironment.IS_REACT_ACT_ENVIRONMENT;
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
  globalThis.fetch = originalFetch;
  actEnvironment.IS_REACT_ACT_ENVIRONMENT = originalAct;
  refreshes = 0;
});

async function render(client: QueryClient) {
  actEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <QueryClientProvider client={client}>
        <NextIntlClientProvider locale="fr" messages={fr}>
          <DesignEditor />
        </NextIntlClientProvider>
      </QueryClientProvider>,
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

test("save verifies a fresh read and refuses an HTTP success that did not persist", async () => {
  globalThis.fetch = Object.assign(
    async (_input: unknown, init?: RequestInit) =>
      init?.method === "PUT"
        ? Response.json({ ok: true, theme: { ...DEFAULT_SITE_THEME, radius: 1 } })
        : Response.json({ theme: DEFAULT_SITE_THEME }),
    { preconnect: originalFetch.preconnect },
  ) as typeof fetch;
  await expect(saveTheme({ ...DEFAULT_SITE_THEME, radius: 1 })).rejects.toThrow(
    "save_verification_failed",
  );
});

test.skipIf(typeof document === "undefined")(
  "a failed initial read displays retry instead of an endless loader",
  async () => {
    globalThis.fetch = Object.assign(async () => Response.json({}, { status: 503 }), {
      preconnect: originalFetch.preconnect,
    }) as typeof fetch;
    await render(new QueryClient({ defaultOptions: { queries: { retry: false } } }));
    expect(container!.querySelector('[role="alert"]')?.textContent).toContain(
      fr.adminDesign.loadFailed,
    );
    expect(container!.textContent).toContain(fr.adminDesign.retry);
    expect(container!.textContent).not.toContain(fr.adminDesign.loading);
  },
);

test.skipIf(typeof document === "undefined")(
  "every control is editable, refetch preserves drafts and verified save refreshes the site",
  async () => {
    let persisted: SiteTheme = structuredClone(DEFAULT_SITE_THEME);
    globalThis.fetch = Object.assign(
      async (_input: unknown, init?: RequestInit) => {
        if (init?.method === "PUT") {
          persisted = JSON.parse(String(init.body));
          return Response.json({ ok: true, theme: persisted });
        }
        return Response.json({ theme: persisted });
      },
      { preconnect: originalFetch.preconnect },
    ) as typeof fetch;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await render(client);
    expect(container!.querySelectorAll('input[type="color"]').length).toBe(
      Object.keys(THEME_COLOR_VARS).length,
    );
    const family = container!.querySelector<HTMLSelectElement>("#theme-fontFamily")!;
    await act(async () => {
      family.value = "mono";
      family.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () => {
      client.setQueryData(["theme-config"], { theme: { ...DEFAULT_SITE_THEME, radius: 1.5 } });
    });
    expect(family.value).toBe("mono");
    expect(container!.querySelector<HTMLInputElement>("#theme-radius")!.value).toBe("0.5");
    const apply = [...container!.querySelectorAll("button")].find((button) =>
      button.textContent?.includes(fr.adminDesign.apply),
    )!;
    expect(apply.disabled).toBe(false);
    await act(async () => {
      apply.click();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(persisted.fontFamily).toBe("mono");
    expect(refreshes).toBe(1);
    expect(container!.textContent).toContain(fr.adminDesign.saved);
  },
);
