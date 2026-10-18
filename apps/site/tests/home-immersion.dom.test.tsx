import { afterEach, expect, mock, spyOn, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import fr from "../messages/fr.json";
import { HomeSoundCue } from "../src/components/home/HomeSoundCue";
import { KintoUnVolant } from "../src/components/home/KintoUnVolant";
let root: Root | undefined, host: HTMLDivElement | undefined;
const env = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const previousAct = env.IS_REACT_ACT_ENVIRONMENT;
const mediaQuery = typeof window !== "undefined" ? window.matchMedia : undefined;
const observer = typeof IntersectionObserver !== "undefined" ? IntersectionObserver : undefined;
let leave: (entries: { isIntersecting: boolean }[]) => void = () => {};
const cue = () => (
  <NextIntlClientProvider locale="fr" messages={fr} timeZone="UTC">
    <header>
      <HomeSoundCue />
    </header>
  </NextIntlClientProvider>
);
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
  mock.restore();
  env.IS_REACT_ACT_ENVIRONMENT = previousAct;
  if (typeof window !== "undefined" && mediaQuery) window.matchMedia = mediaQuery;
  if (observer) globalThis.IntersectionObserver = observer;
});
test("the recorded cue is silent until requested and has an explicit accessible action", () => {
  const html = renderToStaticMarkup(cue());
  expect(html).toContain('preload="none"');
  expect(html).toContain('src="/sfx/nimbus.mp3"');
  expect(html).not.toContain("autoPlay");
  expect(html).not.toContain("autoplay");
  expect(html).toContain('aria-pressed="false"');
  expect(html).toContain('aria-label="Jouer l’effet sonore de Kinto’un"');
});
async function mount() {
  env.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.IntersectionObserver = class {
    constructor(callback: typeof leave) {
      leave = callback;
    }
    observe() {}
    disconnect() {}
  } as unknown as typeof IntersectionObserver;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(cue()));
}
test.skipIf(typeof document === "undefined")(
  "only an explicit press plays the file and leaving the hero stops it",
  async () => {
    const play = mock(async function (this: HTMLMediaElement) {
      this.dispatchEvent(new Event("playing"));
    });
    const pause = mock(() => {});
    spyOn(HTMLMediaElement.prototype, "play").mockImplementation(play);
    spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(pause);
    await mount();
    expect(play).toHaveBeenCalledTimes(0);
    await act(async () => host!.querySelector("button")!.click());
    expect(play).toHaveBeenCalledTimes(1);
    expect(host!.querySelector("button")!.getAttribute("aria-pressed")).toBe("true");
    await act(async () => leave([{ isIntersecting: false }]));
    expect(pause).toHaveBeenCalledTimes(1);
  },
);
test.skipIf(typeof document === "undefined")(
  "a failed cue reports its error without a synthetic fallback",
  async () => {
    spyOn(HTMLMediaElement.prototype, "play").mockRejectedValue(new Error("unavailable"));
    spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
    await mount();
    await act(async () => host!.querySelector("button")!.click());
    expect(host!.querySelector("output")!.textContent).toBe("Effet sonore indisponible.");
    expect(host!.querySelector("button")!.getAttribute("aria-pressed")).toBe("false");
  },
);
test.skipIf(typeof document === "undefined")(
  "hiding the tab and unmounting both stop audio",
  async () => {
    const pause = spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
    const descriptor = Object.getOwnPropertyDescriptor(document, "hidden");
    await mount();
    try {
      Object.defineProperty(document, "hidden", { configurable: true, value: true });
      await act(async () => document.dispatchEvent(new Event("visibilitychange")));
      expect(pause).toHaveBeenCalledTimes(1);
      await act(async () => root!.unmount());
      root = undefined;
      expect(pause).toHaveBeenCalledTimes(2);
    } finally {
      if (descriptor) Object.defineProperty(document, "hidden", descriptor);
      else Reflect.deleteProperty(document, "hidden");
    }
  },
);
test.skipIf(typeof document === "undefined")(
  "reduced motion keeps the canonical cloud still without aura flashes",
  async () => {
    env.IS_REACT_ACT_ENVIRONMENT = true;
    window.matchMedia = () =>
      ({
        matches: true,
        addEventListener() {},
        removeEventListener() {},
      }) as unknown as MediaQueryList;
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    await act(async () =>
      root!.render(
        <NextIntlClientProvider locale="fr" messages={fr} timeZone="UTC">
          <KintoUnVolant />
        </NextIntlClientProvider>,
      ),
    );
    await act(async () => host!.querySelector("button")!.click());
    expect(host!.querySelector("[data-figure]")).toBeNull();
    expect(host!.querySelectorAll("svg")).toHaveLength(1);
  },
);
