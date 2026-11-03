// SPDX-License-Identifier: Apache-2.0
import { expect, mock, spyOn, test } from "bun:test";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LocaleProvider } from "../src/lib/i18n/client";
mock.module("../src/components/admin/RoleSelect", () => ({
  RoleSelect: ({ placeholder }: { placeholder?: string }) => <select aria-label={placeholder} />,
  RoleBadge: ({ roleId }: { roleId: string }) => <span>{roleId}</span>,
}));
mock.module("../src/components/admin/UserSelect", () => ({
  UserSelect: ({ placeholder }: { placeholder?: string }) => <input aria-label={placeholder} />,
}));
const { ContributionRightsPanel } = await import("../src/components/admin/ContributionRightsPanel");
const domTest = test.skipIf(typeof document === "undefined");
const pause = () => new Promise((resolve) => setTimeout(resolve, 25));

domTest(
  "failed permission reads cannot save defaults; retry loads and preserves the actual rules",
  async () => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const rights = {
      wiki: { mode: "restricted", roleIds: ["123"], discordIds: ["456"] },
      databooks: { mode: "admin", roleIds: [], discordIds: [] },
    };
    let canRead = false;
    const saved: unknown[] = [];
    const network = spyOn(globalThis, "fetch").mockImplementation(
      Object.assign(
        async (_input: RequestInfo | URL, options?: RequestInit) => {
          if (options?.method === "PUT") {
            saved.push(JSON.parse(String(options.body)));
            return Response.json({ ok: true, rights });
          }
          return canRead
            ? Response.json({ ok: true, rights })
            : Response.json({ ok: false }, { status: 403 });
        },
        { preconnect: fetch.preconnect },
      ),
    );
    document.cookie = "NEXT_LOCALE=en; path=/";
    try {
      await act(async () =>
        root.render(
          <LocaleProvider>
            <QueryClientProvider client={client}>
              <ContributionRightsPanel />
            </QueryClientProvider>
          </LocaleProvider>,
        ),
      );
      await act(async () => {
        await pause();
      });
      expect(container.querySelector('[role="alert"]')?.textContent).toContain(
        "could not be loaded",
      );
      expect(container.querySelectorAll('input[type="radio"]')).toHaveLength(0);
      expect(container.textContent).not.toContain("Save permissions");
      expect(saved).toHaveLength(0);
      canRead = true;
      await act(async () => {
        container.querySelector<HTMLButtonElement>("button")!.click();
        await pause();
      });
      expect(container.querySelector<HTMLInputElement>("#mode-wiki-restricted")?.checked).toBe(
        true,
      );
      expect(container.querySelector<HTMLInputElement>("#mode-databooks-admin")?.checked).toBe(
        true,
      );
      expect(container.textContent).toContain("Selected roles or accounts");
      expect(container.textContent).toContain("Editorial team only");
      const save = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
        (button) => button.textContent === "Save permissions",
      )!;
      await act(async () => {
        save.click();
        await pause();
      });
      expect(saved).toEqual([{ rights }]);
      expect(container.querySelector("output")?.textContent).toBe("Permissions saved.");
    } finally {
      network.mockRestore();
      await act(async () => root.unmount());
      container.remove();
      client.clear();
      document.cookie = "NEXT_LOCALE=fr; path=/";
    }
  },
);
