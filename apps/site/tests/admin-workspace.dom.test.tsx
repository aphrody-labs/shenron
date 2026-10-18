import { afterEach, expect, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { AdminWorkspaceFrame } from "../src/components/admin/AdminWorkspace";
import messages from "../messages/fr.json";
let root: Root | null = null;
let container: HTMLDivElement | null = null;
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  container?.remove();
  root = null;
  container = null;
});
const frame = (href: string) => (
  <NextIntlClientProvider locale="fr" messages={messages}>
    <AdminWorkspaceFrame href={href}>
      <label>
        Current filter
        <input data-test-filter defaultValue="Beerus" />
      </label>
      <button type="button">Save existing form</button>
    </AdminWorkspaceFrame>
  </NextIntlClientProvider>
);
async function mount(href: string) {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(frame(href)));
}
test.skipIf(typeof document === "undefined")(
  "workspace tabs retain query filters and existing forms",
  async () => {
    await mount("/admin/db-universe/episodes?series=DBS_BEERUS");
    const field = container!.querySelector<HTMLInputElement>("[data-test-filter]")!;
    field.value = "Goku";
    await act(async () => root!.render(frame("/admin/wiki?tab=drafts")));
    expect(container!.querySelector<HTMLInputElement>("[data-test-filter]")!.value).toBe("Goku");
    const tabs = container!.querySelector('nav[aria-label="Espaces ouverts"]')!;
    expect([...tabs.querySelectorAll("a")].map((link) => link.getAttribute("href"))).toEqual([
      "/admin/db-universe/episodes?series=DBS_BEERUS",
      "/admin/wiki?tab=drafts",
    ]);
  },
);
test.skipIf(typeof document === "undefined")(
  "mobile explorer switches groups with the shared Select",
  async () => {
    await mount("/admin/dashboard");
    const trigger = container!.querySelector<HTMLButtonElement>(
      'button[aria-label="Explorateur"]',
    )!;
    await act(async () => trigger.click());
    const dialog = document.querySelector('[role="dialog"]')!;
    const select = dialog.querySelector<HTMLButtonElement>('[role="combobox"]')!;
    await act(async () => select.click());
    const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find((value) =>
      value.textContent?.includes("Site et publication"),
    )!;
    expect(option).not.toBeUndefined();
    await act(async () => option.click());
    expect(dialog.querySelector('a[href="/admin/posts"]')).not.toBeNull();
    await act(async () => {
      select.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }),
      );
      await Bun.sleep(0);
    });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  },
);
test.skipIf(typeof document === "undefined")(
  "command palette closes on Escape and restores keyboard focus",
  async () => {
    await mount("/admin/dashboard");
    const trigger = [...container!.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Rechercher une commande"),
    )!;
    await act(async () => {
      trigger.focus();
      trigger.click();
    });
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog).not.toBeNull();
    const input = dialog.querySelector("input")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
        input,
        "databooks",
      );
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(
      dialog.querySelector('nav[aria-label="Outils disponibles"] a[href*="databooks"]'),
    ).not.toBeNull();
    expect(
      [...dialog.querySelectorAll('nav[aria-label="Outils disponibles"] a')].every((link) =>
        link.textContent?.toLowerCase().includes("databook"),
      ),
    ).toBe(true);
    await act(async () => {
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }),
      );
      await Bun.sleep(0);
    });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(container!.querySelector<HTMLInputElement>("[data-test-filter]")!.value).toBe("Beerus");
  },
);
