// SPDX-License-Identifier: Apache-2.0
import { afterAll, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createShenronApiClient } from "@aphrody/shenron-api/client";
import { createRecordingFetch } from "@aphrody/shenron-config/testing";
import { StatTiles } from "@aphrody/shenron-ui/public/StatTiles";
import { createFixture } from "../fixture";

const fixture = createFixture();
const client = createShenronApiClient({ baseUrl: fixture.url });
afterAll(() => fixture.close());

test("DB → Bun host → front server → validated client → shared UI", async () => {
  const categories = await client.wiki.categories();
  expect(categories.ok).toBe(true);
  if (!categories.ok) throw new Error(categories.detail);
  const character = categories.value.categories.find((row) => row.name === "characters");
  expect(character?.total).toBe(2);
  const html = renderToStaticMarkup(
    createElement(StatTiles, {
      items: [{ label: character!.label, value: character!.total, href: "/wiki/characters" }],
    }),
  );
  expect(html).toContain('href="/wiki/characters"');
  expect(html).toContain(">2</dd>");
  const list = await client.wiki.list("characters", { q: "goku", limit: 1 });
  expect(list.ok).toBe(true);
  if (!list.ok) throw new Error(list.detail);
  expect(list.value.items).toMatchObject([{ id: 1, name: "Son Goku" }]);
  const entity = await client.wiki.get("characters", "son-goku");
  expect(entity.ok && entity.value).toMatchObject({ id: 1, name: "Son Goku" });
});

test("unavailable API remains JSON and never falls through to the UI", async () => {
  const response = await fetch(`${fixture.url}/api/v1/chat`, { method: "POST" });
  expect(response.status).toBe(404);
  expect(response.headers.get("content-type")).toContain("application/json");
  expect(await response.json()).toHaveProperty("error");
});

test("config recording transport preserves API contract validation", async () => {
  const transport = createRecordingFetch({
    "GET /api/public/wiki/categories": () => Response.json({ invalid: true }),
  });
  const invalid = createShenronApiClient({ baseUrl: fixture.url, fetch: transport.fetch });
  expect(await invalid.wiki.categories()).toMatchObject({ ok: false, kind: "invalid_response" });
  expect(transport.calls).toHaveLength(1);
});
