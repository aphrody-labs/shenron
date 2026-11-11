#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
import { compressSync, decompressSync } from "./engine";
import { TextureConverter } from "./texture-converter";
import { PakExtractor } from "./pak-extractor";
import type { CompressionFormat } from "./types";

const args = process.argv.slice(2);
const command = args[0] || "--help";

async function main() {
  switch (command) {
    case "compress": {
      const file = args[1];
      const format = (args[2] as CompressionFormat) || "zstd";
      if (!file)
        throw new Error("Usage: compression-cli compress <file> [format=zstd|gzip|deflate]");
      const input = await Bun.file(file).bytes();
      const compressed = compressSync(input, format);
      const outPath = `${file}.${format}`;
      await Bun.write(outPath, compressed);
      console.log(
        `[compression-cli] Compressed ${file} (${input.length} B -> ${compressed.length} B) into ${outPath}`,
      );
      break;
    }

    case "decompress": {
      const file = args[1];
      if (!file) throw new Error("Usage: compression-cli decompress <file>");
      const input = await Bun.file(file).bytes();
      const decompressed = decompressSync(input);
      const outPath = file.replace(/\.(zstd|zst|gz|deflate)$/, ".out");
      await Bun.write(outPath, decompressed);
      console.log(
        `[compression-cli] Decompressed ${file} (${input.length} B -> ${decompressed.length} B) into ${outPath}`,
      );
      break;
    }

    case "convert-texture": {
      const file = args[1];
      if (!file) throw new Error("Usage: compression-cli convert-texture <file>");
      const input = await Bun.file(file).bytes();
      const res = TextureConverter.transcode(input, { format: "ktx2" });
      const outPath = `${file}.ktx2`;
      await Bun.write(outPath, res.data);
      console.log(
        `[compression-cli] Transcoded ${file} to KTX2 GPU texture (${res.width}x${res.height}, ${res.data.length} B) -> ${outPath}`,
      );
      break;
    }

    case "inspect-pak": {
      const file = args[1];
      if (!file) throw new Error("Usage: compression-cli inspect-pak <pak_file>");
      const f = Bun.file(file);
      const size = f.size;
      const trailerData = await f.slice(Math.max(0, size - 256), size).bytes();
      const trailer = PakExtractor.parsePakTrailer(trailerData);
      console.log(`[compression-cli] Pak: ${file} (Size: ${size} B)`);
      console.log(
        `[compression-cli] Magic: 0x${trailer.magic.toString(16).toUpperCase()}, Version: ${trailer.version}`,
      );
      console.log(
        `[compression-cli] Index Offset: ${trailer.indexOffset}, Index Size: ${trailer.indexSize}`,
      );
      break;
    }

    case "--help":
    default: {
      console.log(`Sovereign Compression & Asset Conversion CLI (Bun v1.4.4+)`);
      console.log(
        `Usage: compression-cli <compress|decompress|convert-texture|inspect-pak> [options]`,
      );
      break;
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
