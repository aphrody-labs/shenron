// SPDX-License-Identifier: Apache-2.0

import { DragonPixelEngine } from "./game";
import type { FighterId, ArenaId, GameMode, FighterInput, WebGpuRenderPacket } from "./types";

/**
 * Historical game bridge contract, retained for existing consumers.
 * Its name does not identify the backend of an implementation.
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
 * Creates the deterministic TypeScript game bridge. This factory does not load WASM.
 */
export async function createTypeScriptGameEngine(
  p1: FighterId = "goku",
  p2: FighterId = "vegeta",
  arena: ArenaId = "paozu",
  mode: GameMode = "versus",
): Promise<IWasmGameEngine> {
  return new TypeScriptEngineBridge(p1, p2, arena, mode);
}

/**
 * Compatibility name for the TypeScript game bridge; it does not load WebAssembly.
 * @deprecated Use createTypeScriptGameEngine to state the actual backend explicitly.
 */
export async function createWasmGameEngine(
  p1: FighterId = "goku",
  p2: FighterId = "vegeta",
  arena: ArenaId = "paozu",
  mode: GameMode = "versus",
): Promise<IWasmGameEngine> {
  return createTypeScriptGameEngine(p1, p2, arena, mode);
}
