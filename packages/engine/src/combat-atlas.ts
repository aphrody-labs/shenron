// SPDX-License-Identifier: Apache-2.0
import type { loadSpriteAtlas } from "./sprite-atlas";

type AtlasClip = Awaited<ReturnType<typeof loadSpriteAtlas>>;

/** One finite combat cut-in driven by the application's simulation clock. */
export class CombatAtlasEffect {
  readonly durationMs: number;
  #clip: AtlasClip | null;
  #elapsedMs = 0;
  #active = false;

  constructor(clip: AtlasClip) {
    this.#clip = clip;
    this.durationMs = (clip.player.atlas.frames.length * 1000) / clip.player.atlas.fps;
  }

  get active() {
    return this.#active;
  }
  get elapsedMs() {
    return this.#elapsedMs;
  }

  trigger(reducedMotion = false): boolean {
    if (!this.#clip || this.#active || reducedMotion) return false;
    this.#elapsedMs = 0;
    this.#active = true;
    return true;
  }

  advance(deltaMs: number, { paused = false, reducedMotion = false } = {}): void {
    if (!Number.isFinite(deltaMs) || deltaMs < 0) throw new Error("Invalid combat effect time");
    if (reducedMotion) {
      this.stop();
      return;
    }
    if (!this.#active || paused) return;
    this.#elapsedMs = Math.min(this.durationMs, this.#elapsedMs + deltaMs);
    if (this.#elapsedMs >= this.durationMs) this.#active = false;
  }

  draw(
    context: Parameters<AtlasClip["player"]["draw"]>[0],
    position: { x: number; y: number; scale?: number },
  ): number | null {
    if (!this.#active || !this.#clip) return null;
    return this.#clip.player.draw(context, this.#clip.image, this.#elapsedMs, {
      ...position,
      loop: false,
    });
  }

  stop(): void {
    this.#active = false;
    this.#elapsedMs = 0;
  }

  /** The bitmap is shared by successive attacks and released exactly once on unmount. */
  dispose(): void {
    this.stop();
    const clip = this.#clip;
    this.#clip = null;
    clip?.close();
  }
}
