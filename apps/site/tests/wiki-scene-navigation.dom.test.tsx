// SPDX-License-Identifier: Apache-2.0
import "./dom-preload";
import { expect, spyOn, test } from "bun:test";
import { act, type ComponentProps, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { WikiEditorialPortal } from "../src/components/wiki/scene/WikiEditorialPortal";
import messages from "../messages/wiki-scene/fr.json";
import dictionary from "../messages/fr.json";

type Props = ComponentProps<typeof WikiEditorialPortal>;
const EXPECTED_DESTINATIONS = [
  "/wiki/characters",
  "/wiki/techniques",
  "/wiki/events",
  "/wiki/movies",
  "/wiki/episodes",
  "/wiki/games",
  "/wiki/races",
  "/wiki/transformations",
  "/wiki/locations",
  "/wiki/sagas",
  "/wiki/arcs",
  "/wiki/characters#dragons-personnages",
  "/wiki/items",
  "/wiki/power-levels",
  "/wiki/cards",
  "/wiki/gifs",
  "/wiki/tools",
  "/wiki/music",
  "/wiki/manga",
  "/wiki/databooks",
  "/wiki/interviews",
  "/wiki/toriyama",
  "/wiki/staff",
  "/wiki/timeline",
  "/wiki/canon",
];
const withLocale = (child: ReactNode) => (
  <NextIntlClientProvider locale="fr" messages={dictionary} timeZone="UTC">
    {child}
  </NextIntlClientProvider>
);
function serverRender(props: Props = {}) {
  const container = document.createElement("div");
  container.innerHTML = renderToStaticMarkup(withLocale(<WikiEditorialPortal {...props} />));
  return container;
}
function sectionByHeading(container: HTMLElement, title: string) {
  const heading = [...container.querySelectorAll("h2")].find(
    (node) => node.textContent?.trim() === title,
  );
  if (!heading) throw new Error(`Missing visible section: ${title}`);
  const section = heading.closest("section");
  if (!section) throw new Error(`Missing section for heading: ${title}`);
  return section;
}
const hrefs = (element: Element) =>
  [...element.querySelectorAll("a[href]")].map((link) => link.getAttribute("href"));
const directory = (container: HTMLElement) => sectionByHeading(container, messages.index);

test("server HTML exposes 25 real destinations in an open directory without an extra search form", () => {
  const container = serverRender();
  const index = directory(container);
  const links = [...index.querySelectorAll<HTMLAnchorElement>("a[href]")];
  expect(hrefs(index).toSorted()).toEqual(EXPECTED_DESTINATIONS.toSorted());
  expect(new Set(hrefs(index)).size).toBe(25);
  expect(
    [...index.querySelectorAll("nav")].map((group) => group.querySelectorAll("a[href]").length),
  ).toEqual([7, 5, 6, 7]);
  expect(links.every((link) => !link.hidden && !link.closest("details,[hidden]"))).toBe(true);
  expect(container.querySelectorAll("h1").length).toBe(1);
  expect(container.querySelectorAll('a[href="/wiki/search"]').length).toBe(1);
  expect(container.querySelectorAll("search,form").length).toBe(0);
  expect(
    container.querySelector(
      'a[href^="/admin"],a[href^="/workshop/transcription"],a[href="/studio"]',
    ) === null,
  ).toBe(true);
  expect(container.querySelector("canvas") === null).toBe(true);
});

test("collection size does not reorder equally reachable destinations", () => {
  const first = serverRender({
    counts: { characters: 100000, episodes: 1, mangaVolumes: 42, cardCatalogCards: 0 },
  });
  const second = serverRender({
    counts: { characters: 0, episodes: 100000, mangaVolumes: 1, cardCatalogCards: 500000 },
  });
  expect(hrefs(directory(first))).toEqual(hrefs(directory(second)));
});

test("publication visibility filters the directory without linking to excluded collections", () => {
  const container = serverRender({ enabledSections: ["episodes", "gifs", "arcs"] });
  expect(hrefs(directory(container)).toSorted()).toEqual(
    ["/wiki/episodes", "/wiki/gifs", "/wiki/arcs"].toSorted(),
  );
  expect(container.querySelector('a[href="/wiki/characters"],a[href="/wiki/canon"]') === null).toBe(
    true,
  );
  expect(hrefs(directory(serverRender({ enabledSections: [] })))).toEqual([]);
});

test("work publication dates and corpus remain readable outside collapsed panels", () => {
  const date = Date.UTC(2015, 5, 20);
  const container = serverRender({
    publications: [
      {
        id: "manga-release",
        title: "A published volume",
        href: "/wiki/manga/volume/42",
        date,
        image: "/wiki-scene/goku-kai.png",
      },
    ],
    corpus: { canonReferences: 12, ragChunks: 345 },
  });
  const publications = sectionByHeading(container, messages.editorialReleases);
  const publication = publications.querySelector('a[href="/wiki/manga/volume/42"]');
  expect(publication?.textContent).toContain("A published volume");
  expect(publication?.querySelector("time")?.dateTime).toBe(new Date(date).toISOString());
  expect(publications.closest("details") === null).toBe(true);
  const corpus = sectionByHeading(container, messages.corpus);
  expect([...corpus.querySelectorAll("dd")].map((entry) => entry.textContent)).toEqual([
    "12",
    "345",
  ]);
  expect(corpus.querySelector('a[href="/wiki/contribute"]') !== null).toBe(true);
  expect(corpus.closest("details") === null).toBe(true);
  expect(
    directory(container).compareDocumentPosition(publications) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).not.toBe(0);
});

test("release links obey the same publication visibility as the directory", () => {
  const date = Date.UTC(2015, 5, 20);
  const container = serverRender({
    enabledSections: ["episodes"],
    publications: [
      { id: "allowed", title: "Published episode", href: "/wiki/episodes/875", date },
      { id: "excluded", title: "Excluded collection release", href: "/wiki/characters/1", date },
      {
        id: "foreign",
        title: "Foreign release",
        href: "https://foreign.invalid/wiki/episodes/875",
        date,
      },
    ],
  });
  const releases = sectionByHeading(container, messages.editorialReleases);
  expect(hrefs(releases)).toEqual(["/wiki/episodes/875"]);
  expect(container.textContent).not.toContain("Excluded collection release");
  expect(container.textContent).not.toContain("Foreign release");
});

async function mountPortal(
  props: Props,
  reducedMotion: boolean,
  inspect: (
    container: HTMLDivElement,
    intervals: ReturnType<typeof spyOn<typeof globalThis, "setInterval">>,
  ) => Promise<void>,
) {
  const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previousAct = environment.IS_REACT_ACT_ENVIRONMENT;
  const previousQuery = window.matchMedia;
  const previousObserver = globalThis.IntersectionObserver;
  const hidden = Object.getOwnPropertyDescriptor(document, "hidden");
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  Object.defineProperty(document, "hidden", { configurable: true, value: false });
  window.matchMedia = () =>
    ({
      matches: reducedMotion,
      addEventListener() {},
      removeEventListener() {},
    }) as unknown as MediaQueryList;
  globalThis.IntersectionObserver = class {
    constructor(private callback: IntersectionObserverCallback) {}
    observe(target: Element) {
      this.callback(
        [{ target, isIntersecting: true } as IntersectionObserverEntry],
        this as unknown as IntersectionObserver,
      );
    }
    unobserve() {}
    disconnect() {}
  } as unknown as typeof IntersectionObserver;
  const intervals = spyOn(globalThis, "setInterval");
  const pause = spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(withLocale(<WikiEditorialPortal {...props} />)));
    await inspect(container, intervals);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    intervals.mockRestore();
    pause.mockRestore();
    window.matchMedia = previousQuery;
    globalThis.IntersectionObserver = previousObserver;
    if (hidden) Object.defineProperty(document, "hidden", hidden);
    else Reflect.deleteProperty(document, "hidden");
    environment.IS_REACT_ACT_ENVIRONMENT = previousAct;
  }
}

