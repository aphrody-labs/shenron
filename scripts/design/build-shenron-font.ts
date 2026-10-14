// SPDX-License-Identifier: OFL-1.1
// Rebuild Shenron Text from the repository's OFL-licensed static Inter faces.
type FontTable = { tag: string; data: Buffer };

export function readTables(font: Buffer): FontTable[] {
  if (font.readUInt32BE(0) !== 0x00010000) throw new Error("Expected static TrueType font");
  const count = font.readUInt16BE(4);
  return Array.from({ length: count }, (_, index) => {
    const entry = 12 + index * 16;
    const offset = font.readUInt32BE(entry + 8);
    const length = font.readUInt32BE(entry + 12);
    if (offset + length > font.length) throw new Error("Invalid font table bounds");
    return {
      tag: font.toString("ascii", entry, entry + 4),
      data: Buffer.from(font.subarray(offset, offset + length)),
    };
  });
}

export function checksum(data: Buffer): number {
  let sum = 0;
  for (let offset = 0; offset < data.length; offset += 4) {
    let word = 0;
    for (let byte = 0; byte < 4; byte++) word = (word * 256 + (data[offset + byte] ?? 0)) >>> 0;
    sum = (sum + word) >>> 0;
  }
  return sum;
}

function rename(data: Buffer, style: "Medium" | "Bold"): Buffer {
  if (data.readUInt16BE(0) !== 0) throw new Error("Unsupported name table format");
  const count = data.readUInt16BE(2);
  const storage = data.readUInt16BE(4);
  const names: Record<number, string> = {
    1: "Shenron Text",
    2: style,
    3: `Shenron Text ${style};1.000`,
    4: `Shenron Text ${style}`,
    6: `ShenronText-${style}`,
    16: "Shenron Text",
    17: style,
  };
  const records = Buffer.from(data.subarray(6, 6 + count * 12));
  const strings: Buffer[] = [];
  let length = 0;
  for (let index = 0; index < count; index++) {
    const record = index * 12;
    const platform = records.readUInt16BE(record);
    const replacement = names[records.readUInt16BE(record + 6)];
    let text = Buffer.from(
      data.subarray(
        storage + records.readUInt16BE(record + 10),
        storage + records.readUInt16BE(record + 10) + records.readUInt16BE(record + 8),
      ),
    );
    if (replacement) {
      text = Buffer.from(replacement, platform === 0 || platform === 3 ? "utf16le" : "ascii");
      if (platform === 0 || platform === 3) text.swap16();
    }
    if (length + text.length > 65535) throw new Error("Name table exceeds TrueType string limit");
    records.writeUInt16BE(text.length, record + 8);
    records.writeUInt16BE(length, record + 10);
    strings.push(text);
    length += text.length;
  }
  const header = Buffer.alloc(6);
  header.writeUInt16BE(count, 2);
  header.writeUInt16BE(6 + records.length, 4);
  return Buffer.concat([header, records, ...strings]);
}

