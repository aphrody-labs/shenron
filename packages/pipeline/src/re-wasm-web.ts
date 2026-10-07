// SPDX-License-Identifier: Apache-2.0
/** Browser-only entry point for the DBXV2 reverse-engineering WebAssembly. */

import initWasm, {
  wasm_parse_bac,
  wasm_parse_bdm,
  wasm_parse_cus,
  wasm_parse_msg,
  wasm_parse_pup,
} from "./wasm/shenron_re.js";
import { SHENRON_RE_WASM_FILENAME } from "./wasm/re-wasm-asset";

export { SHENRON_RE_WASM_FILENAME };

export type GameDataFormat = "bac" | "bdm" | "cus" | "msg" | "pup";

export interface GameDataFileResult {
  format: GameDataFormat;
  recordCount: number;
  version?: number;
  preview: unknown[];
}

let wasmReady: Promise<void> | undefined;

/** Loads the public WASM from the given origin or CDN URL using streaming instantiation. */
export function initShenronReWeb(url: string): Promise<void> {
  wasmReady ??= (async () => {
    const response = await fetch(url, { mode: "cors", credentials: "omit" });
    if (!response.ok) throw new Error(`WASM request failed (${response.status})`);
    await initWasm({ module_or_path: response });
  })();
  return wasmReady;
}

/** Parses one extracted Xenoverse data file locally in the browser. */
export function parseGameDataFile(format: GameDataFormat, bytes: Uint8Array): GameDataFileResult {
  switch (format) {
    case "cus": {
      const file = wasm_parse_cus(bytes) as { version: number; skills: unknown[] };
      return { format, version: file.version, recordCount: file.skills.length, preview: file.skills.slice(0, 12) };
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
      const file = wasm_parse_msg(bytes) as { entries: unknown[] };
      return { format, recordCount: file.entries.length, preview: file.entries.slice(0, 12) };
    }
  }
}
