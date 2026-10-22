#!/usr/bin/env bun
/* oxlint-disable eslint/no-unused-vars, unicorn/no-array-sort -- behavior-preserving legacy pattern, reviewed */
// SPDX-License-Identifier: Apache-2.0
/**
 * End-to-end integration and validation test for the `shenron-re` WASM engine.
 *
 *   bun packages/pipeline/scripts/test-wasm-re.ts
 */

import { bacFixture, bdmFixture } from "../src/testing/dbxv2-fixtures";
import {
  initShenronRe,
  getDragonBallCatalog,
  scanAob,
  parseCus,
  parseBdm,
  parseBac,
  parsePup,
  parseMsg,
  triageCpk,
  extractCpkFile,
  decompressCrilayla,
} from "../src/re-wasm.ts";

console.log("=================================================");
console.log("SHENRON RE WASM PIPELINE END-TO-END VALIDATION");
console.log("=================================================");

console.log("\n[1/6] Initializing shenron-re WASM module...");
await initShenronRe();
console.log("✓ WASM module loaded and instantiated successfully.");

console.log("\n[2/6] Validating Dragon Ball Game Catalog (Steam + Android)...");
const catalog = getDragonBallCatalog();
console.log(`✓ Catalog entries retrieved: ${catalog.length} games`);

// Verify Steam games
const steamAppIds = [
  { id: "dbxv", app_id: 323470, name: "Dragon Ball Xenoverse", engine: "carrot2" },
  { id: "dbxv2", app_id: 454650, name: "Dragon Ball Xenoverse 2", engine: "carrot2" },
  { id: "dbfz", app_id: 678950, name: "DRAGON BALL FighterZ", engine: "arc_system_works_custom" },
  { id: "dbzk", app_id: 851850, name: "DRAGON BALL Z: KAKAROT", engine: "unreal_engine4" },
  { id: "dbsz", app_id: 1790600, name: "DRAGON BALL: Sparking! ZERO", engine: "unreal_engine5" },
  { id: "dbtb", app_id: 1276760, name: "DRAGON BALL: THE BREAKERS", engine: "carrot2" },
  {
    id: "sdbh_wm",
    app_id: 798400,
    name: "Super Dragon Ball Heroes: World Mission",
    engine: "unity",
  },
];

for (const expected of steamAppIds) {
  const game = catalog.find((g) => g.steam_app_id === expected.app_id);
  if (!game) {
    throw new Error(`Missing expected Steam game: ${expected.name} (AppID ${expected.app_id})`);
  }
  if (!game.platforms.includes("steam")) {
    throw new Error(`Game ${game.title} missing 'steam' platform`);
  }
  if (game.canon_status !== "Canon Dérivé / Jeu Vidéo") {
    throw new Error(`Game ${game.title} has invalid canon status: ${game.canon_status}`);
  }
  console.log(
    `  ✓ Steam: [AppID ${game.steam_app_id}] ${game.title} (${game.developer}, Engine: ${JSON.stringify(game.engine)})`,
  );
}

// Verify Android games
const androidPackages = [
  { pkg: "com.bandainamcoent.dblegends_ww", title: "Dragon Ball Legends", engine: "unity" },
  {
    pkg: "com.bandainamcoent.dbszdokkanww",
    title: "Dragon Ball Z Dokkan Battle",
    engine: "cocos2dx",
  },
  { pkg: "com.bandainamcoent.sdbh", title: "Super Dragon Ball Heroes Companion", engine: "unity" },
];

for (const expected of androidPackages) {
  const game = catalog.find((g) => g.android_package_ids.includes(expected.pkg));
  if (!game) {
    throw new Error(`Missing expected Android game package: ${expected.pkg}`);
  }
  if (!game.platforms.includes("android")) {
    throw new Error(`Game ${game.title} missing 'android' platform`);
  }
  console.log(
    `  ✓ Android: [Pkg ${expected.pkg}] ${game.title} (${game.developer}, Formats: ${game.primary_formats.join(", ")})`,
  );
}

console.log("\n[3/6] Validating AOB Memory Pattern Scanning...");
const memoryBuffer = new Uint8Array([
  0x90, 0x90, 0xcc, 0x48, 0x89, 0x5c, 0x24, 0x10, 0x48, 0x89, 0x6c, 0x24, 0x18, 0xc3,
]);
const matches = scanAob(memoryBuffer, "48 89 ?? 24 10");
console.log(`✓ AOB scan match offset: ${matches.join(", ")}`);
if (matches.length !== 1 || matches[0] !== 3) {
  throw new Error(`AOB scan returned unexpected matches: ${JSON.stringify(matches)}, expected [3]`);
}

