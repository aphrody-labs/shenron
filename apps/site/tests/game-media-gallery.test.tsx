// SPDX-License-Identifier: Apache-2.0
import { expect, spyOn, test } from "bun:test";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { GameMediaGallery, type GalleryMedia } from "../src/components/wiki/GameMediaGallery";
import fr from "../messages/game-gallery/fr.json";
import en from "../messages/game-gallery/en.json";
import ja from "../messages/game-gallery/ja.json";
import * as capabilities from "../src/lib/use-capacites";

function render(media: GalleryMedia[], locale: "fr" | "en" | "ja" = "fr") {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={{}} timeZone="UTC">
      <GameMediaGallery media={media} title="Dragon Ball Legends" />
    </NextIntlClientProvider>,
  );
}

test("mixed game media share one preview and retain editorial thumbnail order", () => {
  const html = render([
    { type: "image", url: "https://dragonballfr.com/assets/legends.webp", caption: "Artwork" },
    { type: "youtube", url: "https://www.youtube.com/watch?v=j8s6sDHZo-U", caption: "Trailer" },
    { type: "image", url: "https://dragonballfr.com/assets/legends-2.webp", caption: "Battle" },
  ]);
  expect(html.match(/<section /g)).toHaveLength(1);
  expect(html.match(/<h2 /g)).toHaveLength(1);
  expect(html.match(/<button /g)).toHaveLength(3);
  expect(html).toContain('aria-label="Image 1 — Artwork" aria-current="true"');
  expect(html.indexOf('aria-label="Image 1')).toBeLessThan(html.indexOf('aria-label="Vidéo 2'));
  expect(html.indexOf('aria-label="Vidéo 2')).toBeLessThan(html.indexOf('aria-label="Image 3'));
  expect(html).not.toContain("<iframe");
  expect(html).not.toContain("Reprendre le défilement");
});

test("video first renders exactly one playable embed alongside mixed thumbnails", () => {
  const html = render([
    { type: "youtube", url: "https://www.youtube.com/watch?v=j8s6sDHZo-U" },
    { type: "image", url: "https://dragonballfr.com/assets/legends.webp" },
  ]);
  expect(html.match(/<iframe /g)).toHaveLength(1);
  expect(html).toContain('title="Dragon Ball Legends — vidéo"');
  expect(html).toContain('aria-label="Image 2"');
});

test("gallery type labels and fallback preview text follow all three active locales", () => {
  for (const locale of ["fr", "en", "ja"] as const) {
    const dictionary = { fr, en, ja }[locale];
    const html = render(
      [
        { type: "youtube", url: "https://www.youtube.com/watch?v=j8s6sDHZo-U" },
        { type: "image", url: "https://dragonballfr.com/assets/legends.webp" },
      ],
      locale,
    );
    expect(html).toContain(`${dictionary.heading} — Dragon Ball Legends`);
    expect(html).toContain(dictionary.video.replace("{index}", "1"));
    expect(html).toContain(dictionary.image.replace("{index}", "2"));
    expect(html).toContain(dictionary.videoTitle.replace("{title}", "Dragon Ball Legends"));
  }
});

test("empty galleries and invalid video references render no empty media section", () => {
  expect(render([])).toBe("");
  expect(render([{ type: "youtube", url: "invalid" }])).toBe("");
});

