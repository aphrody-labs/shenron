// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { officialEpisodeCatalogue } from "../src/lib/official-episode-catalogue";

const fallback = { title: "Le dieu de la Destruction", synopsis: "Beerus se réveille." };
const episode = {
  id: 950,
  number_in_series: 1,
  title: "Titre éditorial",
  title_ja: null,
  image: null,
  synopsis: null,
  air_date: 1791676800,
  players: [{ lang: "vostfr" as const }],
};

test("the confirmed 2026 episode remains navigable without an editorial row", () => {
  const cards = officialEpisodeCatalogue("DBS_BEERUS", [], fallback);
  expect(cards).toHaveLength(1);
  expect(cards[0]!.href).toBe("/wiki/episodes/875");
  expect(cards[0]!.playerCount).toBe(0);
  expect(officialEpisodeCatalogue("DBS", [], fallback)).toHaveLength(0);
});

test("real catalogue rows replace the fallback and retain availability", () => {
  const cards = officialEpisodeCatalogue("DBS_BEERUS", [episode], fallback);
  expect(cards).toHaveLength(1);
  expect(cards[0]!.id).toBe(950);
  expect(cards[0]!.href).toBe("/wiki/episodes/950");
  expect(cards[0]!.hasVostfr).toBe(true);
  expect(cards[0]!.hasVf).toBe(false);
});

test("adding a later confirmed row never erases episode one", () => {
  const cards = officialEpisodeCatalogue(
    "DBS_BEERUS",
    [{ ...episode, id: 951, number_in_series: 2 }],
    fallback,
  );
  expect(cards.map((card) => card.number)).toEqual([1, 2]);
});
