// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test, beforeAll } from "bun:test";
import {
  initShenronRe,
  getDragonBallCatalog,
  scanAob,
  parseCus,
  triageCpk,
  extractCpkFile,
  decompressCrilayla,
} from "./re-wasm.ts";

describe("shenron-re WASM pipeline", () => {
  beforeAll(async () => {
    await initShenronRe();
  });

  test("retrieves complete Dragon Ball Game Catalog (Steam + Android)", () => {
    const catalog = getDragonBallCatalog();
    expect(catalog.length).toBeGreaterThanOrEqual(10);

    // Steam games validation
    const dbxv2 = catalog.find((g) => g.steam_app_id === 454650);
    expect(dbxv2).toBeDefined();
    expect(dbxv2?.title).toBe("Dragon Ball Xenoverse 2");
    expect(dbxv2?.engine).toBe("carrot2");
    expect(dbxv2?.primary_formats).toContain(".cpk");
    expect(dbxv2?.canon_status).toBe("Canon Dérivé / Jeu Vidéo");

    const sparkingZero = catalog.find((g) => g.steam_app_id === 1790600);
    expect(sparkingZero).toBeDefined();
    expect(sparkingZero?.title).toBe("DRAGON BALL: Sparking! ZERO");
    expect(sparkingZero?.engine).toBe("unreal_engine5");

    const fighterZ = catalog.find((g) => g.steam_app_id === 678950);
    expect(fighterZ).toBeDefined();
    expect(fighterZ?.developer).toBe("Arc System Works");

    // Android games validation
    const legends = catalog.find((g) => g.android_package_ids.includes("com.bandainamcoent.dblegends_ww"));
    expect(legends).toBeDefined();
    expect(legends?.engine).toBe("unity");

    const dokkan = catalog.find((g) => g.android_package_ids.includes("com.bandainamcoent.dbszdokkanww"));
    expect(dokkan).toBeDefined();
    expect(dokkan?.engine).toBe("cocos2dx");
  });

  test("scans memory signatures via wasm_scan_aob", () => {
    const memory = new Uint8Array([0x90, 0x48, 0x89, 0x5C, 0x24, 0x10, 0xC3]);
    const matches = scanAob(memory, "48 89 ?? 24");
    expect(matches).toEqual([1]);
  });

  test("decodes 708 Xenoverse 2 skills via wasm_parse_cus", () => {
    const count = 708;
    const headerSize = 16;
    const entrySize = 48;
    const buffer = new Uint8Array(headerSize + count * entrySize);
    const view = new DataView(buffer.buffer);

    buffer.set([0x23, 0x43, 0x55, 0x53], 0); // "#CUS"
    view.setUint32(4, 1, true);
    view.setUint32(8, count, true);
    view.setUint32(12, headerSize, true);

    for (let i = 0; i < count; i++) {
      const off = headerSize + i * entrySize;
      view.setUint32(off, 1000 + i, true);
      view.setUint16(off + 4, i % 4, true);
      view.setUint32(off + 8, 200, true);
      view.setUint32(off + 12, 100, true);
    }

    const cus = parseCus(buffer);
    expect(cus.version).toBe(1);
    expect(cus.skills.length).toBe(708);
    expect(cus.skills[0]?.id).toBe(1000);
    expect(cus.skills[0]?.category).toBe("Super");
    expect(cus.skills[1]?.category).toBe("Ultimate");
  });

  test("triages and extracts files from CRIWARE CPK virtual archive", () => {
    // Generate valid CPK buffer with @UTF tables
    const content = new TextEncoder().encode("Instant Transmission Skill Data");
    const buffer = new Uint8Array(4096);
    const view = new DataView(buffer.buffer);

    buffer.set([0x43, 0x50, 0x4B, 0x20], 0); // "CPK "
    const tocOffset = 512;
    const contentOffset = 2048;

    buffer.set(content, contentOffset);

    function createUtfTable(name: string, rows: Array<Record<string, string>>): Uint8Array {
      let strings = "";
      const offsets = new Map<string, number>();
      function add(s: string): number {
        if (offsets.has(s)) return offsets.get(s)!;
        const off = strings.length;
        strings += s + "\0";
        offsets.set(s, off);
        return off;
      }
      const nameOff = add(name);
      const cols = Object.keys(rows[0] || {}).sort();
      const colOffs = cols.map(add);
      const rowLen = cols.length * 4;
      const rowBytes = new Uint8Array(rows.length * rowLen);
      const rowView = new DataView(rowBytes.buffer);

      for (let r = 0; r < rows.length; r++) {
        for (let c = 0; c < cols.length; c++) {
          rowView.setUint32(r * rowLen + c * 4, add(rows[r]![cols[c]!] || ""), false);
        }
      }

      const strBytes = new TextEncoder().encode(strings);
      const schemaSize = cols.length * 5;
      const rowsOffset = 30 + schemaSize;
      const stringsOffset = rowsOffset + rowBytes.length;
      const total = stringsOffset + strBytes.length;

      const out = new Uint8Array(total);
      const outView = new DataView(out.buffer);
      out.set([0x40, 0x55, 0x54, 0x46], 0);
      outView.setUint32(4, total - 8, false);
      outView.setUint16(8, rowsOffset - 8, false);
      outView.setUint32(10, stringsOffset - 8, false);
      outView.setUint32(14, total - 8, false);
      outView.setUint32(18, nameOff, false);
      outView.setUint16(22, cols.length, false);
      outView.setUint16(24, rowLen, false);
      outView.setUint32(26, rows.length, false);

      let cur = 30;
      for (let c = 0; c < cols.length; c++) {
        out[cur] = 0x30 | 0x0a;
        outView.setUint32(cur + 1, colOffs[c]!, false);
        cur += 5;
      }
      out.set(rowBytes, rowsOffset);
      out.set(strBytes, stringsOffset);
      return out;
    }

    const toc = createUtfTable("CpkToc", [
      {
        FileName: "skills.cus",
        FileSize: content.length.toString(),
        ExtractSize: content.length.toString(),
        FileOffset: "0",
        ID: "0",
      },
    ]);

    const hdr = createUtfTable("CpkHeader", [
      {
        TocOffset: tocOffset.toString(),
        TocSize: toc.length.toString(),
        ContentOffset: contentOffset.toString(),
        Files: "1",
      },
    ]);

    buffer.set(hdr, 16);
    buffer.set(toc, tocOffset);

    const triage = triageCpk(buffer);
    expect(triage.valid).toBe(true);
    expect(triage.total_files).toBe(1);
    expect(triage.has_utf_table).toBe(true);

    const extracted = extractCpkFile(buffer, "skills.cus");
    expect(extracted).toEqual(content);
  });

  test("decompresses CRILAYLA compressed buffer", () => {
    const original = new Uint8Array(0x100 + 20);
    for (let i = 0; i < original.length; i++) {
      original[i] = (i * 5 + 13) % 256;
    }

    const payload = original.slice(0x100);
    let bitPool = 0n;
    let bits = 0;
    const stream: number[] = [];

    for (let i = payload.length - 1; i >= 0; i--) {
      bitPool = (bitPool << 1n) | 1n;
      bits += 1;
      bitPool = (bitPool << 8n) | BigInt(payload[i]!);
      bits += 8;
      while (bits >= 8) {
        bits -= 8;
        stream.push(Number((bitPool >> BigInt(bits)) & 0xffn));
      }
    }
    if (bits > 0) stream.push(Number((bitPool << BigInt(8 - bits)) & 0xffn));

    const compressed = new Uint8Array(16 + 0x100 + stream.length);
    const view = new DataView(compressed.buffer);
    compressed.set([0x43, 0x52, 0x49, 0x4C, 0x41, 0x59, 0x4C, 0x41], 0);
    view.setUint32(8, payload.length, true);
    view.setUint32(12, 0, true);
    compressed.set(original.subarray(0, 0x100), 16);
    stream.reverse();
    compressed.set(new Uint8Array(stream), 16 + 0x100);

    const decompressed = decompressCrilayla(compressed, original.length);
    expect(decompressed).toEqual(original);
  });
});
