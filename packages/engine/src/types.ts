// SPDX-License-Identifier: Apache-2.0

/**
 * Unified type definitions for the Shenron Game Engine.
 */

export type FighterId =
  | "goku"
  | "vegeta"
  | "gohan"
  | "piccolo"
  | "frieza"
  | "cell"
  | "buu"
  | "trunks"
  | "yamcha";

export type FighterStyle = "balanced" | "rushdown" | "zoner" | "grappler" | "glass_cannon";

export type GameMode = "story" | "arcade" | "versus" | "training";

export type ArenaId =
  | "paozu"
  | "tournament"
  | "namek"
  | "cell_games"
  | "kaioshin_realm"
  | "time_chamber";

export type MoveKind =
  | "light_jab"
  | "heavy_punch"
  | "forward_kick"
  | "low_sweep"
  | "dragon_uppercut"
  | "ki_blast"
  | "beam_special"
  | "ultimate_beam"
  | "dash_forward"
  | "dash_back";

export type MovePhase = "startup" | "active" | "recovery";

export type CombatState =
  | "idle"
  | "walking"
  | "dashing"
  | "jumping"
  | "crouching"
  | "attacking"
  | "guarding"
  | "hitstun"
  | "knockdown"
  | "beam_clash";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Hitbox {
  offset: Rect;
  damage: number;
  knockback: [number, number];
  hitstun: number;
  blockstun: number;
}

export interface Hurtbox {
  offset: Rect;
  isInvulnerable: boolean;
}

export interface MoveFrameData {
  kind: MoveKind;
  startupFrames: number;
  activeFrames: number;
  recoveryFrames: number;
  damage: number;
  hitbox?: Hitbox;
  kiCost: number;
}

export interface FighterDefinition {
  id: FighterId;
  name: string;
  nameJa: string;
  style: FighterStyle;
  maxHp: number;
  maxKi: number;
  walkSpeed: number;
  dashSpeed: number;
  jumpPower: number;
  damageMultiplier: number;
  auraColor: [number, number, number, number];
  beamColor: [number, number, number, number];
  signatureBeam: string;
  portraitUrl: string;
}

export interface StoryChapter {
  volume: number;
  title: string;
  playerFighter: FighterId;
  enemyFighter: FighterId;
  arena: ArenaId;
  preDialogue: string;
}

export interface FighterInput {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  lightAttack: boolean;
  heavyAttack: boolean;
  special: boolean;
  ultimate: boolean;
  block: boolean;
  dash: boolean;
}

export interface AudioEvent {
  soundType: string;
  pitch: number;
  volume: number;
}

export type HapticEvent = "light_impact" | "heavy_impact" | "clash_pulse" | "knockout";

export interface CameraData {
  centerX: number;
  centerY: number;
  zoom: number;
  shakeOffsetX: number;
  shakeOffsetY: number;
}

export interface ArenaRenderData {
  arenaId: ArenaId;
  width: number;
  height: number;
}

export interface FighterRenderData {
  name: string;
  x: number;
  y: number;
  facingRight: boolean;
  stateLabel: string;
  hpRatio: number;
  kiRatio: number;
  auraColor: [number, number, number, number];
  hurtbox: Rect;
  activeHitbox?: Rect;
}

export interface ParticleRenderData {
  x: number;
  y: number;
  size: number;
  color: [number, number, number, number];
}

export interface BeamClashRenderData {
  p1BeamStart: [number, number];
  p2BeamStart: [number, number];
  clashPoint: [number, number];
  dominance: number;
  p1BeamColor: [number, number, number, number];
  p2BeamColor: [number, number, number, number];
}

export interface UiOverlayData {
  matchFrame: number;
  p1Name: string;
  p2Name: string;
  p1Combo: number;
  p2Combo: number;
  winner?: number;
}

export interface WebGpuRenderPacket {
  camera: CameraData;
  arena: ArenaRenderData;
  fighters: [FighterRenderData, FighterRenderData];
  particles: ParticleRenderData[];
  beamClash?: BeamClashRenderData;
  ui: UiOverlayData;
}
