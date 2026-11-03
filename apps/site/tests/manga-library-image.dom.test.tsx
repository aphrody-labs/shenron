// SPDX-License-Identifier: Apache-2.0
import "./dom-preload";
import { expect, test } from "bun:test";
import { act } from "react";
import { NextIntlClientProvider } from "next-intl";
import { mangaLibraryImageUrl } from "../src/lib/manga-library-image";

const { createRoot } = await import("react-dom/client");
const { renderToStaticMarkup } = await import("react-dom/server");
const { MangaVolumeGrid } = await import("../src/components/manga/MangaVolumeGrid");
const { VignetteTome } = await import("../src/components/manga/VignetteTome");

const scan = "./assets/manga/DBFC/ch1/001.jpg";
const cover = "./assets/dragonballcn/dragonball_jp_kanzenban/010.webp";

function imageSource(html: string): string {
  const container = document.createElement("div");
  container.innerHTML = html;
  const source = container.querySelector("img")?.getAttribute("src");
  expect(source).toBeDefined();
  return new URL(source!, "https://dragonballfr.com").searchParams.get("url") ?? source!;
}

test("rendered chapter and volume thumbnails use the same qualified scan origin as the reader", () => {
  const chapter = renderToStaticMarkup(
    <NextIntlClientProvider locale="fr" messages={{}}>
      <MangaVolumeGrid
        initialSearch="?view=chapters"
        dbVolumes={[]}
        dbsVolumes={[]}
        readableChapters={[{ id: 1, series: "DBFC", chapter_number: 1, title: null, cover: scan }]}
      />
    </NextIntlClientProvider>,
  );
  expect(imageSource(chapter)).toBe("/assets/manga/DBFC/ch1/001.jpg");
  const volume = renderToStaticMarkup(
    <NextIntlClientProvider locale="fr" messages={{}}>
      <VignetteTome
        volume={{ id: 10, volumeNumber: 10, title: null, cover }}
        href="/wiki/manga/volume/10"
      />
    </NextIntlClientProvider>,
  );
  expect(imageSource(volume)).toBe("/assets/dragonballcn/dragonball_jp_kanzenban/010.webp");
});

test("foreign covers retain their identity and owned scan queries retain their source version", () => {
  const foreign = "https://example.org/assets/manga/cover.jpg?v=2#original";
  expect(mangaLibraryImageUrl(foreign)).toBe(foreign);
  expect(
    mangaLibraryImageUrl("https://bot.dragonballfr.com/assets/manga/DBS/ch1316/001.webp?v=2"),
  ).toBe("/assets/manga/DBS/ch1316/001.webp?v=2");
  expect(mangaLibraryImageUrl("./assets/ext/db_manga_volumes/1.png")).toBe(
    "https://cdn.dragonballfr.com/assets/ext/db_manga_volumes/1.png",
  );
});

test("hover prefetch warms the actual reader scan rather than the retired bot URL", async () => {
  const scope = globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previousAct = scope.IS_REACT_ACT_ENVIRONMENT;
  scope.IS_REACT_ACT_ENVIRONMENT = true;
  window.history.replaceState(null, "", "/wiki/manga?view=chapters");
  const OriginalImage = window.Image;
  const warmed: string[] = [];
  window.Image = class {
    set src(value: string) {
      warmed.push(value);
    }
  } as unknown as typeof Image;
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(
        <NextIntlClientProvider locale="fr" messages={{}}>
          <MangaVolumeGrid
            dbVolumes={[]}
            dbsVolumes={[]}
            readableChapters={[
              { id: 1, series: "DBFC", chapter_number: 1, title: null, cover: scan, pages: [scan] },
            ]}
          />
        </NextIntlClientProvider>,
      ),
    );
    const link = container.querySelector('a[href="/wiki/manga/1"]')!;
    expect(link).not.toBeNull();
    await act(async () => link.dispatchEvent(new MouseEvent("mouseover", { bubbles: true })));
    expect(warmed).toContain("/assets/manga/DBFC/ch1/001.jpg");
  } finally {
    await act(async () => root.unmount());
    container.remove();
    window.Image = OriginalImage;
    window.history.replaceState(null, "", "/");
    scope.IS_REACT_ACT_ENVIRONMENT = previousAct;
  }
});
