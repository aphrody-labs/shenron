// SPDX-License-Identifier: Apache-2.0
/**
 * Conversation store contract, run against SQLite always and against PostgreSQL when
 * `SHENRON_TEST_PG_URL` names a disposable database (a temporary schema is created and dropped).
 */
import { afterAll, describe, expect, test } from "bun:test";
import {
  type Conversation,
  type ConversationStore,
  decodeCursor,
  encodeCursor,
  type Message,
  PgConversationStore,
  redactText,
  SqliteConversationReplica,
  SqliteConversationStore,
} from "../src/conversations";

const T0 = "2026-10-05T10:00:00.000Z";
const T1 = "2026-10-05T10:01:00.000Z";
const T2 = "2026-10-05T10:02:00.000Z";

function conv(id: string, over: Partial<Conversation> = {}): Conversation {
  return {
    id,
    surface: "desktop",
    title: "Goku",
    persona: "shenron",
    createdAt: T0,
    updatedAt: T0,
    deletedAt: null,
    memoryOptIn: false,
    ragOptIn: false,
    metadata: {},
    ...over,
  };
}

function msg(id: string, conversationId: string, over: Partial<Message> = {}): Message {
  return {
    id,
    conversationId,
    role: "user",
    content: "Qui est le père de Son Gohan ?",
    citations: [],
    model: null,
    createdAt: T0,
    updatedAt: T0,
    deletedAt: null,
    ...over,
  };
}

function contract(name: string, make: () => Promise<ConversationStore>) {
  describe(`${name} conversation store`, () => {
    test("push is idempotent and pull is incremental", async () => {
      const store = await make();
      const first = await store.push("user-1", {
        conversations: [conv("conv-0001")],
        messages: [
          msg("msg-0001", "conv-0001"),
          msg("msg-0002", "conv-0001", {
            role: "assistant",
            content: "Son Goku.",
            createdAt: T1,
            updatedAt: T1,
            citations: [
              {
                n: 1,
                title: "Son Goku",
                url: "https://dragonballfr.com/wiki/personnages/1",
                kind: "character",
                source: "vfs",
              },
            ],
          }),
        ],
      });
      expect(first.accepted).toEqual(["conv-0001", "msg-0001", "msg-0002"]);
      const again = await store.push("user-1", {
        conversations: [conv("conv-0001")],
        messages: [msg("msg-0001", "conv-0001")],
      });
      expect(again.accepted).toEqual([]);
      expect(again.duplicates).toEqual([
        { id: "conv-0001", canonicalId: "conv-0001" },
        { id: "msg-0001", canonicalId: "msg-0001" },
      ]);
      expect(again.cursor).toBe(first.cursor);

      const full = await store.pull("user-1", null);
      expect(full.conversations.map((c) => c.id)).toEqual(["conv-0001"]);
      expect(full.messages.map((m) => m.id)).toEqual(["msg-0001", "msg-0002"]);
      expect(full.messages[1]?.citations[0]?.title).toBe("Son Goku");
      expect(full.hasMore).toBe(false);
      expect(full.cursor).toBe(first.cursor);
      const empty = await store.pull("user-1", full.cursor);
      expect(empty.conversations.length + empty.messages.length).toBe(0);

      // Paging never skips a record.
      const page1 = await store.pull("user-1", null, 2);
      expect(page1.hasMore).toBe(true);
      const page2 = await store.pull("user-1", page1.cursor, 2);
      expect(
        [...page1.conversations, ...page1.messages, ...page2.conversations, ...page2.messages]
          .map((r) => r.id)
          .toSorted(),
      ).toEqual(["conv-0001", "msg-0001", "msg-0002"]);
    });

    test("last writer wins, stale writes come back as conflicts", async () => {
      const store = await make();
      await store.push("user-1", { conversations: [conv("conv-0002")] });
      const newer = await store.push("user-1", {
        conversations: [conv("conv-0002", { title: "Vegeta", updatedAt: T2 })],
      });
      expect(newer.accepted).toEqual(["conv-0002"]);
      const stale = await store.push("user-1", {
        conversations: [conv("conv-0002", { title: "Piccolo", updatedAt: T1 })],
      });
      expect(stale.conflicts[0]?.id).toBe("conv-0002");
      expect((stale.conflicts[0]!.server as Conversation).title).toBe("Vegeta");
      const got = await store.get("user-1", "conv-0002");
      expect(got?.conversation.title).toBe("Vegeta");
      expect(got?.conversation.createdAt).toBe(T0);
    });

    test("a re-send under another id is a duplicate of the canonical message", async () => {
      const store = await make();
      await store.push("user-1", {
        conversations: [conv("conv-0003")],
        messages: [msg("msg-0003", "conv-0003")],
      });
      const twin = await store.push("user-1", { messages: [msg("msg-twin-0003", "conv-0003")] });
      expect(twin.duplicates).toEqual([{ id: "msg-twin-0003", canonicalId: "msg-0003" }]);
      expect((await store.get("user-1", "conv-0003"))?.messages.length).toBe(1);
    });

    test("owners are isolated and invalid records rejected", async () => {
      const store = await make();
      await store.push("user-1", { conversations: [conv("conv-0004")] });
      const other = await store.push("user-2", {
        conversations: [conv("conv-0004", { updatedAt: T2 })],
        messages: [
          msg("msg-0004", "conv-0004"),
          msg("msg-0005", "conv-nope-0005"),
          { ...msg("bad", "conv-0004") },
        ],
      });
      expect(other.rejected.map((r) => r.reason)).toEqual([
        "conversation belongs to another owner",
        "conversation belongs to another owner",
        "unknown conversation",
        "invalid id",
      ]);
      expect((await store.pull("user-2", null)).conversations).toEqual([]);
      expect(await store.get("user-2", "conv-0004")).toBeNull();
    });

    test("soft delete propagates and opted-in conversations are listed for memory and RAG", async () => {
      const store = await make();
      await store.push("user-1", {
        conversations: [
          conv("conv-0006", { memoryOptIn: true, ragOptIn: true }),
          conv("conv-0007"),
        ],
        messages: [msg("msg-0006", "conv-0006")],
      });
      const memory = await store.optedIn("memory", null);
      expect(memory.items.map((i) => i.conversation.id)).toContain("conv-0006");
      expect(memory.items.map((i) => i.conversation.id)).not.toContain("conv-0007");
      expect((await store.optedIn("memory", memory.cursor)).items).toEqual([]);
      await store.push("user-1", {
        conversations: [
          conv("conv-0006", { memoryOptIn: true, ragOptIn: true, deletedAt: T2, updatedAt: T2 }),
        ],
      });
      expect((await store.list("user-1")).map((c) => c.id)).not.toContain("conv-0006");
      expect((await store.list("user-1", { includeDeleted: true })).map((c) => c.id)).toContain(
        "conv-0006",
      );
      expect((await store.optedIn("rag", null)).items.map((i) => i.conversation.id)).not.toContain(
        "conv-0006",
      );
    });
  });
}

