// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import fr from "../messages/fr.json";
import { VideoLecteurs } from "../src/components/episodes/VideoLecteurs";

test.skipIf(typeof document === "undefined")(
  "a browser-collapsed iframe falls back inside its selected voice",
  async () => {
    const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
    const previousEnvironment = environment.IS_REACT_ACT_ENVIRONMENT;
    environment.IS_REACT_ACT_ENVIRONMENT = true;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (_input: string | URL | Request, _init?: RequestInit) =>
      new Response(null)) as typeof fetch;
    const container = document.createElement("div");
    const root = createRoot(container);
    try {
      await act(async () =>
        root.render(
          <NextIntlClientProvider locale="fr" messages={fr} timeZone="UTC">
            <VideoLecteurs
              players={[
                {
                  name: "VF blocked",
                  provider: "first",
                  embedUrl: "https://player.example/first",
                  lang: "vf",
                },
                {
                  name: "VF fallback",
                  provider: "second",
                  embedUrl: "https://player.example/second",
                  lang: "vf",
                },
                {
                  name: "Japanese",
                  provider: "third",
                  embedUrl: "https://player.example/third",
                  lang: "vostfr",
                },
              ]}
            />
          </NextIntlClientProvider>,
        ),
      );
      // Façade : aucun iframe avant le clic.
      expect(container.querySelector("iframe")).toBeNull();
      const load = container.querySelector<HTMLButtonElement>("button[data-primary]")!;
      expect(load.textContent).toBe("Charger le lecteur 1");
      await act(async () => load.click());
      let frame = container.querySelector("iframe")!;
      expect(frame.src).toBe("https://player.example/first");
      frame.getBoundingClientRect = () => ({ width: 0, height: 0 }) as DOMRect;
      frame.parentElement!.getBoundingClientRect = () => ({ width: 640, height: 360 }) as DOMRect;
      await act(async () => frame.dispatchEvent(new Event("load")));
      frame = container.querySelector("iframe")!;
      expect(frame.src).toBe("https://player.example/second");
      frame.getBoundingClientRect = () => ({ width: 640, height: 360 }) as DOMRect;
      await act(async () => frame.dispatchEvent(new Event("load")));
      expect(container.querySelector("iframe")!.src).toBe("https://player.example/second");
      expect(container.textContent).not.toContain("indisponible");
      expect(
        container.querySelector('[aria-label="Choisir une version vidéo"] [aria-pressed="true"]')
          ?.textContent,
      ).toBe("VF");
    } finally {
      await act(async () => root.unmount());
      container.remove();
      globalThis.fetch = originalFetch;
      environment.IS_REACT_ACT_ENVIRONMENT = previousEnvironment;
    }
  },
);
