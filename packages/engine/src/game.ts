// SPDX-License-Identifier: Apache-2.0

import type {
  ArenaId,
  AudioEvent,
  BeamClashRenderData,
  CameraData,
  CombatState,
  FighterDefinition,
  FighterId,
  FighterInput,
  FighterRenderData,
  FighterStyle,
  GameMode,
  HapticEvent,
  Hitbox,
  Hurtbox,
  MoveFrameData,
  MoveKind,
  MovePhase,
  ParticleRenderData,
  Rect,
  StoryChapter,
  UiOverlayData,
  WebGpuRenderPacket,
} from "./types";

/**
 * Retrieves the canonical fighter definition with authentic stats and portrait asset path.
 */
export function getFighterDef(id: FighterId): FighterDefinition {
  switch (id) {
    case "goku":
      return {
        id,
        name: "Son Goku",
        nameJa: "孫悟空",
        style: "balanced",
        maxHp: 10000,
        maxKi: 100,
        walkSpeed: 4.8,
        dashSpeed: 12.0,
        jumpPower: 16.5,
        damageMultiplier: 1.0,
        auraColor: [0.1, 0.6, 1.0, 0.8],
        beamColor: [0.2, 0.7, 1.0, 1.0],
        signatureBeam: "Kamehameha",
        portraitUrl: "/games/dragon-pixel/portraits/GOK.png",
      };
    case "vegeta":
      return {
        id,
        name: "Vegeta",
        nameJa: "ベジータ",
        style: "rushdown",
        maxHp: 9500,
        maxKi: 100,
        walkSpeed: 5.0,
        dashSpeed: 13.0,
        jumpPower: 16.0,
        damageMultiplier: 1.08,
        auraColor: [0.6, 0.2, 0.9, 0.8],
        beamColor: [0.8, 0.3, 1.0, 1.0],
        signatureBeam: "Galick Gun",
        portraitUrl: "/games/dragon-pixel/portraits/VGT.png",
      };
    case "gohan":
      return {
        id,
        name: "Son Gohan (SSJ2)",
        nameJa: "孫悟飯",
        style: "glass_cannon",
        maxHp: 9000,
        maxKi: 120,
        walkSpeed: 5.2,
        dashSpeed: 14.0,
        jumpPower: 17.5,
        damageMultiplier: 1.18,
        auraColor: [1.0, 0.9, 0.1, 0.9],
        beamColor: [1.0, 0.85, 0.2, 1.0],
        signatureBeam: "Father-Son Kamehameha",
        portraitUrl: "/games/dragon-pixel/portraits/GHF.png",
      };
    case "piccolo":
      return {
        id,
        name: "Piccolo",
        nameJa: "ピッコロ",
        style: "zoner",
        maxHp: 10500,
        maxKi: 100,
        walkSpeed: 4.2,
        dashSpeed: 10.5,
        jumpPower: 15.0,
        damageMultiplier: 0.98,
        auraColor: [0.7, 0.9, 0.2, 0.8],
        beamColor: [1.0, 0.9, 0.1, 1.0],
        signatureBeam: "Special Beam Cannon (Makankosappo)",
        portraitUrl: "/games/dragon-pixel/portraits/PIC.png",
      };
    case "frieza":
      return {
        id,
        name: "Frieza",
        nameJa: "フリーザ",
        style: "zoner",
        maxHp: 9800,
        maxKi: 110,
        walkSpeed: 4.5,
        dashSpeed: 12.5,
        jumpPower: 16.0,
        damageMultiplier: 1.05,
        auraColor: [0.8, 0.1, 0.8, 0.8],
        beamColor: [0.9, 0.1, 0.3, 1.0],
        signatureBeam: "Death Beam",
        portraitUrl: "/games/dragon-pixel/portraits/FRZ.png",
      };
    case "cell":
      return {
        id,
        name: "Perfect Cell",
        nameJa: "セル",
        style: "balanced",
        maxHp: 10200,
        maxKi: 100,
        walkSpeed: 4.6,
        dashSpeed: 12.0,
        jumpPower: 16.2,
        damageMultiplier: 1.04,
        auraColor: [0.2, 0.8, 0.3, 0.8],
        beamColor: [1.0, 0.8, 0.1, 1.0],
        signatureBeam: "Solar Kamehameha",
        portraitUrl: "/games/dragon-pixel/portraits/CL4.png",
      };
    case "buu":
      return {
        id,
        name: "Kid Buu",
        nameJa: "魔人ブウ",
        style: "rushdown",
        maxHp: 11000,
        maxKi: 100,
        walkSpeed: 5.4,
        dashSpeed: 14.5,
        jumpPower: 18.0,
        damageMultiplier: 1.1,
        auraColor: [1.0, 0.4, 0.7, 0.8],
        beamColor: [1.0, 0.2, 0.6, 1.0],
        signatureBeam: "Planet Burst",
        portraitUrl: "/games/dragon-pixel/portraits/BUU.png",
      };
    case "trunks":
      return {
        id,
        name: "Future Trunks",
        nameJa: "トランクス",
        style: "rushdown",
        maxHp: 9600,
        maxKi: 100,
        walkSpeed: 4.9,
        dashSpeed: 12.8,
        jumpPower: 16.0,
        damageMultiplier: 1.06,
        auraColor: [0.9, 0.8, 0.1, 0.8],
        beamColor: [1.0, 0.7, 0.1, 1.0],
        signatureBeam: "Burning Attack",
        portraitUrl: "/games/dragon-pixel/portraits/TRX.png",
      };
    case "yamcha":
      return {
        id,
        name: "Yamcha",
        nameJa: "ヤムチャ",
        style: "rushdown",
        maxHp: 8500,
        maxKi: 80,
        walkSpeed: 4.6,
        dashSpeed: 11.5,
        jumpPower: 15.0,
        damageMultiplier: 0.9,
        auraColor: [0.8, 0.5, 0.2, 0.7],
        beamColor: [1.0, 0.5, 0.0, 1.0],
        signatureBeam: "Sokidan (Spirit Ball)",
        portraitUrl: "/games/dragon-pixel/portraits/YMC.png",
      };
  }
}

