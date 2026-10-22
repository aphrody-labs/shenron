// SPDX-License-Identifier: Apache-2.0
/** Browser-only entry point for the DBXV2 reverse-engineering WebAssembly. */

import initWasm, {
  wasm_parse_bac,
  wasm_parse_bdm,
  wasm_parse_cms,
  wasm_parse_cus,
  wasm_parse_msg,
  wasm_parse_pup,
} from "./wasm/shenron_re.js";
import { SHENRON_RE_WASM_FILENAME, SHENRON_RE_WASM_SHA256 } from "./wasm/re-wasm-asset";

export { SHENRON_RE_WASM_FILENAME };

export type GameDataFormat = "bac" | "bdm" | "cms" | "cus" | "msg" | "pup";

export interface GameDataFileResult {
  format: GameDataFormat;
  recordCount: number;
  version?: number;
  preview: unknown[];
}

export interface MessageEntry {
  id: number;
  name_id: string;
  lines: string[];
}

/** Returns every original MSG entry and line; the explorer preview stays independently bounded. */
export function parseMessageFile(bytes: Uint8Array): { entries: MessageEntry[] } {
  return wasm_parse_msg(bytes) as { entries: MessageEntry[] };
}

export interface RosterEntry {
  id: number;
  short_name: string;
}

/** Returns the full character roster (`data/system/char_model_spec.cms`), every entry. */
export function parseCharacterRoster(bytes: Uint8Array): { entries: RosterEntry[] } {
  return wasm_parse_cms(bytes) as { entries: RosterEntry[] };
}

let wasmReady: Promise<void> | undefined;

const MAX_WASM_BYTES = 16 * 1024 * 1024;

async function verifiedWasm(response: Response): Promise<Uint8Array<ArrayBuffer>> {
  if (!response.ok) throw new Error(`WASM request failed (${response.status})`);
  if (!response.body) throw new Error("WASM response has no body");
  if (Number(response.headers.get("content-length")) > MAX_WASM_BYTES) {
    await response.body.cancel();
    throw new Error("WASM response exceeds its byte limit");
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > MAX_WASM_BYTES) throw new Error("WASM response exceeds its byte limit");
      chunks.push(chunk.value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  const digest = Array.from(new Uint8Array(hash), (part) =>
    part.toString(16).padStart(2, "0"),
  ).join("");
  if (digest !== SHENRON_RE_WASM_SHA256)
    throw new Error("WASM digest differs from the pinned parser");
  return bytes;
}

/** Loads only the pinned public parser bytes; a failed attempt can be retried. */
export function initShenronReWeb(url: string): Promise<void> {
  wasmReady ??= (async () => {
    const response = await fetch(url, {
      mode: "cors",
      credentials: "omit",
      redirect: "error",
      signal: AbortSignal.timeout(30_000),
    });
    await initWasm({ module_or_path: await verifiedWasm(response) });
  })().catch((error) => {
    wasmReady = undefined;
    throw error;
  });
  return wasmReady;
}

/** Parses one extracted Xenoverse data file locally in the browser. */
export function parseGameDataFile(format: GameDataFormat, bytes: Uint8Array): GameDataFileResult {
  switch (format) {
    case "cus": {
      const file = wasm_parse_cus(bytes) as { version: number; skills: unknown[] };
      return {
        format,
        version: file.version,
        recordCount: file.skills.length,
        preview: file.skills.slice(0, 12),
      };
    }
    case "pup": {
      const file = wasm_parse_pup(bytes) as { entries: unknown[] };
      return { format, recordCount: file.entries.length, preview: file.entries.slice(0, 12) };
    }
    case "bdm": {
      const file = wasm_parse_bdm(bytes) as { entries: unknown[] };
      return { format, recordCount: file.entries.length, preview: file.entries.slice(0, 12) };
    }
    case "bac": {
      const file = wasm_parse_bac(bytes) as { moves: unknown[] };
      return { format, recordCount: file.moves.length, preview: file.moves.slice(0, 12) };
    }
    case "msg": {
      const file = parseMessageFile(bytes);
      return { format, recordCount: file.entries.length, preview: file.entries.slice(0, 12) };
    }
    case "cms": {
      const file = parseCharacterRoster(bytes);
      return { format, recordCount: file.entries.length, preview: file.entries.slice(0, 12) };
    }
  }
}