test("excluded bookmarks stay hidden, while allowed reading resumes after the directory", async () => {
  const previous = localStorage.getItem("dbfr:historique");
  localStorage.setItem(
    "dbfr:historique",
    JSON.stringify([
      {
        href: "/wiki/characters/private-entry",
        titre: "Private bookmark",
        rubrique: "character",
        vuLe: Date.now(),
      },
      { href: "/admin/wiki", titre: "Admin bookmark", rubrique: "admin", vuLe: Date.now() },
      {
        href: "/wiki/episodeship/875",
        titre: "Wrong prefix bookmark",
        rubrique: "episode",
        vuLe: Date.now(),
      },
      {
        href: "/wiki/episodes/875",
        titre: "Published episode",
        rubrique: "episode",
        vuLe: Date.now() - 1,
      },
    ]),
  );
  try {
    await mountPortal({ enabledSections: ["episodes", "gifs"] }, true, async (container) => {
      expect(container.textContent).not.toContain("Private bookmark");
      expect(container.textContent).not.toContain("Admin bookmark");
      expect(container.textContent).not.toContain("Wrong prefix bookmark");
      const history = sectionByHeading(container, messages.resumeReading);
      expect(history.querySelector('a[href="/wiki/episodes/875"]') !== null).toBe(true);
      expect(
        directory(container).compareDocumentPosition(history) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).not.toBe(0);
      const clear = [...history.querySelectorAll("button")].find(
        (button) => button.textContent?.trim() === messages.clearHistory,
      )!;
      clear.focus();
      await act(async () => clear.click());
      expect(localStorage.getItem("dbfr:historique")).toBeNull();
      expect(
        [...container.querySelectorAll("h2")].some(
          (heading) => heading.textContent?.trim() === messages.resumeReading,
        ),
      ).toBe(false);
    });
  } finally {
    if (previous === null) localStorage.removeItem("dbfr:historique");
    else localStorage.setItem("dbfr:historique", previous);
  }
});

