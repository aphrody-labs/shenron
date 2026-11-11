// SPDX-License-Identifier: Apache-2.0
/**
 * packages/hyperframes/src/stream.ts
 *
 * Zero-Download HTTP Byte-Range Stream Reader & ISOBMFF MP4 Parser.
 */

export interface AtomHeader {
  offset: number;
  size: number;
  type: string;
}

export async function fetchByteSlice(url: string, start: number, end: number): Promise<Uint8Array> {
  const res = await fetch(url, {
    headers: {
      Range: `bytes=${start}-${end}`,
    },
  });

  if (!res.ok && res.status !== 206 && res.status !== 200) {
    throw new Error(`Failed to fetch byte range [${start}-${end}] from ${url}: HTTP ${res.status}`);
  }

  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}

export function parseAtoms(buffer: Uint8Array, startOffset: number = 0): AtomHeader[] {
  const atoms: AtomHeader[] = [];
  let i = startOffset;

  while (i <= buffer.length - 8) {
    const size = (buffer[i] << 24) | (buffer[i + 1] << 16) | (buffer[i + 2] << 8) | buffer[i + 3];

    const type = String.fromCharCode(buffer[i + 4], buffer[i + 5], buffer[i + 6], buffer[i + 7]);

    const actualSize = size >>> 0;
    if (actualSize === 0 || actualSize > buffer.length - i + 100000000) {
      break;
    }

    atoms.push({ offset: i, size: actualSize, type });
    i += actualSize;
  }

  return atoms;
}

export function findAtom(
  buffer: Uint8Array,
  atomType: string,
  startOffset: number = 0,
): AtomHeader | null {
  const atoms = parseAtoms(buffer, startOffset);
  return atoms.find((a) => a.type === atomType) ?? null;
}
