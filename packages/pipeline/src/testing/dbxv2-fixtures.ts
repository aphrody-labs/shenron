// SPDX-License-Identifier: Apache-2.0
/**
 * Minimal DBXV2 files in the game's real layouts, mirroring the Rust encoders of
 * `crates/shenron-re` (`encode_bdm`, `encode_bac`).
 */

/** BDM with 1284-byte entries: `u32 id` then ten 128-byte variants. */
export function bdmFixture(
  entries: readonly { id: number; damageType: number; amount: number; victimStun: number }[],
): Uint8Array {
  const entrySize = 1284;
  const bytes = new Uint8Array(16 + entries.length * entrySize);
  const view = new DataView(bytes.buffer);
  bytes.set([0x23, 0x42, 0x44, 0x4d], 0); // "#BDM"
  view.setUint16(4, 0xfffe, true);
  view.setUint32(8, entries.length, true);
  view.setUint32(12, 16, true);
  entries.forEach((entry, i) => {
    const at = 16 + i * entrySize;
    view.setUint32(at, entry.id, true);
    for (let v = 0; v < 10; v++) {
      const o = at + 4 + v * 128;
      view.setUint16(o, entry.damageType, true);
      view.setUint16(o + 4, entry.amount, true);
      view.setFloat32(o + 40, 0.2, true);
      view.setUint16(o + 50, entry.victimStun, true);
      view.setFloat32(o + 120, 1, true);
    }
  });
  return bytes;
}

/**
 * BAC with an empty slot 0 and action 1: one animation record (character EAN, slot
 * `eanIndex`, 30 frames) and one hitbox record.
 */
export function bacFixture(eanIndex: number, hitStart: number, hitLength: number, damage: number) {
  const bytes = new Uint8Array(0x60 + 36 + 64);
  const view = new DataView(bytes.buffer);
  bytes.set([0x23, 0x42, 0x41, 0x43], 0); // "#BAC"
  view.setUint16(4, 0xfffe, true);
  view.setUint32(8, 2, true);
  view.setUint32(0x10, 0x20, true);
  view.setUint32(0x20, 0x8000_0000, true); // entry 0: empty
  view.setUint16(0x34, 2, true); // entry 1: two blocks
  view.setUint32(0x38, 0x40, true);
  view.setUint16(0x40, 0, true); // block: animation
  view.setUint16(0x42, 1, true);
  view.setUint32(0x48, 0x60, true);
  view.setUint16(0x50, 1, true); // block: hitbox
  view.setUint16(0x52, 1, true);
  view.setUint32(0x58, 0x60 + 36, true);
  view.setUint16(0x62, 30, true);
  view.setUint16(0x68, 5, true);
  view.setUint16(0x6a, eanIndex, true);
  view.setUint16(0x72, 0xffff, true);
  view.setFloat32(0x78, 1, true);
  const hit = 0x60 + 36;
  view.setUint16(hit, hitStart, true);
  view.setUint16(hit + 2, hitLength, true);
  view.setUint16(hit + 8, 7, true);
  view.setUint16(hit + 12, damage, true);
  view.setFloat32(hit + 36, 0.3, true);
  return bytes;
}

/** UTF-16 MSG in the real layout, mirroring `MsgFile::create_mock` (keys `MSG_<i>`). */
export function msgFixture(lines: readonly string[]): Uint8Array {
  const count = lines.length;
  const keys = 32;
  const ids = keys + count * 16;
  const lists = ids + count * 4;
  const slots = lists + count * 8;
  const chunks: number[] = Array.from({ length: slots + count * 16 }, () => 0);
  const put32 = (at: number, value: number) => {
    for (let k = 0; k < 4; k++) chunks[at + k] = (value >>> (8 * k)) & 0xff;
  };
  [0x23, 0x4d, 0x53, 0x47, 0, 1, 1, 0].forEach((byte, i) => (chunks[i] = byte)); // "#MSG"
  [count, keys, ids, lists, count, slots].forEach((value, i) => put32(8 + i * 4, value));
  lines.forEach((line, i) => {
    put32(ids + i * 4, i);
    put32(lists + i * 8, 1);
    put32(lists + i * 8 + 4, slots + i * 16);
    for (const [slot, text] of [
      [keys + i * 16, `MSG_${i}`],
      [slots + i * 16, line],
    ] as const) {
      put32(slot, chunks.length);
      put32(slot + 4, text.length);
      put32(slot + 8, (text.length + 1) * 2);
      for (const unit of [...Array.from(text, (_, k) => text.charCodeAt(k)), 0])
        chunks.push(unit & 0xff, unit >> 8);
    }
  });
  return Uint8Array.from(chunks);
}

