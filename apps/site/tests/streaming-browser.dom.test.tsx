// SPDX-License-Identifier: Apache-2.0
import { afterEach, expect, spyOn, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import {
  readStreamingSearch,
  StreamingBrowser,
} from "../src/components/streaming/StreamingBrowser";
import type { StreamingGroup } from "../src/lib/streaming-catalogue";

const groups: StreamingGroup[] = [
  {
    series: "DB",
    label: "Dragon Ball",
    total: 153,
    episodes: [
      {
        id: 1,
        series: "DB",
        number: 1,
        title: "Le Grand Départ",
        titleJa: null,
        image: null,
        synopsis: null,
        year: 1986,
        languages: ["vf"],
        hasPlayback: true,
        duration: 1200,
      },
    ],
    sagas: [{ id: 1, slug: "pilaf", name: "Saga de Pilaf", image: null }],
  },
];
let root: Root | undefined;
let container: HTMLDivElement | undefined;
let fetchSpy: ReturnType<typeof spyOn<typeof globalThis, "fetch">> | undefined;
const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const previousEnvironment = environment.IS_REACT_ACT_ENVIRONMENT;
const view = () => (
  <NextIntlClientProvider locale="fr" messages={{}} timeZone="UTC">
    <StreamingBrowser groups={groups} />
  </NextIntlClientProvider>
);

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
  fetchSpy?.mockRestore();
  fetchSpy = undefined;
  if (typeof window !== "undefined") window.history.replaceState({}, "", "/wiki/episodes");
  environment.IS_REACT_ACT_ENVIRONMENT = previousEnvironment;
});

async function mount() {
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(view()));
}

async function search(value: string) {
  const input = container!.querySelector<HTMLInputElement>('input[type="search"]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

const apiRow = (id: number) => ({
  id,
  series: "DB",
  numberInSeries: id,
  title: `Episode ${id}`,
  airDate: 504921600,
  durationSec: 1200,
  versions: ["vf", "vostfr"],
  playerCount: 1,
});

test("public search projection rejects malformed rows and retains metadata without provider URLs", () => {
  const { episodes, total } = readStreamingSearch({
    total: 1,
    episodes: [{ ...apiRow(1), players: [{ embedUrl: "https://provider.invalid/private" }] }],
  });
  expect(total).toBe(1);
  expect(episodes[0]).toMatchObject({
    id: 1,
    languages: ["vf", "vostfr"],
    hasPlayback: true,
    duration: 1200,
  });
  expect(JSON.stringify(episodes)).not.toContain("provider.invalid");
  expect(() => readStreamingSearch({ total: 2, episodes: [{ title: "broken" }] })).toThrow();
  expect(() => readStreamingSearch({ total: -1, episodes: [] })).toThrow();
});

test("server catalogue exposes real titles, labelled search, series deep links and independent save actions", () => {
  const html = renderToStaticMarkup(view());
  expect(html).toContain("Le Grand Départ");
  expect(html).toContain("153 épisodes au catalogue");
  expect(html).toContain('href="/wiki/episodes/series/DB"');
  expect(html).toContain('href="/wiki/sagas/pilaf"');
  expect(html).toContain("Rechercher un épisode");
  for (const anchor of html.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/g)) {
    expect(anchor[1]).not.toContain("<button");
  }
});

test("closed saga categories keep their titles without publishing blocked links", () => {
  const html = renderToStaticMarkup(
    <NextIntlClientProvider locale="fr" messages={{}} timeZone="UTC">
      <StreamingBrowser
        groups={groups}
        access={{ openKeys: [], access: { sagas: { mode: "admin", roleIds: [] } } }}
      />
    </NextIntlClientProvider>,
  );
  expect(html).toContain("Saga de Pilaf");
  expect(html).toContain('aria-disabled="true"');
  expect(html).not.toContain('href="/wiki/sagas/pilaf"');
  expect(html).toContain('href="/wiki/episodes/1"');
});

test.skipIf(typeof document === "undefined")(
  "search requests are bounded and cancelled when filters change, with recoverable empty/error states",
  async () => {
    const calls: { url: string; signal: AbortSignal }[] = [];
    let firstResolve: ((response: Response) => void) | undefined;
    fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
      Object.assign(
        (input: Parameters<typeof fetch>[0], init: Parameters<typeof fetch>[1]) => {
          if (!String(input).startsWith("/api/episodes?"))
            return Promise.resolve(Response.json({ authenticated: false }));
          calls.push({ url: String(input), signal: init!.signal! });
          if (calls.length === 1)
            return new Promise<Response>((resolve) => {
              firstResolve = resolve;
            });
          return Promise.resolve(Response.json({ total: 0, episodes: [] }));
        },
        { preconnect: fetch.preconnect },
      ),
    );
    await mount();
    await search("Goku");
    await act(async () => {
      await Bun.sleep(280);
    });
    expect(calls[0]!.url).toContain("q=Goku");
    expect(calls[0]!.url).toContain("limit=24");
    await search("Vegeta");
    expect(calls[0]!.signal.aborted).toBe(true);
    await act(async () => {
      firstResolve!(Response.json({ total: 1, episodes: [apiRow(999)] }));
      await Bun.sleep(280);
    });
    expect(container!.textContent).toContain("Aucun épisode trouvé");
    expect(container!.textContent).not.toContain("Episode 999");
    expect(window.location.search).toContain("q=Vegeta");
    fetchSpy.mockImplementation(
      Object.assign(() => Promise.resolve(new Response(null, { status: 503 })), {
        preconnect: fetch.preconnect,
      }),
    );
    await search("Piccolo");
    await act(async () => {
      await Bun.sleep(280);
    });
    expect(container!.querySelector('[role="alert"]')?.textContent).toContain(
      "Le catalogue ne répond pas",
    );
    const clear = [...container!.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent === "Effacer les filtres",
    )!;
    await act(async () => clear.click());
    expect(container!.textContent).toContain("Le Grand Départ");
    expect(window.location.search).toBe("");
  },
);

test.skipIf(typeof document === "undefined")(
  "series search paginates beyond the initial rail and deduplicates repeated API rows",
  async () => {
    const urls: string[] = [];
    fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
      Object.assign(
        (input: Parameters<typeof fetch>[0]) => {
          const url = String(input);
          if (!url.startsWith("/api/episodes?"))
            return Promise.resolve(Response.json({ authenticated: false }));
          urls.push(url);
          return Promise.resolve(
            Response.json({
              total: 25,
              episodes: url.includes("offset=24")
                ? [apiRow(24), apiRow(25)]
                : Array.from({ length: 24 }, (_, index) => apiRow(index + 1)),
            }),
          );
        },
        { preconnect: fetch.preconnect },
      ),
    );
    await mount();
    const select = container!.querySelector("select")!;
    await act(async () => {
      select.value = "DB";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () => {
      await Bun.sleep(280);
    });
    expect(urls[0]).toContain("series=DB");
    expect(container!.querySelectorAll("article").length).toBe(24);
    const more = [...container!.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent === "Afficher plus d’épisodes",
    )!;
    await act(async () => {
      more.click();
      await Bun.sleep(30);
    });
    expect(urls[1]).toContain("offset=24");
    expect(container!.querySelectorAll("article").length).toBe(25);
    expect(container!.textContent).toContain("Episode 25");
  },
);