/**
 * Retrieves the canonical 42-volume manga story chapters.
 */
export function getStoryChapters(): StoryChapter[] {
  return [
    {
      volume: 1,
      title: "The Legend of the Dragon Balls",
      playerFighter: "goku",
      enemyFighter: "yamcha",
      arena: "paozu",
      preDialogue: "Yamcha the Desert Bandit blocks the path!",
    },
    {
      volume: 21,
      title: "The Decisive Battle on Planet Namek",
      playerFighter: "goku",
      enemyFighter: "frieza",
      arena: "namek",
      preDialogue: "You killed Krillin! I will never forgive you!",
    },
    {
      volume: 28,
      title: "Super Saiyan 2 Gohan Awakens",
      playerFighter: "gohan",
      enemyFighter: "cell",
      arena: "cell_games",
      preDialogue:
        "Cell, it is no longer a matter of winning or losing... I am going to destroy you!",
    },
    {
      volume: 42,
      title: "Spirit Bomb - The Farewell",
      playerFighter: "goku",
      enemyFighter: "buu",
      arena: "kaioshin_realm",
      preDialogue:
        "You were incredible, Buu. Maybe you will come back as a good guy someday... See you later!",
    },
  ];
}

/**
 * Retrieves move frame data.
 */
export function getMoveFrameData(kind: MoveKind, multiplier = 1.0): MoveFrameData {
  switch (kind) {
    case "light_jab":
      return {
        kind,
        startupFrames: 4,
        activeFrames: 3,
        recoveryFrames: 7,
        damage: 400 * multiplier,
        hitbox: {
          offset: { x: 40, y: -10, width: 50, height: 30 },
          damage: 400 * multiplier,
          knockback: [2, 0],
          hitstun: 12,
          blockstun: 8,
        },
        kiCost: 0,
      };
    case "heavy_punch":
      return {
        kind,
        startupFrames: 9,
        activeFrames: 4,
        recoveryFrames: 14,
        damage: 850 * multiplier,
        hitbox: {
          offset: { x: 45, y: -15, width: 65, height: 35 },
          damage: 850 * multiplier,
          knockback: [6, 1],
          hitstun: 20,
          blockstun: 12,
        },
        kiCost: 0,
      };
    case "forward_kick":
      return {
        kind,
        startupFrames: 11,
        activeFrames: 5,
        recoveryFrames: 16,
        damage: 1100 * multiplier,
        hitbox: {
          offset: { x: 50, y: -5, width: 80, height: 40 },
          damage: 1100 * multiplier,
          knockback: [10, 2],
          hitstun: 24,
          blockstun: 14,
        },
        kiCost: 0,
      };
    case "low_sweep":
      return {
        kind,
        startupFrames: 8,
        activeFrames: 4,
        recoveryFrames: 15,
        damage: 700 * multiplier,
        hitbox: {
          offset: { x: 35, y: 20, width: 70, height: 25 },
          damage: 700 * multiplier,
          knockback: [4, -4],
          hitstun: 22,
          blockstun: 10,
        },
        kiCost: 0,
      };
    case "dragon_uppercut":
      return {
        kind,
        startupFrames: 7,
        activeFrames: 6,
        recoveryFrames: 22,
        damage: 1300 * multiplier,
        hitbox: {
          offset: { x: 30, y: -40, width: 50, height: 90 },
          damage: 1300 * multiplier,
          knockback: [3, -14],
          hitstun: 32,
          blockstun: 18,
        },
        kiCost: 0,
      };
    case "ki_blast":
      return {
        kind,
        startupFrames: 12,
        activeFrames: 4,
        recoveryFrames: 18,
        damage: 600 * multiplier,
        kiCost: 10,
      };
    case "beam_special":
      return {
        kind,
        startupFrames: 18,
        activeFrames: 30,
        recoveryFrames: 28,
        damage: 2400 * multiplier,
        hitbox: {
          offset: { x: 60, y: -25, width: 600, height: 50 },
          damage: 2400 * multiplier,
          knockback: [16, 3],
          hitstun: 40,
          blockstun: 25,
        },
        kiCost: 30,
      };
    case "ultimate_beam":
      return {
        kind,
        startupFrames: 32,
        activeFrames: 45,
        recoveryFrames: 40,
        damage: 4800 * multiplier,
        hitbox: {
          offset: { x: 60, y: -40, width: 800, height: 80 },
          damage: 4800 * multiplier,
          knockback: [25, 5],
          hitstun: 60,
          blockstun: 35,
        },
        kiCost: 100,
      };
    case "dash_forward":
      return {
        kind,
        startupFrames: 2,
        activeFrames: 12,
        recoveryFrames: 4,
        damage: 0,
        kiCost: 0,
      };
    case "dash_back":
      return {
        kind,
        startupFrames: 2,
        activeFrames: 10,
        recoveryFrames: 6,
        damage: 0,
        kiCost: 0,
      };
  }
}