export function deriveFont(source: Buffer, style: "Medium" | "Bold"): Buffer {
  const tables = readTables(source);
  const table = (tag: string) => {
    const found = tables.find((entry) => entry.tag === tag);
    if (!found) throw new Error(`Missing ${tag} table`);
    return found.data;
  };
  const head = table("head");
  const hhea = table("hhea");
  const hmtx = table("hmtx");
  const count = hhea.readUInt16BE(34);
  const glyphCount = table("maxp").readUInt16BE(4);
  // Require explicit metrics for every glyph: avoids silently changing shared tail metrics.
  if (count !== glyphCount) throw new Error("Source must contain a full horizontal metric array");
  const spacing = Math.round(head.readUInt16BE(18) * 0.01);
  // Sidebearings now differ from xMin; do not advertise the original invariant.
  head.writeUInt16BE(head.readUInt16BE(16) & ~2, 16);
  const leftPadding = Math.floor(spacing / 2);
  const loca = table("loca");
  const glyf = table("glyf");
  const longLocations = head.readInt16BE(50) === 1;
  const glyphOffset = (index: number) =>
    longLocations ? loca.readUInt32BE(index * 4) : loca.readUInt16BE(index * 2) * 2;
  let maxAdvance = 0;
  let minLeft = 32767;
  let minRight = 32767;
  let maxExtent = -32768;
  for (let index = 0; index < count; index++) {
    const offset = index * 4;
    const advance = hmtx.readUInt16BE(offset);
    if (advance > 0) {
      hmtx.writeUInt16BE(advance + spacing, offset);
      hmtx.writeInt16BE(hmtx.readInt16BE(offset + 2) + leftPadding, offset + 2);
    }
    const newAdvance = hmtx.readUInt16BE(offset);
    const left = hmtx.readInt16BE(offset + 2);
    const start = glyphOffset(index);
    const width =
      start === glyphOffset(index + 1)
        ? 0
        : glyf.readInt16BE(start + 6) - glyf.readInt16BE(start + 2);
    maxAdvance = Math.max(maxAdvance, newAdvance);
    minLeft = Math.min(minLeft, left);
    minRight = Math.min(minRight, newAdvance - left - width);
    maxExtent = Math.max(maxExtent, left + width);
  }
  hhea.writeUInt16BE(maxAdvance, 10);
  hhea.writeInt16BE(minLeft, 12);
  hhea.writeInt16BE(minRight, 14);
  hhea.writeInt16BE(maxExtent, 16);
  table("OS/2").writeInt16BE(table("OS/2").readInt16BE(2) + spacing, 2);
  const name = tables.find((entry) => entry.tag === "name")!;
  name.data = rename(name.data, style);
  head.writeUInt32BE(0, 8);
  tables.sort((left, right) => (left.tag < right.tag ? -1 : left.tag > right.tag ? 1 : 0));
  let length = 12 + tables.length * 16;
  for (const entry of tables) length += (entry.data.length + 3) & ~3;
  const result = Buffer.alloc(length);
  result.writeUInt32BE(0x00010000);
  result.writeUInt16BE(tables.length, 4);
  const power = Math.floor(Math.log2(tables.length));
  result.writeUInt16BE(2 ** power * 16, 6);
  result.writeUInt16BE(power, 8);
  result.writeUInt16BE(tables.length * 16 - 2 ** power * 16, 10);
  let offset = 12 + tables.length * 16;
  let headOffset = 0;
  tables.forEach((entry, index) => {
    const record = 12 + index * 16;
    result.write(entry.tag, record, 4, "ascii");
    result.writeUInt32BE(checksum(entry.data), record + 4);
    result.writeUInt32BE(offset, record + 8);
    result.writeUInt32BE(entry.data.length, record + 12);
    entry.data.copy(result, offset);
    if (entry.tag === "head") headOffset = offset;
    offset += (entry.data.length + 3) & ~3;
  });
  result.writeUInt32BE((0xb1b0afba - checksum(result)) >>> 0, headOffset + 8);
  return result;
}

if (import.meta.main) {
  const root = `${import.meta.dir}/../..`;
  for (const style of ["Medium", "Bold"] as const) {
    const source = Buffer.from(
      await Bun.file(`${root}/apps/site/public/fonts/Inter-${style}.ttf`).arrayBuffer(),
    );
    const result = deriveFont(source, style);
    await Bun.write(`${root}/apps/site/public/fonts/shenron-text/ShenronText-${style}.ttf`, result);
    console.log(
      `Shenron Text ${style}: ${result.length} bytes, sha256 ${new Bun.CryptoHasher("sha256").update(result).digest("hex")}`,
    );
  }
  if (Bun.argv.includes("--web")) {
    const option = Bun.argv.indexOf("--m3-fonts");
    const ownerRoot = option >= 0 ? Bun.argv[option + 1] : Bun.env.M3_FONTS_DIR;
    if (!ownerRoot)
      throw new Error("--web requires --m3-fonts <canonical m3-fonts directory> or M3_FONTS_DIR");
    const recipe = `${ownerRoot}/scripts/subset.py`;
    if (!(await Bun.file(recipe).exists()))
      throw new Error("Missing canonical M3 font subset recipe");
    const plan = ["Medium", "Bold"].map((style) => ({
      id: `shenron-text-${style.toLowerCase()}`,
      source: `apps/site/public/fonts/shenron-text/ShenronText-${style}.ttf`,
      out: `apps/site/public/fonts/shenron-text/ShenronText-${style}.woff2`,
      ranges: [
        [0x20, 0x024f],
        [0x0300, 0x036f],
        [0x1e00, 0x1eff],
        [0x2000, 0x206f],
        [0x20a0, 0x20cf],
        [0x2190, 0x22ff],
        [0xfffd, 0xfffd],
      ],
    }));
    const child = Bun.spawn([process.execPath, "uv", "run", "--quiet", "--script", recipe, root], {
      stdin: new TextEncoder().encode(JSON.stringify(plan)),
      stdout: "pipe",
      stderr: "pipe",
      timeout: 30000,
    });
    const [output, error, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    if (code !== 0) throw new Error(`M3 font subset failed (${code}): ${error}`);
    const faces = JSON.parse(output) as {
      id: string;
      file: string;
      unicodeRange: string;
      bytes: number;
    }[];
    await Bun.write(
      `${root}/apps/site/public/fonts/shenron-text/subsets.json`,
      `${JSON.stringify(faces, null, 2)}\n`,
    );
    for (const face of faces) console.log(`${face.id}: ${face.bytes} bytes WOFF2`);
  }
}
