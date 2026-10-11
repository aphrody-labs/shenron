// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "bun:test";
import { SHENRON_FFI_VERSION } from "../src/generated/symbols";
import {
  reAbiVersion,
  reVersion,
  reTriage,
  reParseSave,
  reCatalog,
  reLiveProcessFind,
  reUnifiedState,
  resolveShenronReLibraryPath,
} from "../src/re";

describe("shenron-re Bun FFI", () => {
  it("resolves the native library path", () => {
    const path = resolveShenronReLibraryPath();
    expect(path).toBeDefined();
  });

  it("reads ABI version and crate version", () => {
    expect(reAbiVersion()).toBe(1);
    expect(reVersion()).toBe(SHENRON_FFI_VERSION);
  });

  it("triages binary bytes via FFI", () => {
    const peHeader = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);
    const report = reTriage(peHeader);
    expect(report.size_bytes).toBe(8);
    expect(report.is_pe).toBe(true);
    expect(report.is_cpk).toBe(false);
  });

  it("inspects and parses DBXV2 decrypted savegame via FFI", () => {
    const buf = new Uint8Array(0x30000);
    // #SAV magic
    buf[0] = 0x23; // #
    buf[1] = 0x53; // S
    buf[2] = 0x41; // A
    buf[3] = 0x56; // V

    // Zeni = 7,777,777 at 0x2C
    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    view.setUint32(0x2c, 7777777, true);
    view.setUint32(0x30, 888, true);

    // CaC 0 at FIRST_CAC_OFFSET (0x1E830)
    const cacOff = 0x1e830;
    const nameBytes = new TextEncoder().encode("Vegeta\0");
    buf.set(nameBytes, cacOff + 0x44);
    buf[cacOff + 0x14] = 2; // Saiyan (Male)
    view.setUint32(cacOff + 0xac, 99, true); // Level 99
    view.setUint32(cacOff + 0xb8, 150, true); // Health
    view.setUint32(cacOff + 0xc0, 140, true); // Basic ATK

    const parsed = reParseSave(buf);
    expect(parsed.signature).toBe("#SAV");
    expect(parsed.zeni).toBe(7777777);
    expect(parsed.tp_medals).toBe(888);
    expect(parsed.active_cacs_count).toBe(1);
    expect(parsed.cacs[0]?.name).toBe("Vegeta");
    expect(parsed.cacs[0]?.race_name).toBe("Saiyan (Male)");
    expect(parsed.cacs[0]?.level).toBe(99);
    expect(parsed.cacs[0]?.basic_atk).toBe(140);
  });

  it("queries the Dragon Ball catalog via FFI", () => {
    const catalog = reCatalog() as Array<{ id: string; title: string }>;
    expect(Array.isArray(catalog)).toBe(true);
    expect(catalog.length).toBeGreaterThan(0);
    const dbxv2 = catalog.find((g) => g.id === "dbxv2");
    expect(dbxv2).toBeDefined();
    expect(dbxv2?.title).toBe("Dragon Ball Xenoverse 2");
  });

  it("handles live process search via FFI", () => {
    const res = reLiveProcessFind("DBXV2_NonExistent.exe");
    expect(res.found).toBe(false);
  });

  it("builds unified state snapshot via FFI", () => {
    const state = reUnifiedState({});
    expect(state.game_title).toBe("Dragon Ball Xenoverse 2");
    expect(state.steam_app_id).toBe(454650);
    expect(Array.isArray(state.characters)).toBe(true);
  });
});