console.log("\n[4/6] Validating CUS Skill Binary Decoding (708 skills)...");
// Construct synthetic DBXV2 CUS binary file with 708 skills
function buildMockCus(skillCount: number): Uint8Array {
  const headerSize = 16;
  const entrySize = 48;
  const totalSize = headerSize + skillCount * entrySize;
  const buffer = new Uint8Array(totalSize);
  const view = new DataView(buffer.buffer);

  // Magic "#CUS"
  buffer.set([0x23, 0x43, 0x55, 0x53], 0);
  view.setUint32(4, 1, true); // Version 1
  view.setUint32(8, skillCount, true); // Skill count = 708
  view.setUint32(12, headerSize, true); // Offset = 16

  for (let i = 0; i < skillCount; i++) {
    const offset = headerSize + i * entrySize;
    const skillId = 1000 + i;
    const category = i % 4; // 0=Super, 1=Ultimate, 2=Evasive, 3=Awoken
    const kiCost = (i % 5) * 100;
    const staminaCost = category === 2 ? 300 : 0;

    view.setUint32(offset, skillId, true);
    view.setUint16(offset + 4, category, true);
    view.setUint32(offset + 8, kiCost, true);
    view.setUint32(offset + 12, staminaCost, true);
    view.setUint32(offset + 16, skillId * 10, true);
    view.setUint32(offset + 20, skillId * 10 + 1, true);
    view.setUint32(offset + 24, 500 + i, true); // animation_id
    view.setUint32(offset + 28, 600 + i, true); // particle_id
    view.setUint32(offset + 32, 700 + i, true); // sound_id
  }

  return buffer;
}

const mockCusBytes = buildMockCus(708);
const parsedCus = parseCus(mockCusBytes);
console.log(
  `✓ CUS decoded skills count: ${parsedCus.skills.length} (Version: ${parsedCus.version})`,
);
if (parsedCus.skills.length !== 708) {
  throw new Error(`Expected 708 skills, got ${parsedCus.skills.length}`);
}
if (parsedCus.skills[0]!.category !== "Super" || parsedCus.skills[1]!.category !== "Ultimate") {
  throw new Error(`Unexpected category in decoded skills: ${JSON.stringify(parsedCus.skills[0])}`);
}

console.log("\n[5/6] Validating CPK Archive Triage & Extraction...");
// Construct synthetic CRI CPK archive with mock @UTF table and files
function buildMockCpk(): { cpkBytes: Uint8Array; file1: Uint8Array; file2: Uint8Array } {
  const file1 = new TextEncoder().encode("Kamehameha DBXV2 Skill Parameters");
  const file2 = new TextEncoder().encode("Final Flash Ki Blast Hitbox Data");

  // Build basic CPK archive with @UTF header table
  const buffer = new Uint8Array(4096);
  const view = new DataView(buffer.buffer);

  // Magic "CPK "
  buffer.set([0x43, 0x50, 0x4b, 0x20], 0);

  // TOC table offset at 512 (0x200)
  const tocOffset = 512;
  const contentOffset = 2048;

  // File 1 at contentOffset + 0
  buffer.set(file1, contentOffset);
  // File 2 at contentOffset + file1.length
  buffer.set(file2, contentOffset + file1.length);

  // Let's create an @UTF table at offset 16 (Header) and at offset 512 (TOC)
  function createUtfTable(name: string, rows: Array<Record<string, string>>): Uint8Array {
    let strings = "";
    const stringOffsets = new Map<string, number>();
    function addStr(s: string): number {
      if (stringOffsets.has(s)) return stringOffsets.get(s)!;
      const off = strings.length;
      strings += s + "\0";
      stringOffsets.set(s, off);
      return off;
    }

    const tableNameOff = addStr(name);
    const colKeys = Object.keys(rows[0] || {}).sort();
    const colOffsets = colKeys.map((k) => addStr(k));

    const numCols = colKeys.length;
    const rowLen = numCols * 4;
    const numRows = rows.length;

    const rowBytes = new Uint8Array(numRows * rowLen);
    const rowView = new DataView(rowBytes.buffer);

    for (let r = 0; r < numRows; r++) {
      for (let c = 0; c < numCols; c++) {
        const val = rows[r]![colKeys[c]!] || "";
        const valOff = addStr(val);
        rowView.setUint32(r * rowLen + c * 4, valOff, false); // big endian
      }
    }

    const stringsBytes = new TextEncoder().encode(strings);
    const schemaSize = numCols * 5;
    const rowsOffset = 30 + schemaSize;
    const stringsOffset = rowsOffset + rowBytes.length;
    const dataOffset = stringsOffset + stringsBytes.length;
    const totalSize = dataOffset;

    const out = new Uint8Array(totalSize);
    const outView = new DataView(out.buffer);

    // Magic @UTF
    out.set([0x40, 0x55, 0x54, 0x46], 0);
    outView.setUint32(4, totalSize - 8, false);
    outView.setUint16(8, rowsOffset - 8, false);
    outView.setUint32(10, stringsOffset - 8, false);
    outView.setUint32(14, dataOffset - 8, false);
    outView.setUint32(18, tableNameOff, false);
    outView.setUint16(22, numCols, false);
    outView.setUint16(24, rowLen, false);
    outView.setUint32(26, numRows, false);

    let cur = 30;
    for (let c = 0; c < numCols; c++) {
      out[cur] = 0x30 | 0x0a; // row storage + string
      outView.setUint32(cur + 1, colOffsets[c]!, false);
      cur += 5;
    }

    out.set(rowBytes, rowsOffset);
    out.set(stringsBytes, stringsOffset);
    return out;
  }

  const tocTable = createUtfTable("CpkToc", [
    {
      FileName: "kamehameha.cus",
      FileSize: file1.length.toString(),
      ExtractSize: file1.length.toString(),
      FileOffset: "0",
      ID: "0",
    },
    {
      FileName: "final_flash.bac",
      FileSize: file2.length.toString(),
      ExtractSize: file2.length.toString(),
      FileOffset: file1.length.toString(),
      ID: "1",
    },
  ]);

  const hdrTable = createUtfTable("CpkHeader", [
    {
      TocOffset: tocOffset.toString(),
      TocSize: tocTable.length.toString(),
      ContentOffset: contentOffset.toString(),
      Files: "2",
    },
  ]);

  buffer.set(hdrTable, 16);
  buffer.set(tocTable, tocOffset);

  return { cpkBytes: buffer, file1, file2 };
}

