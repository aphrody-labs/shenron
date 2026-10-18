// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { createApi, indexOffers, openIndex } from "./crunchyroll-service";

const offers = [
  {
    episodeId: 875,
    series: "DBS_BEERUS",
    number: 1,
    title: "Le dieu de la Destruction",
    crunchyrollId: "GE00389313JAJP",
    url: "https://www.crunchyroll.com/fr/watch/GE00389313JAJP/x",
    langs: ["vostfr"],
    checkedAt: 5,
  },
  {
    episodeId: 876,
    series: "DBS_BEERUS",
    number: 2,
    title: "Planète de Kaïo",
    crunchyrollId: "GE00389314JAJP",
    url: "https://www.crunchyroll.com/fr/watch/GE00389314JAJP/y",
    langs: ["vostfr"],
    checkedAt: 6,
  },
];

test("index, search, resolve and the admin sync gate", async () => {
  const db = openIndex(":memory:");
  expect(indexOffers(db, offers, 10)).toBe(2);
  const api = createApi(db, { adminToken: "t", sync: async () => ({ ok: true, detail: "done" }) });
  const get = async (path: string) => api(new Request(`http://x${path}`));
  expect(((await (await get("/v1/series/DBS_BEERUS")).json()) as any).offers).toHaveLength(2);
  expect(((await (await get("/v1/search?q=kaio")).json()) as any).results[0].episodeId).toBe(876);
  expect(
    ((await (await get("/v1/resolve?series=DBS_BEERUS&number=1")).json()) as any).crunchyrollId,
  ).toBe("GE00389313JAJP");
  expect(
    ((await (await get("/v1/resolve?crunchyroll=GE00389314JAJP")).json()) as any).episodeId,
  ).toBe(876);
  expect((await get("/v1/resolve?episode=1")).status).toBe(404);
  expect((await get("/health")).status).toBe(200);
  expect((await api(new Request("http://x/v1/sync", { method: "POST" }))).status).toBe(401);
  expect(
    await (
      await api(
        new Request("http://x/v1/sync", { method: "POST", headers: { authorization: "Bearer t" } }),
      )
    ).json(),
  ).toEqual({ ok: true, detail: "done" });
});
