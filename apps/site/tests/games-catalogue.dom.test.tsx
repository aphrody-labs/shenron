// SPDX-License-Identifier: Apache-2.0
import "./dom-preload";
import { expect, test } from "bun:test";
import { act } from "react";
import type { Game } from "../src/lib/db-universe";
import fr from "../messages/games-catalogue/fr.json";
import en from "../messages/games-catalogue/en.json";
import ja from "../messages/games-catalogue/ja.json";

// React DOM must load after the DOM globals exist: its event system probes `window` once at
// module evaluation, and static CommonJS imports are evaluated before this file's preload.
const { createRoot } = await import("react-dom/client");
const { renderToStaticMarkup } = await import("react-dom/server");
const { GamesExplorer } = await import("../src/components/wiki/GamesExplorer");

const games: Game[] = Array.from({ length: 49 }, (_, index) => ({
  id: index + 1,
  slug: `game-${index + 1}`,
  title: index === 0 ? "Épopée" : `Game ${String(index + 1).padStart(2, "0")}`,
  title_ja: null,
  platforms: index === 0 ? "PC" : "XSX",
  release_date: index + 1,
  developer: "Studio",
  publisher: "Bandai",
  description: null,
  cover: null,
  official_url: null,
  media: [],
}));

function button(container: HTMLElement, label: string) {
  const found = [...container.querySelectorAll("button")].find(
    (entry) => entry.textContent?.trim() === label,
  );
  expect(found).toBeDefined();
  return found!;
}

async function withImageState(complete: boolean, check: () => Promise<void>) {
  const prototype = window.HTMLImageElement.prototype;
  const values = {
    complete,
    currentSrc: "https://dragonballfr.com/covers/missing-game.webp",
    naturalWidth: 0,
  };
  const originals = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries(values)) {
    originals.set(key, Object.getOwnPropertyDescriptor(prototype, key));
    Object.defineProperty(prototype, key, { configurable: true, get: () => value });
  }
  try {
    await check();
  } finally {
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(prototype, key, descriptor);
      else Reflect.deleteProperty(prototype, key);
    }
  }
}

async function mounted(
  url: string,
  check: (container: HTMLDivElement) => Promise<void>,
  props: { games: Game[]; heroImage?: string } = { games },
) {
  const globals = globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previous = globals.IS_REACT_ACT_ENVIRONMENT;
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  window.history.replaceState(null, "", url);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<GamesExplorer {...props} ratings={{}} />));
    await check(container);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    window.history.replaceState(null, "", "/");
    globals.IS_REACT_ACT_ENVIRONMENT = previous;
  }
}

test("SSR keeps the first page bounded and exposes truthful accessible navigation", () => {
  const html = renderToStaticMarkup(<GamesExplorer games={games} ratings={{}} />);
  expect(html.match(/<article\b/g)).toHaveLength(24);
  expect(html).toContain('href="/wiki/games/game-49"');
  expect(html).not.toContain('href="/wiki/games/game-25"');
  expect(html).toContain('href="/games"');
  expect(html).toContain('<output aria-live="polite" aria-atomic="true">49 jeux sur 49</output>');
  expect(html).toContain('aria-pressed="true"');
  expect(html).toContain('for="game-search"');
  expect(html).toContain(fr.noCover);
  expect(html).toContain(fr.noRating);
  expect(html).not.toContain("Univers Dérivé");
});

test("the catalogue hero uses documented game covers as its featured artwork", () => {
  const game = { ...games[0]!, cover: "./assets/ext/db_games/1.png" };
  const html = renderToStaticMarkup(<GamesExplorer games={[game]} ratings={{}} />);
  expect(html).toContain('aria-hidden="true"');
  expect(html.match(/<img\b/g)).toHaveLength(2);
  expect(html).toContain("db_games%2F1.png");
});

test("catalogue translations cover every non-empty interface message", () => {
  const keys = Object.keys(fr).toSorted();
  for (const dictionary of [fr, en, ja]) {
    expect(Object.keys(dictionary).toSorted()).toEqual(keys);
    expect(Object.values(dictionary).every((value) => value.trim().length > 0)).toBe(true);
  }
});

test("search combines with platform state, announces results, and resets empty matches", async () => {
  await mounted("/wiki/games?ref=retained", async (container) => {
    const input = container.querySelector<HTMLInputElement>("#game-search")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!.call(
        input,
        "epopee",
      );
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(container.querySelectorAll("article")).toHaveLength(1);
    expect(container.querySelector("article")!.textContent).toContain("Épopée");
    expect(new URLSearchParams(window.location.search).get("q")).toBe("epopee");
    expect(container.querySelector('output[aria-live="polite"]')!.textContent).toBe("1 jeu sur 49");
    await act(async () => button(container, fr.xbox).click());
    expect(button(container, fr.xbox).getAttribute("aria-pressed")).toBe("true");
    expect(button(container, fr.all).getAttribute("aria-pressed")).toBe("false");
    expect(container.querySelectorAll("article")).toHaveLength(0);
    expect(container.textContent).toContain(fr.emptyTitle);
    await act(async () => button(container, fr.showAll).click());
    expect(input.value).toBe("");
    expect(button(container, fr.all).getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelectorAll("article")).toHaveLength(24);
    const params = new URLSearchParams(window.location.search);
    expect(params.has("q")).toBe(false);
    expect(params.has("platform")).toBe(false);
    expect(params.get("ref")).toBe("retained");
  });
});

