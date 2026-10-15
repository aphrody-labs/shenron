// SPDX-License-Identifier: Apache-2.0
import { afterEach, expect, mock, test } from "bun:test";
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import fr from "../messages/fr.json";

mock.module("@/components/T", () => ({ useT: () => (key: string) => key }));
mock.module("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) =>
    createElement("a", { href }, children),
}));
mock.module("@aphrody/shenron-ui/reader", () => ({
  MangaReader: () => createElement("div", { "data-reader": true }),
  useKoharuCanvasWarmup: () => false,
}));
const { MangaPreviewNotice } = await import("../src/components/manga/MangaPreviewNotice");
const { MangaReader } = await import("../src/components/manga/MangaReader");
const { MangaVolumeGrid } = await import("../src/components/manga/MangaVolumeGrid");
const { VolumeChaptersList } = await import("../src/components/manga/VolumeChaptersList");
let root: Root | undefined;
let container: HTMLDivElement | undefined;
const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const previousActEnvironment = environment.IS_REACT_ACT_ENVIRONMENT;
const domWindow = () => window as typeof window & { happyDOM?: { setURL(url: string): void } };
let previousAddress = "";
async function render(children: ReactNode, locale = "fr") {
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  if (!container) {
    previousAddress = window.location.href;
    domWindow().happyDOM?.setURL("http://localhost:3000/wiki/manga");
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  }
  await act(async () =>
    root!.render(
      <NextIntlClientProvider locale={locale} messages={fr} timeZone="UTC">
        {children}
      </NextIntlClientProvider>,
    ),
  );
}
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
  localStorage.removeItem("dbfr_read_chapters");
  if (previousAddress) domWindow().happyDOM?.setURL(previousAddress);
  environment.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
});
const domTest = test.skipIf(typeof document === "undefined");
domTest("preview scope and official source are explicit in all three locales", async () => {
  for (const [locale, label] of [
    ["fr", "Extrait officiel — 32 pages (tome incomplet)"],
    ["en", "Official preview — 32 pages (incomplete volume)"],
    ["ja", "公式試し読み — 32ページ（巻の一部）"],
  ]) {
    await render(
      <MangaPreviewNotice
        extent={{ kind: "preview", sourceUrl: "https://www.shueisha.co.jp/books/" }}
        count={32}
      />,
      locale,
    );
    expect(container!.querySelector("[data-reader-preview]")?.textContent).toBe(label);
    expect(container!.querySelector("a")?.href).toBe("https://www.shueisha.co.jp/books/");
  }
});
domTest("legacy, unknown and full extents do not claim to be previews", async () => {
  for (const extent of [undefined, null, { kind: "unknown" } as const, { kind: "full" } as const]) {
    await render(<MangaPreviewNotice extent={extent} count={32} />);
    expect(container!.querySelector("aside")).toBeNull();
  }
  await render(
    <MangaPreviewNotice
      extent={{ kind: "preview", sourceUrl: "javascript:alert(1)" }}
      count={32}
    />,
  );
  expect(container!.querySelector("[data-reader-preview]")).not.toBeNull();
  expect(container!.querySelector("a")).toBeNull();
});
domTest("reading a preview does not complete a chapter in local progress", async () => {
  await render(
    <MangaReader
      chapterId={620}
      pages={["https://cdn.example/page.jpg"]}
      title="Yamcha"
      readerExtent={{ kind: "preview" }}
    />,
  );
  expect(container!.querySelector("[data-reader]")).not.toBeNull();
  expect(container!.querySelector("[data-reader-preview]")?.textContent).toContain("1 pages");
  expect(localStorage.getItem("dbfr_read_chapters")).toBeNull();
  await render(
    <MangaReader
      chapterId={621}
      pages={["https://cdn.example/page.jpg"]}
      title="Full"
      readerExtent={{ kind: "full" }}
    />,
  );
  expect(JSON.parse(localStorage.getItem("dbfr_read_chapters")!)).toContain(621);
  expect(container!.querySelector("[data-reader-preview]")).toBeNull();
});
domTest("volume cards show the actual 32-page extent rather than three warmed pages", async () => {
  await render(
    <MangaVolumeGrid
      dbVolumes={[]}
      dbsVolumes={[]}
      otherVolumes={[{ id: 620, series: "YAMCHA", volumeNumber: 1, title: "Yamcha", cover: null }]}
      readableChapters={[
        {
          id: 620,
          series: "YAMCHA",
          chapter_number: 1,
          title: "Yamcha",
          cover: null,
          volume_id: 620,
          pages: ["a", "b", "c"],
          pageCount: 32,
          reader_extent: { kind: "preview" },
        },
      ]}
    />,
  );
  expect(container!.querySelector('a[href="/wiki/manga/volume/620"]')).not.toBeNull();
  expect(container!.querySelector("[data-reader-preview]")?.textContent).toContain(
    "32 pages (tome incomplet)",
  );
});

domTest("an old saved preview ID cannot show a completed volume in the contents", async () => {
  await render(null);
  localStorage.setItem("dbfr_read_chapters", "[620]");
  await render(
    <VolumeChaptersList
      chapters={[
        {
          id: 620,
          chapter_number: 1,
          title: "Yamcha",
          series: "YAMCHA",
          cover: null,
          pages: Array.from({ length: 32 }, (_, index) => `https://cdn.example/${index}.jpg`),
          reader_extent: { kind: "preview" },
        },
      ]}
    />,
  );
  expect(container!.querySelector("[data-reader-preview]")?.textContent).toContain("32 pages");
  expect(container!.querySelector('[role="progressbar"]')).toBeNull();
  expect(container!.textContent).not.toContain(" Lu");
});
