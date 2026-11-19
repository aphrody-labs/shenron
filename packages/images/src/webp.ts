import { convertWithProof, type ConvertOptions, type ConvertResult } from "./encode";

export type ToWebpOptions = ConvertOptions;

export type ToWebpResult = ConvertResult;

/**
 * Converts an image to WebP with a non-regression proof: the output is decoded and
 * compared to the source (resized to the same width with the same kernel) and must
 * reach `minPsnr` (default 38 dB); it must also be smaller than the input. Quality and
 * effort come from the content class (default `photo`: q80, effort 6) unless given.
 * Nothing is written to disk: the caller decides where the buffer goes, and always keeps
 * the original.
 */
export function toWebp(src: string | Uint8Array, opts: ToWebpOptions = {}): Promise<ToWebpResult> {
  return convertWithProof(src, "webp", opts);
}
