// SPDX-License-Identifier: Apache-2.0
import { afterEach, expect, spyOn, test } from "bun:test";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { SagaBestOf, matchesSeries } from "../src/components/home/SagaBestOf";
import { LocaleProvider } from "../src/lib/i18n/client";
import type { BestOfSagaView } from "../src/lib/home-bestof";
import type { MediaCatalog } from "../src/components/stream/MediaCatalogRails";

let root: Root | undefined;
let container: HTMLDivElement | undefined;
const env = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const originalAct = env.IS_REACT_ACT_ENVIRONMENT;
const originalMedia = typeof window !== "undefined" ? window.matchMedia : undefined;
const domTest = test.skipIf(typeof document === "undefined");

function saga(slug: string, seriesLabel = "Dragon Ball"): BestOfSagaView {
  return {
    slug,
    name: `Saga ${slug}`,
    seriesLabel,
    years: null,
    tagline: "Seven balls",
    description: null,
    image: "https://dragonballfr.com/test-saga.webp",
    era: "origin",
    accent: "#ff8800",
    stats: { episodes: 2, films: 1, tomes: 2 },
    watchHref: "/wiki/episodes/1",
    watchLabel: "Watch saga",
    media: [],
  };
}

async function render(children: ReactNode, locale = "fr") {
  env.IS_REACT_ACT_ENVIRONMENT = true;
  if (!container) {
    window.location.href = "https://sagas.test/";
    document.cookie = `NEXT_LOCALE=${locale}; path=/`;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  }
  await act(async () => root!.render(<LocaleProvider>{children}</LocaleProvider>));
}

function button(label: string) {
  return [...container!.querySelectorAll<HTMLButtonElement>("button")].find(
    (element) => element.textContent === label,
  )!;
}

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
  env.IS_REACT_ACT_ENVIRONMENT = originalAct;
  if (typeof window !== "undefined" && originalMedia) window.matchMedia = originalMedia;
  if (typeof document !== "undefined") document.cookie = "NEXT_LOCALE=; path=/; max-age=0";
});

test("series filters match complete canonical labels", () => {
  const cases = [
    ["Dragon Ball", "DB"],
    ["Dragon Ball Z", "DBZ"],
    ["Dragon Ball GT", "DBGT"],
    ["Dragon Ball Super", "DBS"],
    ["Dragon Ball Daima", "DB_DAIMA"],
  ];
  for (const [label, filter] of cases) {
    expect(matchesSeries(label!, filter!)).toBe(true);
    for (const [, other] of cases)
      if (other !== filter) expect(matchesSeries(label!, other!)).toBe(false);
  }
  expect(matchesSeries("Dragon Ball Z Kai", "DBZ")).toBe(false);
  expect(matchesSeries("Dragon Ball Z unofficial", "DBZ")).toBe(false);
  expect(matchesSeries("Amazing Z story", "DBZ")).toBe(false);
  expect(matchesSeries("Film Dragon Ball Super", "DBS")).toBe(true);
});

domTest("filters show only matching sagas and disable unavailable series", async () => {
  await render(<SagaBestOf sagas={[saga("pilaf"), saga("saiyan", "Dragon Ball Z")]} />);
  expect(button("Dragon Ball GT").disabled).toBe(true);
  await act(async () => button("Dragon Ball Z").click());
  expect(container!.querySelectorAll('[role="tab"]')).toHaveLength(1);
  expect(container!.querySelector('[role="tabpanel"] h3')?.textContent).toBe("Saga saiyan");
  await act(async () => button("Dragon Ball GT").click());
  expect(container!.querySelector('[role="tabpanel"] h3')?.textContent).toBe("Saga saiyan");
});

domTest("an active filter becoming empty never displays a saga outside that filter", async () => {
  await render(<SagaBestOf sagas={[saga("pilaf"), saga("saiyan", "Dragon Ball Z")]} />);
  await act(async () => button("Dragon Ball Z").click());
  await render(<SagaBestOf sagas={[saga("pilaf")]} />);
  expect(container!.querySelector('[role="tabpanel"]')).toBeNull();
  expect(container!.querySelectorAll('[role="tab"]')).toHaveLength(0);
});

domTest("selection follows the saga slug when server props reorder", async () => {
  const pilaf = saga("pilaf");
  const ribbon = saga("red-ribbon");
  await render(<SagaBestOf sagas={[pilaf, ribbon]} />);
  await act(async () => container!.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1]!.click());
  await render(<SagaBestOf sagas={[ribbon, pilaf]} />);
  expect(container!.querySelector('[role="tabpanel"] h3')?.textContent).toBe(ribbon.name);
  expect(container!.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toContain(
    ribbon.name,
  );
});

domTest("two widgets have unique IDs and each panel labels its own selected tab", async () => {
  await render(
    <>
      <SagaBestOf sagas={[saga("pilaf")]} />
      <SagaBestOf sagas={[saga("pilaf")]} />
    </>,
  );
  const ids = [...container!.querySelectorAll("[id]")].map((element) => element.id);
  expect(new Set(ids).size).toBe(ids.length);
  for (const panel of container!.querySelectorAll<HTMLElement>('[role="tabpanel"]')) {
    const tab = document.getElementById(panel.getAttribute("aria-labelledby")!);
    expect(tab?.getAttribute("aria-controls")).toBe(panel.id);
    expect(panel.tabIndex).toBe(0);
    panel.focus();
    expect(document.activeElement).toBe(panel);
  }
});

