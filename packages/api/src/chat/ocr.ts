// SPDX-License-Identifier: Apache-2.0
/**
 * OCR port over the Aphrody CLI, the capability owner: `aphrody ocr ppocr <file> --json`
 * (aphrody-ocr PP-OCRv5, deterministic ONNX, Japanese and Latin scripts; weights installed by
 * `aphrody model pull ppocr-v5-mobile`). It answers the shared `aphrody.ocr.result/v2`
 * contract. The image goes through a private temporary file that is always removed.
 * Runtime class: `bun`.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { OcrResponse } from "../contract/chat";

const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

const RESULT_SCHEMA = "aphrody.ocr.result/v2";

interface OcrResultV2 {
  schema?: unknown;
  status?: unknown;
  markdown?: unknown;
  image?: { sha256?: unknown };
  blocks?: Array<{ text?: unknown }>;
  attempts?: Array<{ run?: { model_id?: unknown } }>;
}

/** Text of an `aphrody.ocr.result/v2` answer, bound to the bytes that were sent. */
export function readOcrResult(raw: unknown, sha256: string): Omit<OcrResponse, "ms"> {
  const top = (raw ?? {}) as OcrResultV2 & { result?: OcrResultV2 };
  const result = top.schema === undefined && top.result ? top.result : top;
  if (result.schema !== RESULT_SCHEMA)
    throw new Error(`unsupported OCR result schema: ${String(result.schema)}`);
  const digest = result.image?.sha256;
  if (digest !== undefined && digest !== sha256)
    throw new Error("OCR result is not bound to this image");
  if (result.status !== "text" && result.status !== "no-text" && result.status !== "needs-review")
    throw new Error(`OCR status ${String(result.status)}`);
  const lines = (result.blocks ?? [])
    .map((block) => (typeof block.text === "string" ? block.text.trim() : ""))
    .filter(Boolean);
  const markdown = typeof result.markdown === "string" ? result.markdown.trim() : "";
  const model = result.attempts?.at(-1)?.run?.model_id;
  return {
    engine: typeof model === "string" && model ? model : "ppocr-v5-mobile",
    text: lines.length > 0 ? lines.join("\n") : markdown,
    regions: lines.length,
  };
}

export function createCliOcr(o: { binary?: string; timeoutMs?: number } = {}) {
  const binary = o.binary ?? "aphrody";
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
        const sha256 = new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
        const started = performance.now();
        const child = Bun.spawn([binary, "ocr", "ppocr", file, "--json"], {
          stdout: "pipe",
          stderr: "pipe",
          signal: AbortSignal.timeout(o.timeoutMs ?? 120_000),
        });
        const [out, err, code] = await Promise.all([
          new Response(child.stdout).text(),
          new Response(child.stderr).text(),
          child.exited,
        ]);
        if (code !== 0)
          throw new Error(
            `aphrody ocr ppocr failed (exit ${code}): ${err.trim().split("\n").at(-1) ?? ""}`,
          );
        return {
          ...readOcrResult(JSON.parse(out), sha256),
          ms: Math.round(performance.now() - started),
        };
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
  };
}
