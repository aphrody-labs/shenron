// SPDX-License-Identifier: Apache-2.0
import "server-only";
import sharp from "sharp";

/** Decode one frame before storing original bytes; header sniffing alone accepts broken images. */
export async function verifyAdminImage(
  bytes: Uint8Array,
): Promise<{ width: number; height: number }> {
  const image = sharp(bytes, { failOn: "warning", limitInputPixels: 64_000_000, pages: 1 });
  const metadata = await image.metadata();
  if (!metadata.width || !metadata.height) throw new Error("Missing image dimensions");
  await image.stats();
  return { width: metadata.width, height: metadata.height };
}
