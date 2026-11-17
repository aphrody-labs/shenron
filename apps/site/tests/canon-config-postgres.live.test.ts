import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { createDb } from "@aphrody/shenron-db/postgres-js";
import { NextRequest } from "next/server";

// Explicit opt-in: this suite owns and truncates only a disposable loopback database.
const url = process.env.CANON_POSTGRES_TEST_URL;
if (url) {
  const parsed = new URL(url);
  if (
    !(
      ["127.0.0.1", "localhost"].includes(parsed.hostname) &&
      parsed.pathname === "/shenron_canon_fixture"
    )
  )
    throw new Error("A disposable loopback shenron_canon_fixture database is required");
}

describe.skipIf(!url)("canon CAS on disposable PostgreSQL", () => {
  const { db, client } = createDb({
    url: url ?? "postgres://fixture:fixture@127.0.0.1:1/shenron_canon_fixture",
    applicationName: "canon-cas-fixture",
    max: 4,
  });
  mock.module("server-only", () => ({}));
  mock.module("@/lib/db", () => ({ db }));
  mock.module("@/lib/session", () => ({ getCurrentUser: async () => null }));
  mock.module("@/lib/admin-guard", () => ({
    isAdminOrToken: async () => true,
    adminUserOrToken: async () => ({ allowed: true, me: { discordId: "fixture-editor" } }),
  }));
  mock.module("next/cache", () => ({ revalidatePath: () => {} }));
  let canon: typeof import("../src/lib/canon-config");
  let route: typeof import("../src/app/api/canon-config/route");
  const request = (body?: unknown) =>
    new NextRequest("http://localhost/api/canon-config", {
      method: body ? "PUT" : "GET",
      ...(body
        ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
        : {}),
    });
  const save = (body: unknown) => route.PUT(request(body));
  const snapshot = async () => {
    const response = await route.GET(request());
    expect(response.status).toBe(200);
    return await response.json();
  };
  const state = async () =>
    JSON.stringify({
      config: await client`select * from "CanonConfig" order by id`,
      references: await client`select * from canon_references order by id`,
      revisions: await client`select * from wiki_revisions order by id`,
    });

  beforeAll(async () => {
    expect((await client`show server_version_num`)[0]!.server_version_num.startsWith("18")).toBe(
      true,
    );
    await client.unsafe(`DROP TABLE IF EXISTS "CanonConfig", canon_references, wiki_revisions, fixture_unavailable;
      CREATE TABLE "CanonConfig" (id text PRIMARY KEY, data jsonb NOT NULL, "updatedBy" text, "updatedAt" timestamp(3) NOT NULL DEFAULT now());
      CREATE TABLE canon_references (id text PRIMARY KEY, subject text NOT NULL, keywords jsonb NOT NULL DEFAULT '[]', text text NOT NULL, text_fr text, source text NOT NULL, year integer, document text NOT NULL, lang text NOT NULL DEFAULT 'fr', provenance text NOT NULL DEFAULT 'manga', href text, hash text NOT NULL, visible boolean NOT NULL DEFAULT true, seen_at timestamp(3) NOT NULL DEFAULT now(), created_at timestamp(3) NOT NULL DEFAULT now(), updated_at timestamp(3) NOT NULL DEFAULT now());
      CREATE TABLE wiki_revisions (id text PRIMARY KEY, "tableName" text NOT NULL, "rowId" text NOT NULL, action text NOT NULL, label text, before jsonb, after jsonb, "editorId" text, "editorName" text, "createdAt" timestamp(3) NOT NULL DEFAULT now())`);
    canon = await import("../src/lib/canon-config");
    route = await import("../src/app/api/canon-config/route");
  });
  beforeEach(async () => {
    await client.unsafe(`TRUNCATE "CanonConfig", canon_references, wiki_revisions;
      ALTER TABLE canon_references ALTER COLUMN updated_at TYPE timestamp(3);
      ALTER TABLE "CanonConfig" ALTER COLUMN "updatedAt" TYPE timestamp(3);
      INSERT INTO canon_references(id, subject, text, source, document, hash, keywords, updated_at) VALUES
      ('fixture-a', 'Fixture A', 'Original A', 'Manga', 'fixture', 'a', '["fixture"]', '2026-10-15 12:00:00.123'),
      ('fixture-b', 'Fixture B', 'Original B', 'Manga', 'fixture', 'b', '["fixture"]', '2026-10-15 12:00:00.123')`);
  });
  afterAll(async () => {
    await client.end();
  });

  test("two concurrent initial writers yield exactly one success and one HTTP 409", async () => {
    const read = await snapshot();
    const responses = await Promise.all([save(read), save(read)]);
    expect(responses.map((r) => r.status).toSorted()).toEqual([200, 409]);
    expect(await client`select id from "CanonConfig"`).toHaveLength(1);
  });
  test("two concurrent existing writers yield exactly one success and one HTTP 409", async () => {
    expect((await save(await snapshot())).status).toBe(200);
    const read = await snapshot();
    read.config.references.find((r: { id: string }) => r.id === "fixture-a").textFr = "Winner";
    const responses = await Promise.all([save(read), save(read)]);
    expect(responses.map((r) => r.status).toSorted()).toEqual([200, 409]);
    expect(
      await client`select id from wiki_revisions where "tableName" = 'canon_references'`,
    ).toHaveLength(1);
    expect(
      (await snapshot()).config.references.find((r: { id: string }) => r.id === "fixture-a").textFr,
    ).toBe("Winner");
  });
  test("one stale reference rolls back doctrine, earlier references and all revisions", async () => {
    expect((await save(await snapshot())).status).toBe(200);
    const read = await snapshot();
    await client`update canon_references set updated_at = '2026-10-15 12:01:00' where id = 'fixture-b'`;
    const before = await state();
    read.config.entries = [];
    read.config.references = read.config.references.map((r: Record<string, unknown>) => ({
      ...r,
      visible: false,
    }));
    expect((await save(read)).status).toBe(409);
    expect(await state()).toBe(before);
  });
  test("a millisecond reference read survives the genuine JSON and SQL round trip", async () => {
    const read = await snapshot();
    read.config.references.find((r: { id: string }) => r.id === "fixture-a").textFr =
      "Fixture translation";
    expect((await save(read)).status).toBe(200);
    expect(
      (await snapshot()).config.references.find((r: { id: string }) => r.id === "fixture-a").textFr,
    ).toBe("Fixture translation");
  });
  test("an ingestion microsecond reference read survives the genuine JSON and SQL round trip", async () => {
    await client.unsafe(`ALTER TABLE canon_references ALTER COLUMN updated_at TYPE timestamp(6);
      UPDATE canon_references SET updated_at = '2026-10-15 12:00:00.123456' WHERE id = 'fixture-a'`);
    const read = await snapshot();
    read.config.references.find((r: { id: string }) => r.id === "fixture-a").textFr =
      "Fixture microseconds";
    expect((await save(read)).status).toBe(200);
  });
  test("an external microsecond singleton read survives the genuine JSON and SQL round trip", async () => {
    expect((await save(await snapshot())).status).toBe(200);
    await client.unsafe(`ALTER TABLE "CanonConfig" ALTER COLUMN "updatedAt" TYPE timestamp(6);
      UPDATE "CanonConfig" SET "updatedAt" = '2026-10-15 12:00:00.123456'`);
    const read = await snapshot();
    read.config.entries = [];
    expect((await save(read)).status).toBe(200);
    expect((await snapshot()).config.entries).toEqual([]);
  });
  test("an ingestion change within the same millisecond remains a conflict", async () => {
    await client.unsafe(`ALTER TABLE canon_references ALTER COLUMN updated_at TYPE timestamp(6);
      UPDATE canon_references SET updated_at = '2026-10-15 12:00:00.123456' WHERE id = 'fixture-a'`);
    const read = await snapshot();
    await client.unsafe(
      `UPDATE canon_references SET updated_at = '2026-10-15 12:00:00.123789', text_fr = 'Ingested' WHERE id = 'fixture-a'`,
    );
    const before = await state();
    read.config.references.find((r: { id: string }) => r.id === "fixture-a").textFr = "Editor";
    expect((await save(read)).status).toBe(409);
    expect(await state()).toBe(before);
  });
  test("database read failures return HTTP 503 without editable defaults", async () => {
    await client.unsafe('ALTER TABLE "CanonConfig" RENAME TO fixture_unavailable');
    try {
      await expect(canon.getCanonConfigSnapshot()).rejects.toThrow();
      const response = await route.GET(request());
      expect(response.status).toBe(503);
      expect(await response.json()).not.toHaveProperty("config");
    } finally {
      await client.unsafe('ALTER TABLE fixture_unavailable RENAME TO "CanonConfig"');
    }
  });
});
