// SPDX-License-Identifier: Apache-2.0
/**
 * OCR port over the `shenron` CLI (`shenron ocr image <file> --json`: aphrody-ocr PP-OCRv5,
 * deterministic ONNX, Japanese and Latin scripts). The image goes through a private
 * temporary file that is always removed. Runtime class: `bun`.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { OcrResponse } from "../contract/chat";

const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

export function createCliOcr(o: { binary?: string; timeoutMs?: number } = {}) {
  const binary = o.binary ?? "shenron";
  return {
    available(): boolean {
      return binary.includes("/") ? Bun.file(binary).size > 0 : Bun.which(binary) !== null;
    },
    async recognize(bytes: Uint8Array, mediaType: string): Promise<OcrResponse> {
      const ext = EXT[mediaType];
      if (!ext) throw new Error(`unsupported image type ${mediaType}`);
      const dir = await mkdtemp(join(tmpdir(), "shenron-ocr-"));
      const file = join(dir, `page.${ext}`);
      try {
        await Bun.write(file, bytes);
        const started = performance.now();
        const child = Bun.spawn([binary, "ocr", "image", file, "--json"], {
          stdout: "pipe",
          stderr: "pipe",
          signal: AbortSignal.timeout(o.timeoutMs ?? 120_000),
        });
        const [out, err, code] = await Promise.all([
          new Response(child.stdout).text(),
          new Response(child.stderr).text(),
          child.exited,
        ]);
        if (code !== 0) throw new Error(`shenron ocr image failed (exit ${code}): ${err.trim().split("\n").at(-1) ?? ""}`);
        const parsed = JSON.parse(out) as { engine?: string; text?: string; regions?: number };
        return {
          engine: parsed.engine ?? "ppocr-v5-mobile",
          text: parsed.text ?? "",
          regions: parsed.regions ?? 0,
          ms: Math.round(performance.now() - started),
        };
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
  };
}
