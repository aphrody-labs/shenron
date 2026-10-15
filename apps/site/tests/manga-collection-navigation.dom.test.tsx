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
const { MangaVolumeGrid } = await import("../src/components/manga/MangaVolumeGrid");
let root: Root | undefined;
let container: HTMLDivElement | undefined;
let previousAddress = "";
const domWindow = () => window as typeof window & { happyDOM?: { setURL(url: string): void } };
const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const previousActEnvironment = environment.IS_REACT_ACT_ENVIRONMENT;

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
  if (previousAddress) {
    if (domWindow().happyDOM) domWindow().happyDOM!.setURL(previousAddress);
    else window.history.replaceState(null, "", previousAddress);
  }
  environment.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
});

test.skipIf(typeof document === "undefined")(
  "visible series buttons preserve search, availability and view while resetting pagination",
  async () => {
    environment.IS_REACT_ACT_ENVIRONMENT = true;
    previousAddress = window.location.href;
    // The DOM preload starts at about:blank, whose opaque origin cannot hold history entries.
    domWindow().happyDOM?.setURL("http://localhost:3000/wiki/manga");
    window.history.replaceState(
      null,
      "",
      "/wiki/manga?q=Goku&state=available&view=chapters&page=2#catalogue",
    );
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () =>
      root!.render(
        <NextIntlClientProvider locale="fr" messages={fr} timeZone="UTC">
          <MangaVolumeGrid
            dbVolumes={[{ id: 1, series: "DB", volumeNumber: 1, title: "Goku", cover: null }]}
            dbsVolumes={[{ id: 2, series: "DBS", volumeNumber: 1, title: "Goku", cover: null }]}
            soshuhenVolumes={[
              { id: 4, series: "SOSH", volumeNumber: 2, title: "Digest 2", cover: null },
              { id: 3, series: "DB_SOSH", volumeNumber: 1, title: "Digest 1", cover: null },
            ]}
            readableChapters={[
              { id: 10, series: "DB", chapter_number: 1, title: "Goku", cover: null, volume_id: 1 },
              {
                id: 20,
                series: "DBS",
                chapter_number: 1,
                title: "Goku",
                cover: null,
                volume_id: 2,
              },
              {
                id: 30,
                series: "DBFC",
                chapter_number: 1,
                title: "Goku",
                cover: null,
                volume_id: 1,
              },
              {
                id: 40,
                series: "DB_SOSH",
                chapter_number: 1,
                title: "Digest",
                cover: null,
                volume_id: 3,
              },
            ]}
            colorVolumeIds={[1]}
          />
        </NextIntlClientProvider>,
      ),
    );
    const button = (series: string) =>
      container!.querySelector<HTMLButtonElement>(`button[data-collection="${series}"]`)!;
    for (const series of ["all", "DB", "DBS", "color"]) {
      expect(button(series)).not.toBeNull();
      expect(button(series).closest("[hidden]")).toBeNull();
    }
    await act(async () => button("DBS").click());
    expect(button("DBS").getAttribute("aria-pressed")).toBe("true");
    const params = new URLSearchParams(window.location.search);
    expect(params.get("collection")).toBe("DBS");
    expect(params.get("q")).toBe("Goku");
    expect(params.get("state")).toBe("available");
    expect(params.get("view")).toBe("chapters");
    expect(params.has("page")).toBe(false);
    expect(window.location.hash).toBe("#catalogue");
    expect(container.querySelector('a[href="/wiki/manga/20"]')).not.toBeNull();
    expect(container.querySelector('a[href="/wiki/manga/10"]')).toBeNull();

    await act(async () => button("color").click());
    expect(button("color").getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelector('a[href="/wiki/manga/30"]')).not.toBeNull();
    expect(container.querySelector('a[href="/wiki/manga/20"]')).toBeNull();

    await act(async () => {
      window.history.replaceState(null, "", "/wiki/manga?collection=DBS&view=chapters");
      window.dispatchEvent(new Event("popstate"));
    });
    expect(button("DBS").getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelector('a[href="/wiki/manga/20"]')).not.toBeNull();

    await act(async () => {
      window.history.replaceState(null, "", "/wiki/manga?collection=DB_SOSH&view=chapters");
      window.dispatchEvent(new Event("popstate"));
    });
    expect(button("SOSH").getAttribute("aria-pressed")).toBe("true");
    expect(button("SOSH").textContent).toContain("2");
    expect(button("DB_SOSH")).toBeNull();
    expect(container.querySelector('a[href="/wiki/manga/40"]')).not.toBeNull();
    expect(container.querySelector('a[href="/wiki/manga/20"]')).toBeNull();

    await act(async () => {
      window.history.replaceState(null, "", "/wiki/manga?collection=SOSH");
      window.dispatchEvent(new Event("popstate"));
    });
    expect(
      [...container.querySelectorAll('a[href^="/wiki/manga/volume/"]')].map((link) =>
        link.getAttribute("href"),
      ),
    ).toEqual(["/wiki/manga/volume/3", "/wiki/manga/volume/4"]);
  },
);
