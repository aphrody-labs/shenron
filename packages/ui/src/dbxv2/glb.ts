// SPDX-License-Identifier: Apache-2.0
/** Reads the JSON chunk of a binary glTF to summarise it. Pure; never decodes geometry. */

export interface GlbSummary {
  readonly version: number;
  readonly byteLength: number;
  readonly meshes: number;
  readonly primitives: number;
  readonly nodes: number;
  readonly materials: number;
  readonly textures: number;
  readonly animations: number;
  readonly skins: number;
}

const MAGIC = 0x46546c67; // "glTF"
const JSON_CHUNK = 0x4e4f534a; // "JSON"

const count = (value: unknown): number => (Array.isArray(value) ? value.length : 0);

/** Returns null for anything that is not a well-formed GLB with a JSON first chunk. */
export function parseGlbSummary(bytes: Uint8Array): GlbSummary | null {
  if (bytes.byteLength < 20) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== MAGIC) return null;
  const version = view.getUint32(4, true);
  const total = view.getUint32(8, true);
  const chunkLength = view.getUint32(12, true);
  if (view.getUint32(16, true) !== JSON_CHUNK) return null;
  if (total > bytes.byteLength || 20 + chunkLength > bytes.byteLength) return null;
  let json: Record<string, unknown>;
  try {
    const text = new TextDecoder().decode(bytes.subarray(20, 20 + chunkLength));
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== "object") return null;
    json = parsed as Record<string, unknown>;
  } catch {
    return null;
  }
  const meshes = Array.isArray(json.meshes) ? (json.meshes as { primitives?: unknown }[]) : [];
  return {
    version,
    byteLength: total,
    meshes: meshes.length,
    primitives: meshes.reduce((n, m) => n + count(m?.primitives), 0),
    nodes: count(json.nodes),
    materials: count(json.materials),
    textures: count(json.textures),
    animations: count(json.animations),
    skins: count(json.skins),
  };
}
