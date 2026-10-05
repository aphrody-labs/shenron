// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "bun:test";
import { LexiconListResponse, LexiconTerm } from "../src/contract";
import { createShenronApi } from "../src/server";
import { basePorts } from "./support/ports";

const wiki = {
  categories: async () => [],
  list: async () => ({ items: [], total: 0 }),
  get: async () => null,
};
const api = createShenronApi(basePorts({ wiki }), { service: "shenron-site" });

describe("/api/public/lexicon", () => {
  test("resolves a term by id or any form, labelled in the requested language", async () => {
    for (const path of ["frieza", "Freezer", encodeURIComponent("フリーザ"), "Freeza"]) {
      const response = await api.request(`/api/public/lexicon/${path}?lang=en`);
      expect(response.status).toBe(200);
      const term = LexiconTerm.parse(await response.json());
      expect(term).toMatchObject({ id: "frieza", label: "Frieza", labelLang: "en", fr: "Freezer" });
    }
  });

  test("an English form not yet established falls back to French", async () => {
    const term = LexiconTerm.parse(
      await (
        await api.request(`/api/public/lexicon/${encodeURIComponent("ベジータ")}?lang=en`)
      ).json(),
    );
    expect(term).toMatchObject({ label: "Vegeta", labelLang: "fr", fallback: true, en: null });
  });

  test("Accept-Language chooses the label when lang is absent", async () => {
    const response = await api.request("/api/public/lexicon/frieza", {
      headers: { "accept-language": "ja-JP,ja;q=0.9,en;q=0.5" },
    });
    expect(LexiconTerm.parse(await response.json()).label).toBe("フリーザ");
  });

  test("searches every language, filtered by kind, paginated", async () => {
    const body = LexiconListResponse.parse(
      await (await api.request("/api/public/lexicon?q=frieza&lang=fr&limit=5")).json(),
    );
    expect(body.items[0]).toMatchObject({ id: "frieza", label: "Freezer", score: 100 });
    const races = LexiconListResponse.parse(
      await (await api.request("/api/public/lexicon?kind=race&limit=100")).json(),
    );
    expect(races.items.length).toBeGreaterThan(5);
    expect(races.items.every((item) => item.kind === "race")).toBe(true);
    expect(races.total).toBe(races.items.length);
  });

  test("unknown term → 404; invalid language → 400", async () => {
    expect((await api.request("/api/public/lexicon/zzzz-inconnu")).status).toBe(404);
    expect((await api.request("/api/public/lexicon?lang=de")).status).toBe(400);
  });

  test("off without another group, or with lexicon: null", () => {
    expect(
      createShenronApi(basePorts(), { service: "shenron-bot" }).handles("/api/public/lexicon"),
    ).toBe(false);
    const off = createShenronApi(basePorts({ wiki, lexicon: null }), { service: "shenron-bot" });
    expect(off.handles("/api/public/lexicon")).toBe(false);
  });
});
