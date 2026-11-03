// SPDX-License-Identifier: Apache-2.0
import "./dom-preload";
import { afterEach, expect, test } from "bun:test";
import type { Root } from "react-dom/client";
import type { DatabookItem } from "../src/components/databooks/DatabookGrid";

// React's input event support must be detected after the DOM has been installed.
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { LocaleProvider } = await import("../src/lib/i18n/client");
const { DatabookGrid } = await import("../src/components/databooks/DatabookGrid");

let root: Root | undefined;
let container: HTMLDivElement | undefined;
const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const previousEnvironment = environment.IS_REACT_ACT_ENVIRONMENT;
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
  window.history.replaceState({}, "", "/wiki/databooks");
  environment.IS_REACT_ACT_ENVIRONMENT = previousEnvironment;
});

test("shared databook controls search beyond the rendered page and keep availability filtering working", async () => {
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  const items: DatabookItem[] = Array.from({ length: 60 }, (_, index) => ({
    id: index + 1,
    kind: "databook",
    category: "Databook",
    title: index === 44 ? "Late Guide" : `Guide ${index + 1}`,
    titleJa: null,
    author: null,
    publishedAt: null,
    cover: null,
    pageCount: 0,
    hasDescription: index % 2 === 1,
  }));
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root!.render(
      <LocaleProvider>
        <DatabookGrid items={items} />
      </LocaleProvider>,
    ),
  );
  expect(container.querySelectorAll('a[href^="/wiki/databooks/"]')).toHaveLength(40);
  expect(container.textContent).not.toContain("Late Guide");
  const input = container.querySelector<HTMLInputElement>('input[type="search"]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
      input,
      "Late Guide",
    );
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(container.querySelectorAll('a[href^="/wiki/databooks/"]')).toHaveLength(1);
  expect(container.querySelector('a[href="/wiki/databooks/45"]')).not.toBeNull();
  const available = Array.from(container.querySelectorAll("button")).find(
    (button) => button.textContent === "Contenu présent",
  )!;
  await act(async () => available.click());
  expect(available.getAttribute("aria-pressed")).toBe("true");
  expect(container.textContent).toContain("Aucun ouvrage ne correspond à ces filtres.");
  expect(new URL(window.location.href).searchParams.get("state")).toBe("available");
});
