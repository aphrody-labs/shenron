/**
 * Typed metadata of a texture served by `/png`. The server returns the decoded pixels as a
 * lossless PNG at the native EMB dimensions; this module only reads the 33-byte PNG header (no
 * pixel is decoded or resampled here), hashes the bytes, and refuses formats the server does not
 * decode (GNF / PS4) instead of approximating them.
 */
import { Dbxv2Error, Dbxv2SchemaError } from "./errors";

export type Dbxv2ColorSpace = "srgb" | "linear";
export type Dbxv2AlphaMode = "straight" | "premultiplied";

/** Declared, not measured: the PNG carries no such flag. Override per call when a source differs. */
export interface Dbxv2TextureDeclaration {
  readonly colorSpace?: Dbxv2ColorSpace;
  readonly alpha?: Dbxv2AlphaMode;
}

export interface Dbxv2TextureInfo {
  readonly format: "png";
  /** Native dimensions, read from the PNG header (equal to the EMB entry dimensions). */
  readonly width: number;
  readonly height: number;
  readonly bitDepth: number;
  /** PNG colour type (6 = RGBA, 2 = RGB, ...). */
  readonly pngColorType: number;
  readonly colorSpace: Dbxv2ColorSpace;
  readonly alpha: Dbxv2AlphaMode;
  /** Lowercase hex SHA-256 of the exact PNG bytes. */
  readonly sha256: string;
  readonly byteLength: number;
}

export class Dbxv2UnsupportedFormatError extends Dbxv2Error {
  constructor(message: string) {
    super("schema", message);
  }
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return toHex(new Uint8Array(await crypto.subtle.digest("SHA-256", copy as ArrayBuffer)));
}

/** True when the bytes start with the GNF (PlayStation 4) texture magic. */
export function isGnf(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x47 && bytes[1] === 0x4e && bytes[2] === 0x46;
}

/** Reads the IHDR of a PNG; throws when the bytes are not a PNG. GNF is reported explicitly. */
export async function describeTexture(
  bytes: Uint8Array,
  declaration: Dbxv2TextureDeclaration = {},
): Promise<Dbxv2TextureInfo> {
  if (isGnf(bytes))
    throw new Dbxv2UnsupportedFormatError(
      "GNF (PS4) textures are not decoded: refusing to approximate them",
    );
  if (bytes.length < 33 || PNG_SIGNATURE.some((b, i) => bytes[i] !== b))
    throw new Dbxv2SchemaError("texture is not a PNG");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(12) !== 0x49484452)
    throw new Dbxv2SchemaError("PNG header chunk (IHDR) missing");
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  if (width === 0 || height === 0) throw new Dbxv2SchemaError("PNG has an empty dimension");
  return {
    format: "png",
    width,
    height,
    bitDepth: bytes[24]!,
    pngColorType: bytes[25]!,
    colorSpace: declaration.colorSpace ?? "srgb",
    alpha: declaration.alpha ?? "straight",
    sha256: await sha256Hex(bytes),
    byteLength: bytes.byteLength,
  };
}