const { cpkBytes, file1, file2 } = buildMockCpk();
const triage = triageCpk(cpkBytes);
console.log(
  `✓ CPK triage: valid=${triage.valid}, files=${triage.total_files}, utf_table=${triage.has_utf_table}`,
);
if (!triage.valid || triage.total_files !== 2 || !triage.has_utf_table) {
  throw new Error(`CPK triage failed: ${JSON.stringify(triage)}`);
}

const extracted1 = extractCpkFile(cpkBytes, "kamehameha.cus");
const extracted2 = extractCpkFile(cpkBytes, "final_flash.bac");
const text1 = new TextDecoder().decode(extracted1);
const text2 = new TextDecoder().decode(extracted2);
console.log(`  ✓ Extracted "kamehameha.cus": "${text1}"`);
console.log(`  ✓ Extracted "final_flash.bac": "${text2}"`);
if (text1 !== "Kamehameha DBXV2 Skill Parameters" || text2 !== "Final Flash Ki Blast Hitbox Data") {
  throw new Error("Extracted file contents do not match expected payloads!");
}

console.log("\n[6/6] Validating CRILAYLA Decompression...");
// Construct a synthetic CRILAYLA compressed buffer with literal backward LZSS bitstream
function buildMockCrilayla(original: Uint8Array): Uint8Array {
  const uncompressedSize = original.length >= 0x100 ? original.length - 0x100 : 0;
  const payload = original.length > 0x100 ? original.slice(0x100) : new Uint8Array(0);

  // Encode payload backwards: flag=1 (1 bit) + byte (8 bits)
  let bitPool = 0n;
  let bitsInPool = 0;
  const bitstream: number[] = [];

  for (let i = payload.length - 1; i >= 0; i--) {
    const byte = payload[i]!;
    bitPool = (bitPool << 1n) | 1n;
    bitsInPool += 1;
    bitPool = (bitPool << 8n) | BigInt(byte);
    bitsInPool += 8;

    while (bitsInPool >= 8) {
      bitsInPool -= 8;
      const b = Number((bitPool >> BigInt(bitsInPool)) & 0xffn);
      bitstream.push(b);
    }
  }

  if (bitsInPool > 0) {
    const b = Number((bitPool << BigInt(8 - bitsInPool)) & 0xffn);
    bitstream.push(b);
  }

  const result = new Uint8Array(16 + 0x100 + bitstream.length);
  const view = new DataView(result.buffer);

  // Magic "CRILAYLA"
  result.set([0x43, 0x52, 0x49, 0x4c, 0x41, 0x59, 0x4c, 0x41], 0);
  view.setUint32(8, uncompressedSize, true);
  view.setUint32(12, 0, true); // Header offset = 0

  // 0x100 header bytes
  const copyLen = Math.min(original.length, 0x100);
  result.set(original.subarray(0, copyLen), 16);

  // Reverse bitstream appended
  bitstream.reverse();
  result.set(new Uint8Array(bitstream), 16 + 0x100);

  return result;
}

