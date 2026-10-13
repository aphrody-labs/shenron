// SPDX-License-Identifier: Apache-2.0
import {
  episodeVideoPatch,
  type EpisodeVideoDelivery,
  type EpisodeVideoExpectation,
} from "./episode-video-delivery";

type NativeImage = { metadata(): Promise<{ width: number; height: number; format: string }> };
type NativeImageConstructor = new (source: Uint8Array) => NativeImage;

async function fetchArtifact(url: string, sha256: string, limit: number, signal?: AbortSignal) {
  const deadline = AbortSignal.timeout(30000);
  const response = await fetch(url, {
    redirect: "error",
    credentials: "omit",
    signal: signal ? AbortSignal.any([signal, deadline]) : deadline,
  });
  if (response.status !== 200 || !response.body) {
    await response.body?.cancel();
    throw new Error(`Public video artifact HTTP ${response.status}`);
  }
  const declared = response.headers.get("content-length");
  const encoding = response.headers.get("content-encoding")?.toLowerCase();
  if (
    declared !== null &&
    (!Number.isSafeInteger(Number(declared)) || Number(declared) <= 0 || Number(declared) > limit)
  ) {
    await response.body.cancel();
    throw new Error("Public video artifact exceeds its byte budget");
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > limit || chunks.length >= 65536)
        throw new Error("Public video artifact exceeds its byte budget");
      chunks.push(chunk.value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
  if (
    !length ||
    ((!encoding || encoding === "identity") && declared !== null && length !== Number(declared))
  )
    throw new Error("Truncated public video artifact");
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  if (new Bun.CryptoHasher("sha256").update(bytes).digest("hex") !== sha256)
    throw new Error("Public video artifact differs from the qualified producer digest");
  return { bytes, mime: response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() };
}

/** Re-read published producer artifacts; never extract frames or re-encode their source. */
export async function verifyEpisodeVideoArtifacts(
  input: EpisodeVideoDelivery,
  expected: EpisodeVideoExpectation,
  signal?: AbortSignal,
) {
  const mapped = episodeVideoPatch(input, expected);
  if (input.frames.reduce((total, frame) => total + frame.bytes, 0) > 128 * 1024 ** 2)
    throw new Error("Episode frame verification exceeds its aggregate byte budget");
  const Image = Reflect.get(Bun, "Image") as NativeImageConstructor | undefined;
  if (typeof Image !== "function") throw new Error("Qualified Bun.Image capability is unavailable");
  let checkedBytes = 0;
  for (const frame of input.frames) {
    signal?.throwIfAborted();
    const { bytes, mime } = await fetchArtifact(
      frame.url,
      frame.sha256,
      Math.min(frame.bytes, 33 * 1024 ** 2),
      signal,
    );
    checkedBytes += bytes.byteLength;
    if (checkedBytes > 128 * 1024 ** 2)
      throw new Error("Episode frame verification exceeds its aggregate byte budget");
    if (
      mime !== "image/png" ||
      bytes.byteLength !== frame.bytes ||
      ![137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)
    )
      throw new Error("Episode frames must retain their published PNG bytes");
    const metadata = await new Image(bytes).metadata();
    if (
      metadata.format !== "png" ||
      metadata.width !== frame.width ||
      metadata.height !== frame.height
    )
      throw new Error("Native image metadata differs from the original-resolution producer frame");
  }
  for (const track of input.subtitles ?? []) {
    const { bytes, mime } = await fetchArtifact(track.url, track.sha256, 1024 * 1024, signal);
    if (
      mime !== "text/vtt" ||
      !new TextDecoder("utf-8", { fatal: true })
        .decode(bytes)
        .replace(/^\uFEFF/, "")
        .startsWith("WEBVTT")
    )
      throw new Error("Selectable subtitles require a normalized public WebVTT artifact");
  }
  return {
    ...mapped,
    verification: {
      frames: input.frames.length,
      subtitles: input.subtitles?.length ?? 0,
      checkedBytes,
      sha256Verified: true,
      nativeImageMetadataVerified: true,
      extractionPerformed: false,
      reencodingPerformed: false,
    },
  };
}
