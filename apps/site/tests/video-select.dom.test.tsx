import { afterEach, expect, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { VideoSelect } from "../src/components/episodes/VideoSelect";
let root: Root | undefined;
let host: HTMLDivElement | undefined;
const actEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const previousActEnvironment = actEnvironment.IS_REACT_ACT_ENVIRONMENT;
const fullscreenDescriptor =
  typeof document !== "undefined"
    ? Object.getOwnPropertyDescriptor(document, "fullscreenElement")
    : undefined;
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
  actEnvironment.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
  if (typeof document !== "undefined") {
    if (fullscreenDescriptor)
      Object.defineProperty(document, "fullscreenElement", fullscreenDescriptor);
    else Reflect.deleteProperty(document, "fullscreenElement");
  }
});
function selector(onChange: (event: { target: { value: string } }) => void) {
  return (
    <VideoSelect value={6} onChange={onChange} aria-label="Cadence">
      <option value={6}>6 fps</option>
      <option value={12}>12 fps</option>
    </VideoSelect>
  );
}
test("the public selector has a named combobox and its selected value in SSR", () => {
  const html = renderToStaticMarkup(selector(() => {}));
  expect(html).toContain('role="combobox"');
  expect(html).toContain('aria-label="Cadence"');
  expect(html).toContain("6 fps");
});
test.skipIf(typeof document === "undefined")(
  "the options stay inside fullscreen and preserve selection",
  async () => {
    actEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.append(host);
    Object.defineProperty(document, "fullscreenElement", { configurable: true, value: host });
    let selected = "";
    root = createRoot(host);
    await act(async () =>
      root!.render(
        selector((event) => {
          selected = event.target.value;
        }),
      ),
    );
    const trigger = host.querySelector<HTMLButtonElement>('[role="combobox"]')!;
    await act(async () => {
      trigger.click();
      await new Promise((resolve) => setTimeout(resolve, 40));
    });
    const listbox = document.querySelector('[role="listbox"]');
    expect(listbox).not.toBeNull();
    expect(host.contains(listbox)).toBe(true);
    const options = Array.from(host.querySelectorAll<HTMLElement>('[role="option"]'));
    await act(async () => {
      options.find((item) => item.textContent?.includes("12 fps"))!.click();
      await new Promise((resolve) => setTimeout(resolve, 40));
    });
    expect(selected).toBe("12");
  },
);