test.skipIf(typeof document === "undefined")(
  "retries missing uploaded gallery images from the CDN before showing an accessible icon",
  async () => {
    const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
    const previous = globals.IS_REACT_ACT_ENVIRONMENT;
    const settings = spyOn(capabilities, "useReglages").mockReturnValue({
      lectureAuto: false,
    } as ReturnType<typeof capabilities.useReglages>);
    globals.IS_REACT_ACT_ENVIRONMENT = true;
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () => {
        root.render(
          <NextIntlClientProvider locale="fr" messages={{}} timeZone="UTC">
            <GameMediaGallery
              title="Dragon Ball Legends"
              media={[
                {
                  type: "image",
                  url: "./assets/wiki/games-media/00000000-0000-4000-8000-000000000001.webp",
                },
              ]}
            />
          </NextIntlClientProvider>,
        );
      });
      let image = container.querySelector("img")!;
      expect(new URL(image.src).hostname).toBe("bot.dragonballfr.com");
      await act(async () => image.dispatchEvent(new Event("error")));
      image = container.querySelector("img")!;
      expect(new URL(image.src).hostname).toBe("cdn.dragonballfr.com");
      await act(async () => image.dispatchEvent(new Event("error")));
      expect(container.querySelector("img")).toBeNull();
      expect(container.querySelector(".sr-only")?.textContent).toBe(
        "Image indisponible — Dragon Ball Legends",
      );
    } finally {
      await act(async () => root.unmount());
      container.remove();
      globals.IS_REACT_ACT_ENVIRONMENT = previous;
      settings.mockRestore();
    }
  },
);

test.skipIf(typeof document === "undefined")(
  "removing an unavailable earlier thumbnail preserves the selected video iframe",
  async () => {
    const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
    const originalAct = globals.IS_REACT_ACT_ENVIRONMENT;
    const dom = window as typeof window & {
      happyDOM?: { settings: { disableIframePageLoading: boolean } };
    };
    const originalIframeLoading = dom.happyDOM?.settings.disableIframePageLoading;
    if (dom.happyDOM) dom.happyDOM.settings.disableIframePageLoading = true;
    const originalConsoleError = console.error;
    const errors = spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      if (
        args[0] instanceof Error &&
        args[0].name === "NotSupportedError" &&
        args[0].message.endsWith("Iframe page loading is disabled.")
      )
        return;
      originalConsoleError(...args);
    });
    const OriginalImage = globalThis.Image;
    const probes: HTMLImageElement[] = [];
    const settings = spyOn(capabilities, "useReglages").mockReturnValue({
      lectureAuto: false,
    } as ReturnType<typeof capabilities.useReglages>);
    globals.IS_REACT_ACT_ENVIRONMENT = true;
    globalThis.Image = function () {
      const image = new OriginalImage();
      probes.push(image);
      return image;
    } as unknown as typeof Image;
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () => {
        root.render(
          <NextIntlClientProvider locale="fr" messages={{}} timeZone="UTC">
            <GameMediaGallery
              title="Dragon Ball Legends"
              media={[
                { type: "youtube", url: "https://www.youtube.com/watch?v=j8s6sDHZo-U" },
                { type: "youtube", url: "https://www.youtube.com/watch?v=PcX-2FHS2C4" },
                { type: "image", url: "https://dragonballfr.com/assets/legends.webp" },
              ]}
            />
          </NextIntlClientProvider>,
        );
      });
      await act(async () => {
        container.querySelector<HTMLButtonElement>('button[aria-label="Vidéo 2"]')!.click();
      });
      const playing = container.querySelector("iframe");
      expect(playing?.src).toContain("PcX-2FHS2C4");
      await act(async () => {
        probes[0]!.dispatchEvent(new Event("error"));
      });
      expect(container.querySelector("iframe")).toBe(playing);
      expect(container.querySelectorAll("button")).toHaveLength(2);
      expect(
        container.querySelector('button[aria-current="true"]')?.getAttribute("aria-label"),
      ).toBe("Vidéo 1");
      expect(container.querySelector('button[aria-label="Reprendre le défilement"]')).toBeNull();
    } finally {
      await act(async () => root.unmount());
      container.remove();
      globalThis.Image = OriginalImage;
      globals.IS_REACT_ACT_ENVIRONMENT = originalAct;
      if (dom.happyDOM && originalIframeLoading !== undefined)
        dom.happyDOM.settings.disableIframePageLoading = originalIframeLoading;
      settings.mockRestore();
      errors.mockRestore();
    }
  },
);
