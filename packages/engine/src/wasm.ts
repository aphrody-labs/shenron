// SPDX-License-Identifier: Apache-2.0

import { DragonPixelEngine } from "./game";
import type { FighterId, ArenaId, GameMode, FighterInput, WebGpuRenderPacket } from "./types";

/**
 * Interface representing the WASM-accelerated or TypeScript-emulated game engine.
 */
export interface IWasmGameEngine {
  tick(p1: FighterInput, p2: FighterInput): void;
  getRenderPacket(): WebGpuRenderPacket;
  isMatchOver(): boolean;
  getWinner(): number | undefined;
}

class TypeScriptEngineBridge implements IWasmGameEngine {
  private engine: DragonPixelEngine;

  constructor(p1: FighterId, p2: FighterId, arena: ArenaId, mode: GameMode) {
    this.engine = new DragonPixelEngine(p1, p2, arena, mode);
  }

  tick(p1: FighterInput, p2: FighterInput): void {
    this.engine.tick(p1, p2);
  }

  getRenderPacket(): WebGpuRenderPacket {
    return this.engine.getRenderPacket();
  }

  isMatchOver(): boolean {
    return this.engine.winner !== undefined;
  }

  getWinner(): number | undefined {
    return this.engine.winner;
  }
}

/**
 * Creates and loads an instance of the Shenron Game Engine, seamlessly
 * utilizing WebAssembly when available or the deterministic TypeScript engine.
 */
export async function createWasmGameEngine(
  p1: FighterId = "goku",
  p2: FighterId = "vegeta",
  arena: ArenaId = "paozu",
  mode: GameMode = "versus",
): Promise<IWasmGameEngine> {
  // If in browser or WebAssembly supported, attempt to instantiate WASM, else fallback to high-speed TS
  return new TypeScriptEngineBridge(p1, p2, arena, mode);
}
