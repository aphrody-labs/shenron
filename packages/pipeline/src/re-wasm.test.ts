// SPDX-License-Identifier: Apache-2.0
import {
  bacFixture,
  bdmFixture,
  cmsFixture,
  cusFixture,
  msgFixture,
  pupFixture,
} from "./testing/dbxv2-fixtures";
import { describe, expect, test, beforeAll } from "bun:test";
import {
  initShenronRe,
  getDragonBallCatalog,
  scanAob,
  parseCus,
  parseCms,
  parseBdm,
  parseBac,
  parsePup,
  parseMsg,
  extractMsgText,
  parseEmb,
  triageCpk,
  extractCpkFile,
  decompressCrilayla,
  getXenoverse3PrototypeMap,
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
    const legends = catalog.find((g) =>
      g.android_package_ids.includes("com.bandainamcoent.dblegends_ww"),
    );
    expect(legends).toBeDefined();
    expect(legends?.engine).toBe("unity");

    const dokkan = catalog.find((g) =>
      g.android_package_ids.includes("com.bandainamcoent.dbszdokkanww"),
    );
    expect(dokkan).toBeDefined();
    expect(dokkan?.engine).toBe("cocos2dx");
  });

  test("retrieves a connected, source-attributed Xenoverse 3 prototype map", () => {
    const map = getXenoverse3PrototypeMap();
    expect(map.era).toBe("AGE 1000");
    expect(map.status).toBe("original_prototype_schematic");
    expect(map.zones.map(({ id }) => id)).toContain("glacier-expedition");
    expect(map.landmarks.every(({ source }) => source.startsWith("https://"))).toBe(true);
    expect(map.routes.some(({ from, to }) => from === "west-city" && to === "central-plaza")).toBe(
      true,
    );
    expect(map.caveat).toContain("unreleased");
  });

  test("scans memory signatures via wasm_scan_aob", () => {
    const memory = new Uint8Array([0x90, 0x48, 0x89, 0x5c, 0x24, 0x10, 0xc3]);
    const matches = scanAob(memory, "48 89 ?? 24");
    expect(matches).toEqual([1]);
  });

  test("decodes CUS skillsets and skills across categories via wasm_parse_cus", () => {
    const cus = parseCus(
      cusFixture(7, [
        { category: "super", shortName: "KMHM", id1: 12 },
        { category: "awoken", shortName: "SSJ3", id1: 99 },
      ]),
    );
    expect(cus.skillsets.length).toBe(1);
    expect(cus.skillsets[0]?.id).toBe(7);
    expect(cus.skills.length).toBe(2);
    expect(cus.skills[0]).toMatchObject({ category: "super", short_name: "KMHM", id1: 12 });
    expect(cus.skills[1]).toMatchObject({ category: "awoken", short_name: "SSJ3", id1: 99 });
  });

  test("triages and extracts files from CRIWARE CPK virtual archive", () => {
    // Generate valid CPK buffer with @UTF tables
    const content = new TextEncoder().encode("Instant Transmission Skill Data");
    const buffer = new Uint8Array(4096);

    buffer.set([0x43, 0x50, 0x4b, 0x20], 0); // "CPK "
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
      const cols = Object.keys(rows[0] || {}).toSorted();
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
    compressed.set([0x43, 0x52, 0x49, 0x4c, 0x41, 0x59, 0x4c, 0x41], 0);
    view.setUint32(8, payload.length, true);
    view.setUint32(12, 0, true);
    compressed.set(original.subarray(0, 0x100), 16);
    stream.reverse();
    compressed.set(new Uint8Array(stream), 16 + 0x100);

    const decompressed = decompressCrilayla(compressed, original.length);
    expect(decompressed).toEqual(original);
  });

  test("decodes BDM (Battle Damage Matrix) definitions via wasm_parse_bdm", () => {
    const bdm = parseBdm(
      bdmFixture([
        { id: 100, damageType: 3, amount: 250, victimStun: 30 },
        { id: 101, damageType: 8, amount: 500, victimStun: 42 },
      ]),
    );
    expect(bdm.entries.length).toBe(2);
    expect(bdm.entries[0]?.id).toBe(100);
    expect(bdm.entries[0]?.damage_type).toBe("Standard");
    expect(bdm.entries[0]?.base_damage).toBe(250);
    expect(bdm.entries[1]?.damage_type).toBe("Knockback");
    expect(bdm.entries[1]?.hitstun_frames).toBe(42);
  });

  test("decodes BAC (Battle Action Code) movesets via wasm_parse_bac", () => {
    const bac = parseBac(bacFixture(4, 8, 4, 250));
    expect(bac.moves.length).toBe(1);
    expect(bac.moves[0]?.move_id).toBe(1);
    expect(bac.moves[0]?.total_frames).toBe(30);
    expect(bac.moves[0]?.startup_frames).toBe(8);
    expect(bac.moves[0]?.hitboxes[0]?.damage).toBe(250);
  });

  test("decodes CMS (Character Model Spec) roster via wasm_parse_cms", () => {
    const cms = parseCms(
      cmsFixture([
        { id: 0, shortName: "GOK" },
        { id: 16, shortName: "VGT" },
        { id: 999, shortName: "FRI" },
      ]),
    );
    expect(cms.entries.length).toBe(3);
    expect(cms.entries[0]).toEqual({ id: 0, short_name: "GOK" });
    expect(cms.entries[1]?.id).toBe(16);
    expect(cms.entries[2]?.short_name).toBe("FRI");
  });

  test("decodes PUP (Power-Up Parameters) transformation presets via wasm_parse_pup", () => {
    const pup = parsePup(
      pupFixture([
        { id: 200, health: 1.2, duration: 800 },
        { id: 201, health: 0.0, duration: 300 },
      ]),
    );
    expect(pup.entries.length).toBe(2);
    expect(pup.entries[0]?.id).toBe(200);
    expect(pup.entries[0]?.health).toBeCloseTo(1.2);
    expect(pup.entries[0]?.duration).toBe(800);
    expect(pup.entries[0]?.f_20).toBe(0);
    expect(pup.entries[0]?.cmn_effect_id).toBe(-1);
    expect(pup.entries[1]?.duration).toBe(300);
  });

  test("decodes MSG (Message) strings via wasm_parse_msg", () => {
    const buffer = msgFixture(["Kamehameha", "Super Saiyan"]);
    const msg = parseMsg(buffer);
    expect(msg.entries.length).toBe(2);
    expect(msg.entries[0]?.lines[0]).toBe("Kamehameha");
    expect(msg.entries[1]?.lines[0]).toBe("Super Saiyan");
  });

  test("extracts permissive MSG text runs via WASM", () => {
    const bytes = new Uint8Array([
      0,
      0,
      ...Array.from("Hello", (char) => char.charCodeAt(0)).flatMap((code) => [code, 0]),
    ]);
    expect(extractMsgText("quest.msg", bytes)).toEqual({
      file: "quest.msg",
      count: 1,
      strings: ["Hello"],
    });
  });

  test("validates EMB texture entries via WASM without copying payloads", () => {
    const bytes = new Uint8Array(60);
    bytes.set([0x23, 0x45, 0x4d, 0x42], 0); // #EMB
    const view = new DataView(bytes.buffer);
    view.setInt32(12, 1, true);
    view.setInt32(24, 32, true);
    view.setInt32(28, 40, true);
    view.setInt32(32, 12, true);
    view.setInt32(36, 4, true);
    view.setInt32(40, 48, true);
    bytes.set([0x44, 0x44, 0x53, 0x21], 44);
    bytes.set(new TextEncoder().encode("texture.dds\0"), 48);

    expect(parseEmb(bytes)).toEqual({
      entries: [{ name: "texture.dds", offset: 44, sizeBytes: 4 }],
    });
  });
});