const originalData = new Uint8Array(0x100 + 40);
for (let i = 0; i < originalData.length; i++) {
  originalData[i] = (i * 3 + 7) % 256;
}

const crilaylaCompressed = buildMockCrilayla(originalData);
const decompressed = decompressCrilayla(crilaylaCompressed, originalData.length);
console.log(
  `✓ CRILAYLA decompressed size: ${decompressed.length} bytes (Matches original: ${decompressed.length === originalData.length})`,
);

let matchCount = 0;
for (let i = 0; i < originalData.length; i++) {
  if (decompressed[i] === originalData[i]) matchCount++;
}
if (matchCount !== originalData.length) {
  throw new Error(
    `CRILAYLA decompression payload mismatch: ${matchCount}/${originalData.length} bytes matched`,
  );
}

console.log("\n[7/7] Validating Dimps Binary Formats (BDM, BAC, PUP, MSG)...");

// 1. BDM Validation
const bdm = parseBdm(bdmFixture([{ id: 100, damageType: 3, amount: 250, victimStun: 30 }]));
if (bdm.entries.length !== 1 || bdm.entries[0]?.damage_type !== "Standard") {
  throw new Error("BDM validation failed");
}
console.log(
  `  ✓ BDM: decoded ${bdm.entries.length} damage entries (Entry 0: type=${bdm.entries[0]?.damage_type}, dmg=${bdm.entries[0]?.base_damage})`,
);

// 2. BAC Validation
const bac = parseBac(bacFixture(4, 8, 4, 250));
if (bac.moves.length !== 1 || bac.moves[0]?.startup_frames !== 8) {
  throw new Error("BAC validation failed");
}
console.log(
  `  ✓ BAC: decoded ${bac.moves.length} action timelines (Action 1: startup=${bac.moves[0]?.startup_frames}f, total=${bac.moves[0]?.total_frames}f)`,
);

// 3. PUP Validation
const pupBuffer = new Uint8Array(16 + 2 * 64);
const pupView = new DataView(pupBuffer.buffer);
pupBuffer.set([0x23, 0x50, 0x55, 0x50], 0); // "#PUP"
pupView.setUint32(4, 1, true);
pupView.setUint32(8, 2, true);
pupView.setUint32(12, 16, true);
for (let i = 0; i < 2; i++) {
  const off = 16 + i * 64;
  pupView.setUint32(off, 200 + i, true);
  pupView.setFloat32(off + 4, 1.2, true);
  pupView.setFloat32(off + 16, 1.35, true);
}
const pup = parsePup(pupBuffer);
if (pup.entries.length !== 2) {
  throw new Error("PUP validation failed");
}
console.log(
  `  ✓ PUP: decoded ${pup.entries.length} power-up presets (Preset 0: atk_mult=${pup.entries[0]?.basic_attack_mult}, blast_mult=${pup.entries[0]?.ki_blast_mult})`,
);

// 4. MSG Validation
const msgLines = ["Super Kamehameha", "Final Flash", "Special Beam Cannon"];
const msgEnc = msgLines.map((l) => new TextEncoder().encode(l));
const msgTextLen = msgEnc.reduce((acc, b) => acc + b.length + 1, 0);
const msgBuffer = new Uint8Array(16 + msgTextLen);
const msgView = new DataView(msgBuffer.buffer);
msgBuffer.set([0x23, 0x4d, 0x53, 0x47], 0); // "#MSG"
msgView.setUint32(4, 1, true);
msgView.setUint32(8, msgLines.length, true);
msgView.setUint32(12, 16, true);
let msgOff = 16;
for (const b of msgEnc) {
  msgBuffer.set(b, msgOff);
  msgBuffer[msgOff + b.length] = 0;
  msgOff += b.length + 1;
}
const msg = parseMsg(msgBuffer);
if (msg.entries.length !== 3 || msg.entries[0]?.lines[0] !== "Super Kamehameha") {
  throw new Error("MSG validation failed");
}
console.log(
  `  ✓ MSG: decoded ${msg.entries.length} text entries (Entry 0: "${msg.entries[0]?.lines[0]}")`,
);

console.log("\n=================================================");
console.log("✓ ALL WASM PIPELINE VALIDATIONS PASSED CLEANLY!");
console.log("=================================================");
