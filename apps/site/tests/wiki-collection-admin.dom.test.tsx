// SPDX-License-Identifier: Apache-2.0
import { expect, mock, test } from "bun:test";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

let count = 26;
const requests: string[] = [];
const transport = {
  get: async (path: string) => {
    requests.push(path);
    const params = new URL(path, "https://dragonballfr.com").searchParams;
    const offset = Number(params.get("offset"));
    return {
      total: count,
      rows: offset < count ? [{ characterId: 1, techniqueId: offset + 1 }] : [],
    };
  },
};
mock.module("@/lib/admin-api", () => ({ apiAt: () => transport, api: transport }));
mock.module("next/navigation", () => ({
  useParams: () => ({ table: "db_character_techniques" }),
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
  useSearchParams: () => new URLSearchParams(),
}));
mock.module("next-intl", () => ({ useTranslations: () => (key: string) => key }));
mock.module("@/components/admin/SmartField", () => ({ SmartField: () => null }));
const { default: TablePage } = await import("../src/app/admin/database/[table]/page");

test("admin list recovers from a removed final page and represents empty results as 0–0", async () => {
  const globals = globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previous = globals.IS_REACT_ACT_ENVIRONMENT;
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const flush = () => new Promise((resolve) => setTimeout(resolve, 30));
  const next = () =>
    [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Page suivante"),
    )!;
  try {
    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <TablePage />
        </QueryClientProvider>,
      );
    });
    await act(flush);
    expect(container.textContent).toContain("1–25 / 26");
    expect(next().disabled).toBe(false);
    await act(async () => {
      next().click();
    });
    await act(flush);
    expect(container.textContent).toContain("26–26 / 26");
    count = 25;
    await act(async () => {
      await client.invalidateQueries({ queryKey: ["db", "db_character_techniques"] });
    });
    await act(flush);
    await act(flush);
    expect(container.textContent).toContain("1–25 / 25");
    expect(requests.at(-1)).toContain("offset=0");
    expect(next().disabled).toBe(true);
    count = 0;
    await act(async () => {
      await client.invalidateQueries({ queryKey: ["db", "db_character_techniques"] });
    });
    await act(flush);
    expect(container.textContent).toContain("0–0 / 0");
    expect(next().disabled).toBe(true);
  } finally {
    await act(async () => root.unmount());
    client.clear();
    container.remove();
    globals.IS_REACT_ACT_ENVIRONMENT = previous;
  }
});