contract("SQLite", async () => new SqliteConversationStore());

const pgUrl = process.env.SHENRON_TEST_PG_URL;
const schemas: string[] = [];
const pools: InstanceType<typeof Bun.SQL>[] = [];
describe.if(Boolean(pgUrl))("PostgreSQL", () => {
  contract("PostgreSQL", async () => {
    const sql = new Bun.SQL(pgUrl!);
    pools.push(sql);
    const schema = `chat_test_${Date.now().toString(36)}_${schemas.length}`;
    schemas.push(schema);
    const store = new PgConversationStore(sql, { schema });
    await store.ensureSchema();
    return store;
  });
});
afterAll(async () => {
  for (const [i, sql] of pools.entries()) {
    await sql.unsafe(`DROP SCHEMA IF EXISTS "${schemas[i]}" CASCADE`);
    await sql.close();
  }
});

describe("cursor and redaction", () => {
  test("cursor round-trips and rejects garbage", () => {
    expect(decodeCursor(encodeCursor(123456))).toBe(123456);
    expect(decodeCursor(null)).toBe(0);
    expect(() => decodeCursor("x1")).toThrow("invalid sync cursor");
  });

  test("secrets and personal data are redacted", () => {
    const text =
      "mail goku@capsule.corp, tel 06 12 34 56 78, <@123456789012345678> token=abc123 Bearer abcdefghijklmnopqrstuvwxyz ip 192.168.1.10 https://u:p@host/x";
    const out = redactText(text);
    for (const leaked of [
      "goku@capsule.corp",
      "06 12 34 56 78",
      "123456789012345678",
      "abc123",
      "abcdefghijklmnop",
      "192.168.1.10",
      "u:p@",
    ])
      expect(out).not.toContain(leaked);
    expect(redactText("Son Goku bat Freezer sur Namek en 762.")).toBe(
      "Son Goku bat Freezer sur Namek en 762.",
    );
  });
});

describe("SQLite replica", () => {
  test("local writes are dirty until marked clean; remote records follow last-writer-wins", async () => {
    const replica = new SqliteConversationReplica();
    expect(replica.deviceId()).toBe(replica.deviceId());
    await replica.putLocal({
      conversation: conv("conv-r001"),
      message: msg("msg-r001", "conv-r001"),
    });
    expect((await replica.dirty(10)).messages.map((m) => m.id)).toEqual(["msg-r001"]);
    await replica.markClean(["conv-r001", "msg-r001"]);
    expect((await replica.dirty(10)).conversations).toEqual([]);
    await replica.applyRemote({
      conversation: conv("conv-r001", { title: "Remote", updatedAt: T2 }),
    });
    expect((await replica.conversations())[0]?.title).toBe("Remote");
    await replica.putLocal({
      conversation: conv("conv-r001", {
        title: "Local newer",
        updatedAt: "2026-10-05T11:00:00.000Z",
      }),
    });
    await replica.applyRemote({
      conversation: conv("conv-r001", { title: "Remote older", updatedAt: T2 }),
    });
    expect((await replica.conversations())[0]?.title).toBe("Local newer");
    await replica.putLocal({ message: msg("msg-dup", "conv-r001") });
    await replica.alias("msg-dup", "msg-r001");
    expect((await replica.messages("conv-r001")).map((m) => m.id)).toEqual(["msg-r001"]);
    await replica.setCursor("c1z");
    expect(await replica.cursor()).toBe("c1z");
  });
});
