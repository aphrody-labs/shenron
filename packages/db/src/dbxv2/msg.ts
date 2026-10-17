// SPDX-License-Identifier: Apache-2.0
/**
 * Readers of the two DBXV2 layouts the DB needs and that `bun_re::game::api::summarize`
 * does not decode correctly yet (its MSG reader is a null-terminated mock, its CMS reader
 * uses a 16-byte stride). Both are bounds-checked, read-only and cover only the fields the
 * DB stores; retire them once `bun_re` decodes the real layouts. Runtime class: `pure`.
 */

export interface MsgEntry {
  id: number;
  nameId: string;
  lines: string[];
}

export interface CmsEntry {
  id: number;
  shortName: string;
}

const utf16 = new TextDecoder("utf-16le");

/**
 * `#MSG` (UTF-16LE): header `u32 count @8`, `u32 names @0x0c` (count 16-byte records
 * `{offset, chars, bytes, 0}`), `u32 entries @0x14` (count `{lines, offset}` pairs) and
 * `u32 lineRecords @0x1c` (same record shape as the names). Entry `i` is `names[i]`.
 */
export function decodeMsg(bytes: Uint8Array): MsgEntry[] {
  if (bytes.length < 0x20 || bytes[0] !== 0x23 || bytes[1] !== 0x4d || bytes[2] !== 0x53) return [];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u32 = (offset: number): number =>
    offset + 4 <= bytes.length ? view.getUint32(offset, true) : -1;
  const count = u32(8);
  const namesAt = u32(0x0c);
  const entriesAt = u32(0x14);
  if (count < 0 || count > 1_000_000 || namesAt < 0 || entriesAt < 0) return [];
  const text = (record: number): string | null => {
    const at = u32(record);
    const chars = u32(record + 4);
    if (at < 0 || chars < 0 || chars > 0x100000 || at + chars * 2 > bytes.length) return null;
    return utf16.decode(bytes.subarray(at, at + chars * 2));
  };
  const out: MsgEntry[] = [];
  for (let i = 0; i < count; i++) {
    const nameId = text(namesAt + i * 16);
    const lineCount = u32(entriesAt + i * 8);
    const lineAt = u32(entriesAt + i * 8 + 4);
    if (nameId === null || lineCount < 0 || lineCount > 4096 || lineAt < 0) continue;
    const lines: string[] = [];
    for (let l = 0; l < lineCount; l++) {
      const line = text(lineAt + l * 16);
      if (line !== null) lines.push(line);
    }
    out.push({ id: i, nameId, lines });
  }
  return out;
}

/** `#CMS`: `u32 count @8`, `u32 first @0x0c`, entries of 0x54 bytes: `u32 id`, 3-char name. */
export function decodeCms(bytes: Uint8Array): CmsEntry[] {
  if (bytes.length < 0x10 || bytes[0] !== 0x23 || bytes[1] !== 0x43 || bytes[2] !== 0x4d) return [];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint32(8, true);
  const first = view.getUint32(12, true);
  const out: CmsEntry[] = [];
  for (let i = 0; i < count; i++) {
    const at = first + i * 0x54;
    if (at + 8 > bytes.length) break;
    let end = at + 4;
    while (end < at + 8 && bytes[end] !== 0) end++;
    const shortName = new TextDecoder().decode(bytes.subarray(at + 4, end));
    if (shortName) out.push({ id: view.getUint32(at, true), shortName });
  }
  return out;
}
