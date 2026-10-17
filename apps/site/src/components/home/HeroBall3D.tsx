"use client";

/**
 * The four-star ball of the home hero, rendered by shenron-engine (wgpu on WebGPU, wasm).
 * A client island because the renderer factory is a function: a server component cannot pass
 * it as a prop. Without WebGPU the component keeps the measured SVG ball.
 */
import { DragonBall3D } from "@aphrody/shenron-ui/toriyama";
import { createToriyamaRenderer } from "@aphrody/shenron-engine/toriyama3d";

export function HeroBall3D({ size }: { size: string }) {
  return <DragonBall3D stars={4} size={size} decorative renderer={createToriyamaRenderer} />;
}