domTest("long saga labels remain fully visible rather than ellipsized", async () => {
  const long = saga("long");
  long.name = "Saga du vingt-troisième grand tournoi des arts martiaux";
  await render(<SagaBestOf sagas={[long]} />);
  const tab = container!.querySelector('[role="tab"]')!;
  expect(tab.textContent).toContain(long.name);
  expect(tab.querySelector(".truncate")).toBeNull();
});

domTest("a non-public watch destination is not emitted", async () => {
  const selected = saga("pilaf");
  selected.watchHref = "/wiki/characters/goku";
  await render(
    <SagaBestOf
      sagas={[selected]}
      access={{ openKeys: [], access: { characters: { mode: "members", roleIds: [] } } }}
    />,
  );
  expect(container!.querySelector(`a[href="${selected.watchHref}"]`) === null).toBe(true);
});

for (const vertical of [false, true]) {
  domTest(
    `keyboard navigation respects ${vertical ? "vertical" : "horizontal"} orientation`,
    async () => {
      window.matchMedia = ((query: string) => ({
        matches: vertical,
        media: query,
        onchange: null,
        addEventListener() {},
        removeEventListener() {},
        addListener() {},
        removeListener() {},
        dispatchEvent: () => true,
      })) as typeof window.matchMedia;
      await render(<SagaBestOf sagas={[saga("pilaf"), saga("ribbon")]} />);
      const tabs = container!.querySelectorAll<HTMLButtonElement>('[role="tab"]');
      const rail = container!.querySelector('[role="tablist"]')!;
      expect(rail.getAttribute("aria-orientation")).toBe(vertical ? "vertical" : "horizontal");
      const scroll = spyOn(tabs[1]!, "scrollIntoView").mockImplementation(() => {});
      try {
        tabs[0]!.focus();
        const unused = new KeyboardEvent("keydown", {
          key: vertical ? "ArrowRight" : "ArrowDown",
          bubbles: true,
          cancelable: true,
        });
        await act(async () => {
          tabs[0]!.dispatchEvent(unused);
        });
        expect(unused.defaultPrevented).toBe(false);
        expect(document.activeElement === tabs[0]).toBe(true);
        for (const modifier of ["altKey", "ctrlKey", "metaKey", "shiftKey"]) {
          const shortcut = new KeyboardEvent("keydown", {
            key: vertical ? "ArrowDown" : "ArrowRight",
            bubbles: true,
            cancelable: true,
            [modifier]: true,
          });
          await act(async () => {
            tabs[0]!.dispatchEvent(shortcut);
          });
          expect(shortcut.defaultPrevented).toBe(false);
          expect(document.activeElement === tabs[0]).toBe(true);
        }
        const forward = new KeyboardEvent("keydown", {
          key: vertical ? "ArrowDown" : "ArrowRight",
          bubbles: true,
          cancelable: true,
        });
        await act(async () => {
          tabs[0]!.dispatchEvent(forward);
        });
        expect(forward.defaultPrevented).toBe(true);
        expect(document.activeElement === tabs[1]).toBe(true);
        expect(tabs[1]!.getAttribute("aria-selected")).toBe("true");
        expect(scroll).toHaveBeenCalledWith({
          block: "nearest",
          inline: "nearest",
          behavior: "instant",
        });
      } finally {
        scroll.mockRestore();
      }
    },
  );
}

domTest("catalog rails do not repeat episode, film or volume already in saga media", async () => {
  const selected = saga("pilaf");
  selected.watchHref = "/watch";
  selected.media = [
    {
      kind: "episode",
      href: "/wiki/episodes/1",
      image: selected.image,
      label: "Episode",
      badge: "",
    },
    { kind: "film", href: "/wiki/movies/pilaf", image: selected.image, label: "Film", badge: "" },
    {
      kind: "tome",
      href: "/wiki/manga/volume/1",
      image: selected.image,
      label: "Volume",
      badge: "",
    },
  ];
  const catalog: MediaCatalog = {
    episodes: [
      {
        id: 1,
        series: "DB",
        number: 1,
        title: "Episode",
        titleJa: null,
        image: selected.image,
        airDate: null,
        players: [],
      },
      {
        id: 2,
        series: "DB",
        number: 2,
        title: "Next episode",
        titleJa: null,
        image: selected.image,
        airDate: null,
        players: [],
      },
    ],
    movies: [
      {
        id: 1,
        slug: "pilaf",
        title: "Film",
        titleJa: null,
        poster: selected.image,
        releaseDate: null,
        duration: null,
        players: [],
      },
    ],
    manga: [
      {
        id: 1,
        series: "DB",
        number: 1,
        title: "Volume",
        titleJa: null,
        cover: selected.image,
        publishedAt: null,
      },
    ],
    databooks: [],
  };
  await render(<SagaBestOf sagas={[selected]} catalog={catalog} />);
  for (const media of selected.media)
    expect(container!.querySelectorAll(`a[href="${media.href}"]`)).toHaveLength(1);
  expect(container!.querySelectorAll('a[href="/wiki/episodes/2"]')).toHaveLength(1);
});

for (const [locale, expected] of [
  ["fr", ["2 épisodes", "1 film", "2 tomes"]],
  ["en", ["2 episodes", "1 film", "2 volumes"]],
  ["ja", ["2話", "映画1本", "2巻"]],
] as const) {
  domTest(`statistics follow the ${locale} interface locale`, async () => {
    await render(<SagaBestOf sagas={[saga("pilaf")]} />, locale);
    const stats = [...container!.querySelectorAll('[role="tabpanel"] li')].map(
      (element) => element.textContent,
    );
    expect(stats).toEqual([...expected]);
  });
}
