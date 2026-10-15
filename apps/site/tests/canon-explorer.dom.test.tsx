import { afterEach, expect, mock, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
let pushes: string[] = [];
mock.module("next/navigation", () => ({
  useRouter: () => ({ push: (url: string) => pushes.push(url) }),
}));
mock.module("next/image", () => ({
  default: ({ fill: _fill, sizes: _sizes, ...props }: any) => <img alt="" {...props} />,
}));
mock.module("next/link", () => ({
  default: ({ scroll: _scroll, ...props }: any) => <a {...props}>{props.children}</a>,
}));
const { CanonExplorer, CanonSourcesTrigger } = await import("../src/components/wiki/CanonExplorer");
let root: Root;
let container: HTMLDivElement;
afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  pushes = [];
});
test.skipIf(typeof document === "undefined")(
  "work selection filters examples and a card starts a contextual search",
  async () => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root.render(<CanonExplorer initialQuery="" />));
    expect(container.querySelectorAll("nav a").length).toBe(5);
    const select = container.querySelector("select")!;
    await act(async () => {
      select.value = "DAIMA";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(container.querySelectorAll("nav a").length).toBe(1);
    expect(container.querySelector("nav a")!.textContent).toContain("DAIMA");
    await act(async () => container.querySelector<HTMLAnchorElement>("nav a")!.click());
    expect(pushes).toEqual(["/wiki/canon?q=Super%20Saiyan%204%20DAIMA"]);
  },
);
test.skipIf(typeof document === "undefined")(
  "sources action opens the real disclosure",
  async () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () =>
      root.render(
        <>
          <CanonSourcesTrigger />
          <details id="canon-evidence">
            <summary>Evidence</summary>
            <p>Source</p>
          </details>
        </>,
      ),
    );
    const panel = container.querySelector("details")!;
    panel.scrollIntoView = () => {};
    expect(panel.open).toBe(false);
    await act(async () => container.querySelector("button")!.click());
    expect(panel.open).toBe(true);
  },
);