test("shared real-frame controls retain focus when paused", async () => {
  await mountPortal({}, false, async (container, intervals) => {
    expect(intervals.mock.calls.filter((call) => call[1] === 6500).length).toBeGreaterThan(0);
    const pause = [...container.querySelectorAll<HTMLButtonElement>("header button")].find(
      (button) => button.textContent?.trim() === dictionary.accueil.hero.pauseFrames,
    )!;
    expect(Boolean(pause)).toBe(true);
    await act(async () => pause.focus());
    await act(async () => pause.click());
    expect(document.activeElement === pause).toBe(true);
    expect(pause.getAttribute("aria-pressed")).toBe("true");
    expect(pause.textContent).toBe(dictionary.accueil.hero.resumeFrames);
  });
});

test("reduced motion prevents automatic cycling while manual frame navigation remains available", async () => {
  await mountPortal({}, true, async (container, intervals) => {
    expect(intervals.mock.calls.filter((call) => call[1] === 6500)).toHaveLength(0);
    const first = container.querySelector<HTMLImageElement>('header img[data-active="true"]')?.src;
    const next = container.querySelector<HTMLButtonElement>(
      `header button[aria-label="${dictionary.gifLibrary.next}"]`,
    )!;
    expect(next !== null).toBe(true);
    await act(async () => next.focus());
    await act(async () => next.click());
    expect(document.activeElement === next).toBe(true);
    expect(
      container.querySelector<HTMLImageElement>('header img[data-active="true"]')?.src,
    ).not.toBe(first);
    expect(intervals.mock.calls.filter((call) => call[1] === 6500)).toHaveLength(0);
  });
});
