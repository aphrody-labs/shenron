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