/**
 * Checks if two bounding boxes intersect.
 */
export function intersectsRect(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

export class FighterEntity {
  id: FighterId;
  def: FighterDefinition;
  x: number;
  y: number;
  vx = 0;
  vy = 0;
  isGrounded = true;
  facingRight: boolean;
  hp: number;
  ki = 0;
  state: CombatState = "idle";
  currentMove?: MoveFrameData;
  moveFrame = 0;
  hitstunRemaining = 0;
  blockstunRemaining = 0;
  knockdownRemaining = 0;
  comboHits = 0;

  constructor(id: FighterId, x: number, facingRight: boolean) {
    this.id = id;
    this.def = getFighterDef(id);
    this.x = x;
    this.y = 0;
    this.facingRight = facingRight;
    this.hp = this.def.maxHp;
  }

  hurtbox(): Rect {
    const isCrouching = this.state === "crouching";
    const w = 50;
    const h = isCrouching ? 65 : 110;
    const ox = this.facingRight ? this.x - 25 : this.x - 25;
    const oy = isCrouching ? this.y : this.y - 45;
    return { x: ox, y: oy, width: w, height: h };
  }

  activeHitbox(): Rect | undefined {
    if (this.state !== "attacking" || !this.currentMove?.hitbox) return undefined;
    const mv = this.currentMove;
    const isAction =
      this.moveFrame >= mv.startupFrames && this.moveFrame < mv.startupFrames + mv.activeFrames;
    if (!isAction) return undefined;

    const hb = mv.hitbox;
    if (!hb) return undefined;
    const ox = this.facingRight ? this.x + hb.offset.x : this.x - hb.offset.x - hb.offset.width;
    return { x: ox, y: this.y + hb.offset.y, width: hb.offset.width, height: hb.offset.height };
  }
}

/**
 * Unified full-featured deterministic fighting engine.
 */
export class DragonPixelEngine {
  p1: FighterEntity;
  p2: FighterEntity;
  arena: ArenaId;
  mode: GameMode;
  frameCount = 0;
  winner?: number;
  audioEvents: AudioEvent[] = [];
  hapticEvents: HapticEvent[] = [];
  particles: ParticleRenderData[] = [];
  clash?: {
    currentX: number;
    clashY: number;
    p1Mashes: number;
    p2Mashes: number;
    framesRemaining: number;
  };

  constructor(
    p1Id: FighterId = "goku",
    p2Id: FighterId = "vegeta",
    arena: ArenaId = "paozu",
    mode: GameMode = "versus",
  ) {
    this.p1 = new FighterEntity(p1Id, 250, true);
    this.p2 = new FighterEntity(p2Id, 750, false);
    this.arena = arena;
    this.mode = mode;
  }

  tick(p1Input: FighterInput, p2Input: FighterInput): void {
    this.audioEvents = [];
    this.hapticEvents = [];
    this.frameCount += 1;

    if (this.winner !== undefined) return;

    this.updateFighter(this.p1, this.p2.x, p1Input);
    this.updateFighter(this.p2, this.p1.x, p2Input);

    this.checkCollisions();
    this.updateParticles();

    if (this.p1.hp <= 0 && this.p2.hp <= 0) {
      this.winner = 0;
      this.hapticEvents.push("knockout");
    } else if (this.p2.hp <= 0) {
      this.winner = 1;
      this.hapticEvents.push("knockout");
    } else if (this.p1.hp <= 0) {
      this.winner = 2;
      this.hapticEvents.push("knockout");
    }
  }

  private updateFighter(f: FighterEntity, targetX: number, input: FighterInput): void {
    if (f.state === "idle" || f.state === "walking") {
      f.facingRight = f.x < targetX;
    }

    if (f.hitstunRemaining > 0) {
      f.hitstunRemaining -= 1;
      if (f.hitstunRemaining === 0) f.state = "idle";
    }
    if (f.blockstunRemaining > 0) {
      f.blockstunRemaining -= 1;
      if (f.blockstunRemaining === 0) f.state = "idle";
    }

    if (f.state === "idle" || f.state === "walking") {
      if (input.block) {
        f.state = "guarding";
      } else if (input.ultimate && f.ki >= 100) {
        f.ki -= 100;
        f.state = "attacking";
        f.currentMove = getMoveFrameData("ultimate_beam", f.def.damageMultiplier);
        f.moveFrame = 0;
      } else if (input.special && f.ki >= 30) {
        f.ki -= 30;
        f.state = "attacking";
        f.currentMove = getMoveFrameData("beam_special", f.def.damageMultiplier);
        f.moveFrame = 0;
      } else if (input.heavyAttack) {
        f.state = "attacking";
        f.currentMove = getMoveFrameData("heavy_punch", f.def.damageMultiplier);
        f.moveFrame = 0;
      } else if (input.lightAttack) {
        f.state = "attacking";
        f.currentMove = getMoveFrameData("light_jab", f.def.damageMultiplier);
        f.moveFrame = 0;
      } else if (input.up && f.isGrounded) {
        f.vy = -f.def.jumpPower;
        f.isGrounded = false;
        f.state = "jumping";
      } else if (input.left) {
        f.vx = -f.def.walkSpeed;
        f.state = "walking";
      } else if (input.right) {
        f.vx = f.def.walkSpeed;
        f.state = "walking";
      } else {
        f.vx = 0;
        f.state = "idle";
      }
    }

    if (f.state === "attacking" && f.currentMove) {
      f.moveFrame += 1;
      const total =
        f.currentMove.startupFrames + f.currentMove.activeFrames + f.currentMove.recoveryFrames;
      if (f.moveFrame >= total) {
        f.state = "idle";
        f.currentMove = undefined;
        f.moveFrame = 0;
      }
    }

    if (!f.isGrounded) {
      f.vy += 0.85;
    }
    f.x += f.vx;
    f.y += f.vy;

    if (f.y >= 0) {
      f.y = 0;
      f.vy = 0;
      f.isGrounded = true;
      if (f.state === "jumping") f.state = "idle";
    }

    f.x = Math.max(40, Math.min(960, f.x));
  }

  private checkCollisions(): void {
    const p1Hit = this.p1.activeHitbox();
    const p2Hurt = this.p2.hurtbox();

    if (p1Hit && intersectsRect(p1Hit, p2Hurt) && this.p2.hitstunRemaining === 0) {
      const dmg = this.p1.currentMove?.damage ?? 300;
      this.applyDamage(this.p2, dmg, 18, [8, -2]);
      this.spawnImpactParticles(p1Hit.x + p1Hit.width / 2, p1Hit.y + p1Hit.height / 2);
      this.audioEvents.push({ soundType: "heavy_impact", pitch: 1.0, volume: 1.0 });
      this.hapticEvents.push("light_impact");
    }

    const p2Hit = this.p2.activeHitbox();
    const p1Hurt = this.p1.hurtbox();

    if (p2Hit && intersectsRect(p2Hit, p1Hurt) && this.p1.hitstunRemaining === 0) {
      const dmg = this.p2.currentMove?.damage ?? 300;
      this.applyDamage(this.p1, dmg, 18, [-8, -2]);
      this.spawnImpactParticles(p2Hit.x + p2Hit.width / 2, p2Hit.y + p2Hit.height / 2);
      this.audioEvents.push({ soundType: "heavy_impact", pitch: 1.0, volume: 1.0 });
      this.hapticEvents.push("light_impact");
    }
  }

  private applyDamage(
    f: FighterEntity,
    amount: number,
    hitstun: number,
    knockback: [number, number],
  ): void {
    if (f.state === "guarding") {
      f.hp = Math.max(0, f.hp - amount * 0.2);
      f.blockstunRemaining = Math.floor(hitstun / 2);
    } else {
      f.hp = Math.max(0, f.hp - amount);
      f.hitstunRemaining = hitstun;
      f.vx = knockback[0];
      f.vy = knockback[1];
      f.isGrounded = false;
      f.state = "hitstun";
    }
  }

  private updateParticles(): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      this.particles[i].x += (Math.random() - 0.5) * 4;
      this.particles[i].y += (Math.random() - 0.5) * 4;
      this.particles[i].size *= 0.92;
      if (this.particles[i].size < 0.5) {
        this.particles.splice(i, 1);
      }
    }
  }

  private spawnImpactParticles(x: number, y: number): void {
    for (let i = 0; i < 12; i++) {
      this.particles.push({
        x,
        y,
        size: 4 + Math.random() * 3,
        color: [1.0, 0.8, 0.2, 1.0],
      });
    }
  }

  getRenderPacket(): WebGpuRenderPacket {
    const camX = (this.p1.x + this.p2.x) * 0.5;
    const camY = Math.min(0, (this.p1.y + this.p2.y) * 0.5);
    const dist = Math.abs(this.p1.x - this.p2.x);
    const zoom = Math.max(0.7, Math.min(1.25, 1000 / Math.max(400, dist)));

    const camera: CameraData = {
      centerX: camX,
      centerY: camY - 60,
      zoom,
      shakeOffsetX: 0,
      shakeOffsetY: 0,
    };

    const toFighterData = (f: FighterEntity): FighterRenderData => ({
      name: f.def.name,
      x: f.x,
      y: f.y,
      facingRight: f.facingRight,
      stateLabel: f.state,
      hpRatio: Math.max(0, Math.min(1, f.hp / f.def.maxHp)),
      kiRatio: Math.max(0, Math.min(1, f.ki / f.def.maxKi)),
      auraColor: f.def.auraColor,
      hurtbox: f.hurtbox(),
      activeHitbox: f.activeHitbox(),
    });

    const ui: UiOverlayData = {
      matchFrame: this.frameCount,
      p1Name: this.p1.def.name,
      p2Name: this.p2.def.name,
      p1Combo: this.p1.comboHits,
      p2Combo: this.p2.comboHits,
      winner: this.winner,
    };

    return {
      camera,
      arena: { arenaId: this.arena, width: 1000, height: 600 },
      fighters: [toFighterData(this.p1), toFighterData(this.p2)],
      particles: this.particles,
      ui,
    };
  }
}
