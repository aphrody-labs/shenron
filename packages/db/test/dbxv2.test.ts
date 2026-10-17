// SPDX-License-Identifier: Apache-2.0
import { Database } from "bun:sqlite";
import { afterAll, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "bun";
import {
  decodeCms,
  decodeMsg,
  embedPending,
  ingestDbxv2,
  openDbxv2Db,
  pendingChunks,
  type AssetRow,
  type CpkRow,
} from "../src/dbxv2";

const enc = new TextEncoder();

/** Synthetic `#MSG` in the real layout: names, entry pairs, line records, UTF-16LE strings. */
function makeMsg(entries: [string, string[]][], utf8 = false): Uint8Array {
  const count = entries.length;
  const names = 0x20;
  const entryTable = names + count * 16 + count * 4;
  const lineRecords = entryTable + count * 8;
  const lineTotal = entries.reduce((n, e) => n + e[1].length, 0);
  let strings = lineRecords + lineTotal * 16;
  const buf = new Uint8Array(strings + 4096);
  const view = new DataView(buf.buffer);
  buf.set(enc.encode("#MSG"));
  view.setUint32(8, count, true);
  view.setUint32(0x0c, names, true);
  view.setUint32(0x14, entryTable, true);
  view.setUint32(0x1c, lineRecords, true);
  const put = (record: number, text: string): void => {
    if (utf8) {
      const raw = enc.encode(text);
      view.setUint32(record, strings, true);
      view.setUint32(record + 4, raw.length, true);
      view.setUint32(record + 8, raw.length + 1, true);
      buf.set(raw, strings);
      strings += raw.length + 1;
      return;
    }
    view.setUint32(record, strings, true);
    view.setUint32(record + 4, text.length, true);
    view.setUint32(record + 8, text.length * 2 + 2, true);
    for (let i = 0; i < text.length; i++) view.setUint16(strings + i * 2, text.charCodeAt(i), true);
    strings += text.length * 2 + 2;
  };
  let line = 0;
  entries.forEach(([name, lines], i) => {
    put(names + i * 16, name);
    view.setUint32(entryTable + i * 8, lines.length, true);
    view.setUint32(entryTable + i * 8 + 4, lineRecords + line * 16, true);
    for (const text of lines) put(lineRecords + line++ * 16, text);
  });
  return buf.subarray(0, strings);
}

function makeCms(names: string[]): Uint8Array {
  const buf = new Uint8Array(0x10 + names.length * 0x54);
  const view = new DataView(buf.buffer);
  buf.set(enc.encode("#CMS"));
  view.setUint32(8, names.length, true);
  view.setUint32(12, 0x10, true);
  names.forEach((n, i) => {
    view.setUint32(0x10 + i * 0x54, i, true);
    buf.set(enc.encode(n), 0x10 + i * 0x54 + 4);
  });
  return buf;
}

const root = mkdtempSync(join(tmpdir(), "dbxv2-test-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

function put(kind: string, cpk: string, path: string, bytes: Uint8Array): AssetRow {
  const file = join(root, kind, cpk, `${path}.gz`);
  mkdirSync(join(file, ".."), { recursive: true });
  writeFileSync(file, gzipSync(bytes as Uint8Array<ArrayBuffer>));
  return { cpk, path, kind, size: bytes.length, gzip: true };
}

const assets: AssetRow[] = [
  put(
    "text",
    "data",
    "data/msg/skill_name_fr.msg",
    makeMsg([
      ["SKL_001", ["Kamehameha"]],
      ["SKL_002", ["Boule Genki"]],
    ]),
  ),
  put(
    "text",
    "data",
    "data/msg/skill_name_en.msg",
    makeMsg([
      ["SKL_001", ["Kamehameha"]],
      ["SKL_002", ["Spirit Bomb"]],
    ]),
  ),
  put(
    "text",
    "data",
    "data/msg/skill_name_ja.msg",
    makeMsg([
      ["SKL_001", ["かめはめ波"]],
      ["SKL_002", ["元気玉"]],
    ]),
  ),
  put("data", "data", "data/system/char_model_spec.cms", makeCms(["GOK", "BDK"])),
  { cpk: "data", path: "data/chara/GOK/GOK.emb", kind: "textures", size: 10, gzip: true },
];
const cpk: CpkRow[] = [["data", "data/chara/GOK/GOK.emb", 4096, 10, 20, 1]];
const identify = (name: string) =>
  name.endsWith(".msg")
    ? { format: "msg", category: "text" }
    : name.endsWith(".cms")
      ? { format: "cms", category: "character" }
      : { format: "emb", category: "texture" };

describe("DBXV2 decoders", () => {
  it("decodes MSG names and lines", () => {
    const entries = decodeMsg(
      makeMsg([
        ["A_1", ["x", "y"]],
        ["A_2", ["z"]],
      ]),
    );
    expect(entries).toEqual([
      { id: 0, nameId: "A_1", lines: ["x", "y"] },
      { id: 1, nameId: "A_2", lines: ["z"] },
    ]);
  });
  it("decodes UTF-8 keys and lines (bytes == chars + 1) instead of reading them as UTF-16", () => {
    expect(
      decodeMsg(
        makeMsg(
          [
            ["lobby_text_01", ["héllo", "x"]],
            ["qs_02", ["y"]],
          ],
          true,
        ),
      ),
    ).toEqual([
      { id: 0, nameId: "lobby_text_01", lines: ["héllo", "x"] },
      { id: 1, nameId: "qs_02", lines: ["y"] },
    ]);
  });
  it("mixes UTF-8 keys with UTF-16 lines in one file", () => {
    const buf = makeMsg([["K_1", ["abcd"]]]);
    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    const rec = view.getUint32(0x0c, true);
    const at = view.getUint32(rec, true);
    buf.set(enc.encode("K_1"), at);
    view.setUint32(rec + 8, 4, true);
    expect(decodeMsg(buf)).toEqual([{ id: 0, nameId: "K_1", lines: ["abcd"] }]);
  });
  it("rejects truncated or foreign buffers", () => {
    expect(decodeMsg(new Uint8Array(8))).toEqual([]);
    const bad = makeMsg([["A", ["b"]]]);
    new DataView(bad.buffer).setUint32(0x0c, 0xffffff, true);
    expect(decodeMsg(bad)).toEqual([]);
    expect(decodeCms(enc.encode("#MSG1234567890123"))).toEqual([]);
  });
  it("decodes CMS short names", () => {
    expect(decodeCms(makeCms(["GOK", "BDK"]))).toEqual([
      { id: 0, shortName: "GOK" },
      { id: 1, shortName: "BDK" },
    ]);
  });
});

describe("DBXV2 database", () => {
  const dbFile = join(root, "dbxv2.sqlite");
  const db = new Database(dbFile, { create: true });
  const stats = ingestDbxv2(db, assets, cpk, { assetsDir: root, identify });
  db.close();

  it("indexes files, characters and localized messages", () => {
    expect(stats).toMatchObject({ files: 5, characters: 2, msgFiles: 3, msgEntries: 6 });
    const api = openDbxv2Db(dbFile);
    const emb = api.file("data", "data/chara/GOK/GOK.emb")!;
    expect(emb).toMatchObject({ offset: 4096, size: 10, extractSize: 20, compressed: true });
    expect(emb.assetPath).toBe("textures/data/data/chara/GOK/GOK.emb.gz");
    expect(api.file("data", "data/msg/skill_name_fr.msg")!.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(api.characters().map((c) => c.shortName)).toEqual(["GOK", "BDK"]);
    expect(api.messages("SKL_002").map((m) => `${m.lang}:${m.text}`)).toEqual([
      "en:Spirit Bomb",
      "fr:Boule Genki",
      "ja:元気玉",
    ]);
    expect(api.files({ format: "msg" })).toHaveLength(3);
    api.close();
  });

  it("searches lexically, filtered by language, then hybrid after embedding", async () => {
    const api = openDbxv2Db(dbFile);
    const lexical = await api.search("Genki");
    expect(lexical.mode).toBe("lexical");
    expect(lexical.hits[0]!.content).toContain("Boule Genki");
    expect(lexical.hits[0]!.corpus).toBe("dbxv2");
    const fr = await api.search("Kamehameha", { lang: "fr" });
    expect(fr.hits.every((h) => h.lang === "fr")).toBe(true);
    expect(fr.hits).toHaveLength(1);
    api.close();

    const rw = new Database(dbFile);
    expect(pendingChunks(rw)).toBeGreaterThan(0);
    const vec = (text: string): Float32Array => {
      const v = new Float32Array(384);
      v[text.includes("Genki") || text.includes("Bomb") ? 1 : 0] = 1;
      return v;
    };
    await embedPending(rw, { passages: async (t) => t.map(vec), batch: 2 });
    expect(pendingChunks(rw)).toBe(0);
    rw.close();

    const hybrid = openDbxv2Db(dbFile, { embedder: async (q) => vec(q) });
    const result = await hybrid.search("Genki");
    expect(result.mode).toBe("hybrid");
    expect(result.hits[0]!.vectorRank).not.toBeNull();
    expect(hybrid.stats().vectorsI8).toBeGreaterThan(0);
    hybrid.close();
  });
});