test("failed cover and hero images fall back while Xbox Series X|S remains one complete badge", async () => {
  await withImageState(false, async () =>
    mounted(
      "/wiki/games",
      async (container) => {
        const article = container.querySelector("article")!;
        expect(article.querySelectorAll('ul[aria-label="Plateforme"] li')).toHaveLength(1);
        expect(article.querySelector('ul[aria-label="Plateforme"] li')!.textContent).toBe(
          "Xbox Series X|S",
        );
        expect(container.querySelector("output")!.textContent).toBe("1 jeu sur 1");
        const cover = article.querySelector("img")!;
        expect(cover).not.toBeNull();
        await act(async () => cover.dispatchEvent(new Event("error")));
        expect(article.querySelector("img")).toBeNull();
        expect(article.textContent).toContain(fr.noCover);
        expect(article.querySelector("a")!.getAttribute("href")).toBe("/wiki/games/game-1");
        const hero = container.querySelector("header img")!;
        expect(hero).not.toBeNull();
        await act(async () => hero.dispatchEvent(new Event("error")));
        expect(container.querySelector("header img")).toBeNull();
        expect(container.querySelector("h1")!.textContent).toBe(fr.title);
        expect(container.querySelector('a[href="#games-catalogue"]')).not.toBeNull();
      },
      {
        games: [{ ...games[0]!, cover: "/covers/missing-game.webp", platforms: "Xbox Series X|S" }],
        heroImage: "/covers/missing-hero.webp",
      },
    ),
  );
  // A failed request can finish before React attaches its error handler.
  await withImageState(true, async () =>
    mounted(
      "/wiki/games",
      async (container) => {
        const article = container.querySelector("article")!;
        expect(article.querySelector("img")).toBeNull();
        expect(article.textContent).toContain(fr.noCover);
        expect(article.querySelector("a")!.getAttribute("href")).toBe("/wiki/games/game-1");
      },
      { games: [{ ...games[0]!, cover: "/covers/missing-game.webp" }] },
    ),
  );
});

test("retries canonical CDN catalogue covers on their legacy mirror before showing the fallback icon", async () => {
  // Legacy catalogue artwork now starts at its canonical CDN owner.
  const cover = "./assets/wiki/games/budokai-tenkaichi-3.webp";
  await withImageState(false, async () =>
    mounted(
      "/wiki/games",
      async (container) => {
        const article = container.querySelector("article")!;
        const image = article.querySelector("img")!;
        expect(new URL(image.src).hostname).toBe("cdn.dragonballfr.com");
        await act(async () => image.dispatchEvent(new Event("error")));
        expect(new URL(article.querySelector("img")!.src).hostname).toBe("bot.dragonballfr.com");
        await act(async () => article.querySelector("img")!.dispatchEvent(new Event("error")));
        expect(article.querySelector("img")).toBeNull();
        expect(article.querySelector("svg")).not.toBeNull();
        expect(article.textContent).toContain(fr.noCover);
      },
      { games: [{ ...games[0]!, cover }] },
    ),
  );
});

test("runtime wiki uploads load from the site origin, which already falls back to the CDN", async () => {
  // Since 4fca0525 uploads (`/assets/wiki/<kind>/<uuid>`) are served by the site origin:
  // the bot host answered 404 for every one of them, so no bot/CDN swap is attempted.
  const cover = "./assets/wiki/games/00000000-0000-4000-8000-000000000001.webp";
  await withImageState(false, async () =>
    mounted(
      "/wiki/games",
      async (container) => {
        const article = container.querySelector("article")!;
        const image = article.querySelector("img")!;
        expect(new URL(image.src).hostname).toBe("dragonballfr.com");
        await act(async () => image.dispatchEvent(new Event("error")));
        expect(article.querySelector("img")).toBeNull();
        expect(article.querySelector("svg")).not.toBeNull();
        expect(article.textContent).toContain(fr.noCover);
      },
      { games: [{ ...games[0]!, cover }] },
    ),
  );
});

test("pagination renders 24 cards, writes URL state and focuses the results heading", async () => {
  await mounted("/wiki/games", async (container) => {
    expect(button(container, fr.previous).disabled).toBe(true);
    await act(async () => button(container, fr.next).click());
    expect(new URLSearchParams(window.location.search).get("page")).toBe("2");
    expect(container.querySelectorAll("article")).toHaveLength(24);
    expect(container.querySelector("article a")!.getAttribute("href")).toBe("/wiki/games/game-25");
    expect(document.activeElement).toBe(container.querySelector("h2"));
    await act(async () => button(container, fr.next).click());
    expect(container.querySelectorAll("article")).toHaveLength(1);
    expect(container.querySelector("article a")!.getAttribute("href")).toBe("/wiki/games/game-1");
    expect(button(container, fr.next).disabled).toBe(true);
    await act(async () => button(container, fr.previous).click());
    expect(container.querySelectorAll("article")).toHaveLength(24);
  });
});

test("shared URLs restore filters and page, then popstate restores a different catalogue state", async () => {
  await mounted("/wiki/games?platform=xbox&sort=title-asc&page=2", async (container) => {
    expect(button(container, fr.xbox).getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelector<HTMLSelectElement>("#games-sort")!.value).toBe("title-asc");
    expect(container.querySelectorAll("article")).toHaveLength(24);
    expect(container.querySelector("article a")!.getAttribute("href")).toBe("/wiki/games/game-26");
    await act(async () => {
      window.history.replaceState(null, "", "/wiki/games?q=epopee&platform=pc&sort=date-asc");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(container.querySelector<HTMLInputElement>("#game-search")!.value).toBe("epopee");
    expect(button(container, fr.pc).getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelector<HTMLSelectElement>("#games-sort")!.value).toBe("date-asc");
    expect(container.querySelectorAll("article")).toHaveLength(1);
    expect(container.querySelector("article a")!.getAttribute("href")).toBe("/wiki/games/game-1");
  });
});
