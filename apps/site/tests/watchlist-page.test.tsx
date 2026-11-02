// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import fr from "../messages/fr.json";
import { ContinueWatchingRail } from "../src/components/continue-watching/ContinueWatchingRail";
import { StreamingBrowser } from "../src/components/streaming/StreamingBrowser";
import { WatchlistClient } from "../src/app/watchlist/WatchlistClient";
import { preferredSelection } from "../src/lib/video-language-preference";
import {
  applyView,
  filterFromQuery,
  readWatchlistPayload,
  rowsFromLocal,
  rowsFromRemote,
} from "../src/lib/watchlist-rows";
import type { WatchlistItem } from "../src/lib/watchlist-view";

const fav = (id: string, at: number, title = `Episode ${id}`) => ({
  kind: "episode" as const,
  id,
  title,
  href: `/wiki/episodes/${id}`,
  at,
});

test("local rows derive the three statuses from device progress", () => {
  const rows = rowsFromLocal(
    [fav("1", 30), fav("2", 20), fav("3", 10)],
    [
      { kind: "episode", id: "2", seconds: 600, duration: 1200, completed: false, updatedAt: 5 },
      { kind: "episode", id: "3", seconds: 1190, duration: 1200, completed: true, updatedAt: 6 },
    ],
  );
  expect(rows.map((r) => [r.favorite.id, r.status, r.percent])).toEqual([
    ["1", "planned", 0],
    ["2", "watching", 50],
    ["3", "completed", 100],
  ]);
});

test("account rows follow the API payload and hide items removed in this session", () => {
  const item = (id: string, status: WatchlistItem["status"]): WatchlistItem => ({
    kind: "episode",
    id,
    title: `Episode ${id}`,
    href: `/wiki/episodes/${id}`,
    image: null,
    caption: null,
    status,
    seconds: status === "watching" ? 300 : 0,
    duration: status === "planned" ? null : 1200,
    percent: status === "watching" ? 25 : null,
    language: null,
    savedAt: Number(id),
    watchedAt: null,
  });
  const payload = readWatchlistPayload({
    total: 3,
    items: [item("1", "planned"), item("2", "watching"), item("3", "completed"), { bad: true }],
  });
  expect(payload).toHaveLength(3);
  const rows = rowsFromRemote(payload!, new Set(["episode:1"]));
  expect(rows.map((r) => [r.favorite.id, r.status, r.percent, r.seconds])).toEqual([
    ["2", "watching", 25, 300],
    ["3", "completed", 100, 0],
  ]);
  expect(readWatchlistPayload({ error: "x" })).toBeNull();
  expect(readWatchlistPayload(null)).toBeNull();
});

test("status query, filter and sort", () => {
  expect(filterFromQuery("watching")).toBe("watching");
  expect(filterFromQuery("nope")).toBe("all");
  expect(filterFromQuery(null)).toBe("all");
  const rows = rowsFromLocal([fav("1", 10, "Zeta"), fav("2", 20, "Alpha")], []);
  expect(applyView(rows, "all", "recent").map((r) => r.favorite.id)).toEqual(["2", "1"]);
  expect(applyView(rows, "all", "title").map((r) => r.favorite.title)).toEqual(["Alpha", "Zeta"]);
  expect(applyView(rows, "completed", "recent")).toEqual([]);
});

test("version preference is applied only when the item offers it", () => {
  expect(preferredSelection(["vf", "vostfr"], "vostfr")).toBe("vostfr");
  expect(preferredSelection(["vf"], "vostfr")).toBeNull();
  expect(preferredSelection(["vf"], null)).toBeNull();
});

test("server render: watchlist is a loading shell, rail renders nothing without progress", () => {
  const html = renderToStaticMarkup(
    <NextIntlClientProvider locale="fr" messages={fr} timeZone="UTC">
      <WatchlistClient />
      <ContinueWatchingRail />
    </NextIntlClientProvider>,
  );
  expect(html).toContain('role="status"');
  expect(html).toContain("Chargement de ta liste");
  expect(html).not.toContain("Continuer à regarder");
  expect(html).not.toMatch(/crunchyroll/i);
});

test("catalogue exposes labelled keyboard-reachable version and sort controls", () => {
  const html = renderToStaticMarkup(
    <NextIntlClientProvider locale="fr" messages={{}} timeZone="UTC">
      <StreamingBrowser groups={[]} />
    </NextIntlClientProvider>,
  );
  expect(html).toMatch(/<label[^>]*>Version<\/label>\s*<select/);
  expect(html).toMatch(/<label[^>]*>Trier par<\/label>\s*<select/);
  for (const label of ["Toutes les versions", "VF", "VOSTFR", "Plus récents", "Titre (A à Z)"])
    expect(html).toContain(label);
});