/** CMS roster in the real 84-byte-entry layout, mirroring `encode_cms`. */
export function cmsFixture(entries: readonly { id: number; shortName: string }[]): Uint8Array {
  const entrySize = 84;
  const bytes = new Uint8Array(16 + entries.length * entrySize);
  const view = new DataView(bytes.buffer);
  bytes.set([0x23, 0x43, 0x4d, 0x53], 0); // "#CMS"
  view.setUint16(4, 0xfffe, true);
  view.setUint32(8, entries.length, true);
  view.setUint32(12, 16, true);
  entries.forEach((entry, i) => {
    const at = 16 + i * entrySize;
    view.setUint32(at, entry.id, true);
    for (let k = 0; k < entry.shortName.length; k++)
      bytes[at + 4 + k] = entry.shortName.charCodeAt(k);
  });
  return bytes;
}

/** PUP power-up preset in the real 152-byte-entry layout, mirroring `encode_pup`. */
export function pupFixture(
  entries: readonly { id: number; health: number; duration: number }[],
): Uint8Array {
  const entrySize = 152;
  const bytes = new Uint8Array(16 + entries.length * entrySize);
  const view = new DataView(bytes.buffer);
  bytes.set([0x23, 0x50, 0x55, 0x50], 0); // "#PUP"
  view.setUint16(4, 0xfffe, true);
  view.setUint16(6, 16, true);
  view.setUint32(8, entries.length, true);
  entries.forEach((entry, i) => {
    const at = 16 + i * entrySize;
    view.setInt32(at, entry.id, true);
    view.setInt32(at + 4, -1, true);
    view.setInt32(at + 8, -1, true);
    view.setInt32(at + 12, -1, true);
    view.setFloat32(at + 16, entry.health, true);
    view.setFloat32(at + 100, entry.duration, true);
  });
  return bytes;
}

/**
 * Minimal version-3 (patch 1.25+) `.cus` with one skillset and one skill per given
 * category, mirroring `encode_cus`. Skills carry no string-table paths.
 */
export function cusFixture(
  skillsetId: number,
  skills: readonly {
    category: "super" | "ultimate" | "evasive" | "unk" | "blast" | "awoken";
    shortName: string;
    id1: number;
  }[],
): Uint8Array {
  const skillSize = 92;
  const skillsetSize = 32;
  const header = new Uint8Array(64);
  const headerView = new DataView(header.buffer);
  header.set([0x23, 0x43, 0x55, 0x53], 0); // "#CUS"
  headerView.setUint16(4, 0xfffe, true);
  headerView.setUint32(8, 1, true); // skillsetCount
  headerView.setUint32(12, 64, true); // skillsetOffset
  headerView.setUint32(16, 1, true); // placeholder, overwritten below per category

  const skillset = new Uint8Array(skillsetSize);
  new DataView(skillset.buffer).setInt32(0, skillsetId, true);

  const order = ["super", "ultimate", "evasive", "unk", "blast", "awoken"] as const;
  const countField = {
    super: 16,
    ultimate: 20,
    evasive: 24,
    unk: 28,
    blast: 32,
    awoken: 36,
  } as const;
  const offsetField = {
    super: 40,
    ultimate: 44,
    evasive: 48,
    unk: 52,
    blast: 56,
    awoken: 60,
  } as const;

  let cursor = 64 + skillsetSize;
  const chunks: Uint8Array[] = [header, skillset];
  for (const category of order) {
    const entries = skills.filter((s) => s.category === category);
    headerView.setUint32(countField[category], entries.length, true);
    headerView.setUint32(offsetField[category], cursor, true);
    for (const entry of entries) {
      const bytes = new Uint8Array(skillSize);
      const view = new DataView(bytes.buffer);
      for (let k = 0; k < Math.min(4, entry.shortName.length); k++)
        bytes[k] = entry.shortName.charCodeAt(k);
      view.setUint16(8, entry.id1, true);
      for (const o of [64, 66, 68, 70, 72, 74]) view.setUint16(o, 0xffff, true);
      chunks.push(bytes);
      cursor += skillSize;
    }
  }
  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}
