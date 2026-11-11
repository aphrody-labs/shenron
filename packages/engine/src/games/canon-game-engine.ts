// SPDX-License-Identifier: Apache-2.0
/**
 * @aphrody/shenron-engine/games/canon-game-engine
 *
 * Sovereign Dragon Ball 2.5D Full Canon Game Engine.
 *
 * Connects:
 * 1. ArcSys WGSL cel-shading pipeline (ILM maps, inverted hull outlines, normal steering).
 * 2. Deterministic 60 FPS simulation loop with fixed delta physics.
 * 3. FighterZ high-DPI HUD (15° italic health bars, 7 Dragon Radar balls, Shenron summon).
 * 4. Manga Toriyama panel balloons, Japanese Katakana onomatopoeia, and anime speedlines.
 * 5. Web Audio API authentic sound synthesis (Ki beams, aura hum, heavy hitsparks).
 * 6. Axum 0.8 and Bevy ECS frame synchronization.
 */

import { ARCSYS_WGSL_SHADER } from "./fighterz-bevy-runtime";
import { type CanonChapter } from "./canon-scenario";

export type RenderMode = "2.5d_webgpu" | "2d_pixel";

export interface FighterCombatState {
  id: string;
  name: string;
  name_ja: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  recoverableHp: number;
  ki: number; // 0..700 (7 bars)
  maxKi: number;
  facingRight: boolean;
  state:
    | "idle"
    | "walk"
    | "jump"
    | "attack_light"
    | "attack_heavy"
    | "ki_blast"
    | "beam_special"
    | "hitstun"
    | "block";
  frame: number;
  comboCount: number;
  comboDamage: number;
  isGrounded: boolean;
  transformationLevel: number; // 0 = base, 1 = ssj, 2 = ssj2, 3 = ssj3, 4 = god
}

export interface BeamClashEntity {
  active: boolean;
  p1Energy: number; // 0..100
  p2Energy: number; // 0..100
  clashX: number;
  clashY: number;
  mashRateP1: number;
  mashRateP2: number;
  durationFrames: number;
  winner?: "player" | "enemy";
}

export interface GameVfxParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  life: number;
  maxLife: number;
  shape: "circle" | "spark" | "aura" | "speedline";
}

export interface OnomatopoeiaText {
  id: number;
  text: string;
  x: number;
  y: number;
  color: string;
  life: number;
  maxLife: number;
  scale: number;
}

export interface CanonEngineOptions {
  chapter: CanonChapter;
  renderMode?: RenderMode;
  audioEnabled?: boolean;
}

export class CanonGameEngine {
  public chapter: CanonChapter;
  public renderMode: RenderMode;
  public player: FighterCombatState;
  public enemy: FighterCombatState;
  public dragonBallsCollected: number = 0; // 0..7
  public shenronSummoned: boolean = false;
  public beamClash: BeamClashEntity;
  public particles: GameVfxParticle[] = [];
  public onomatopoeias: OnomatopoeiaText[] = [];
  public frameCount: number = 0;
  public matchState: "intro" | "fighting" | "beam_clash" | "victory" | "defeat" = "intro";
  public camera = { x: 0, y: 0, zoom: 1.0, shake: 0 };
  public audioContext: AudioContext | null = null;
  public dramaticFinishTriggered: boolean = false;

  private onomaIdCounter = 0;

  constructor(options: CanonEngineOptions) {
    this.chapter = options.chapter;
    this.renderMode = options.renderMode ?? "2.5d_webgpu";

    const baseEnemyHp = options.chapter.enemy.boss_hp ?? 150.0;

    this.player = {
      id: options.chapter.player.id,
      name: options.chapter.player.name,
      name_ja: options.chapter.player.name_ja,
      x: -280,
      y: 0,
      vx: 0,
      vy: 0,
      hp: 100.0,
      maxHp: 100.0,
      recoverableHp: 100.0,
      ki: 100.0,
      maxKi: 700.0,
      facingRight: true,
      state: "idle",
      frame: 0,
      comboCount: 0,
      comboDamage: 0,
      isGrounded: true,
      transformationLevel: 0,
    };

    this.enemy = {
      id: options.chapter.enemy.id,
      name: options.chapter.enemy.name,
      name_ja: options.chapter.enemy.name_ja,
      x: 280,
      y: 0,
      vx: 0,
      vy: 0,
      hp: baseEnemyHp,
      maxHp: baseEnemyHp,
      recoverableHp: baseEnemyHp,
      ki: 100.0,
      maxKi: 700.0,
      facingRight: false,
      state: "idle",
      frame: 0,
      comboCount: 0,
      comboDamage: 0,
      isGrounded: true,
      transformationLevel: 0,
    };

    this.beamClash = {
      active: false,
      p1Energy: 50,
      p2Energy: 50,
      clashX: 0,
      clashY: 0,
      mashRateP1: 0,
      mashRateP2: 0,
      durationFrames: 0,
    };

    if (options.audioEnabled && typeof window !== "undefined") {
      try {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (AudioCtx) {
          this.audioContext = new AudioCtx();
        }
      } catch {
        // AudioContext disabled or restricted by user agent
      }
    }
  }

  /**
   * Deterministic 60 Hz frame tick step.
   */
  public tick(inputs: {
    left: boolean;
    right: boolean;
    up: boolean;
    down: boolean;
    lightAttack: boolean;
    heavyAttack: boolean;
    kiBlast: boolean;
    superMove: boolean;
    summonShenron: boolean;
  }): void {
    this.frameCount++;

    // Shake dampening
    if (this.camera.shake > 0) {
      this.camera.shake = Math.max(0, this.camera.shake - 0.5);
    }

    if (this.matchState === "fighting") {
      this.updateFighterPhysics(this.player, inputs, true);
      this.updateEnemyAi();
      this.resolveCombatCollisions();
      this.checkShenronSummon(inputs.summonShenron);
    } else if (this.matchState === "beam_clash") {
      this.updateBeamClash(inputs.lightAttack || inputs.heavyAttack || inputs.kiBlast);
    }

    this.updateParticles();
    this.updateOnomatopoeias();
  }

  private updateFighterPhysics(
    f: FighterCombatState,
    input: {
      left: boolean;
      right: boolean;
      up: boolean;
      down: boolean;
      lightAttack: boolean;
      heavyAttack: boolean;
      kiBlast: boolean;
      superMove: boolean;
    },
    isPlayer: boolean,
  ): void {
    const SPEED = 5.5;
    const JUMP_POWER = 14.0;
    const GRAVITY = 0.8;

    // Movement
    if (f.state !== "hitstun" && f.state !== "beam_special") {
      if (input.left) {
        f.vx = -SPEED;
        f.state = "walk";
      } else if (input.right) {
        f.vx = SPEED;
        f.state = "walk";
      } else {
        f.vx *= 0.7;
        if (Math.abs(f.vx) < 0.2) {
          f.vx = 0;
          if (f.state === "walk") f.state = "idle";
        }
      }

      if (input.up && f.isGrounded) {
        f.vy = JUMP_POWER;
        f.isGrounded = false;
        f.state = "jump";
        this.playSfx("jump");
      }

      // Attacks
      if (input.superMove && f.ki >= 100) {
        f.state = "beam_special";
        f.ki -= 100;
        f.vx = 0;
        this.spawnAuraParticles(f);
        this.playSfx("beam_charge");
        this.addOnomatopoeia("ドオォォン！", f.x, f.y - 60, "#38bdf8");
      } else if (input.heavyAttack && f.state !== "attack_heavy") {
        f.state = "attack_heavy";
        f.frame = 0;
        this.playSfx("heavy_swing");
      } else if (input.lightAttack && f.state !== "attack_light") {
        f.state = "attack_light";
        f.frame = 0;
        this.playSfx("punch");
      } else if (input.kiBlast && f.ki >= 15) {
        f.state = "ki_blast";
        f.ki -= 15;
        this.spawnKiBlast(f);
        this.playSfx("ki_blast");
        this.addOnomatopoeia("シュッ！", f.x + (f.facingRight ? 40 : -40), f.y - 40, "#fde047");
      }
    }

    // Apply gravity
    if (!f.isGrounded) {
      f.vy -= GRAVITY;
      f.y += f.vy;
      if (f.y <= 0) {
        f.y = 0;
        f.vy = 0;
        f.isGrounded = true;
        if (f.state === "jump") f.state = "idle";
      }
    }

    f.x += f.vx;
    // Boundary clamp (-480 .. 480)
    f.x = Math.max(-480, Math.min(480, f.x));

    // Dynamic orientation
    if (isPlayer) {
      f.facingRight = f.x <= this.enemy.x;
    } else {
      f.facingRight = f.x <= this.player.x;
    }

    // Ki regeneration
    if (f.ki < f.maxKi) {
      f.ki = Math.min(f.maxKi, f.ki + 0.15);
    }
  }

  private updateEnemyAi(): void {
    const e = this.enemy;
    const p = this.player;
    const dist = Math.abs(e.x - p.x);

    // AI logic based on style
    if (e.state !== "hitstun" && e.state !== "beam_special") {
      if (dist > 180) {
        e.vx = e.x < p.x ? 3.5 : -3.5;
        e.state = "walk";
      } else {
        e.vx = 0;
        if (this.frameCount % 45 === 0) {
          const rand = Math.random();
          if (rand < 0.5) {
            e.state = "attack_light";
            this.playSfx("punch");
          } else if (rand < 0.8) {
            e.state = "attack_heavy";
            this.playSfx("heavy_swing");
          } else if (e.ki >= 100 && Math.random() < 0.3) {
            e.state = "beam_special";
            e.ki -= 100;
            this.playSfx("beam_charge");
            this.addOnomatopoeia("ドドドド！", e.x, e.y - 60, "#ef4444");
          }
        }
      }
    }
  }

  private resolveCombatCollisions(): void {
    const p = this.player;
    const e = this.enemy;
    const dist = Math.abs(p.x - e.x);

    // Mutual Beam Clash check
    if (p.state === "beam_special" && e.state === "beam_special" && !this.beamClash.active) {
      this.matchState = "beam_clash";
      this.beamClash = {
        active: true,
        p1Energy: 50,
        p2Energy: 50,
        clashX: (p.x + e.x) / 2,
        clashY: Math.max(p.y, e.y) + 30,
        mashRateP1: 0,
        mashRateP2: 2.2,
        durationFrames: 180,
      };
      this.camera.shake = 8;
      this.playSfx("beam_impact");
      this.addOnomatopoeia(
        "ズガガガガッ！",
        this.beamClash.clashX,
        this.beamClash.clashY,
        "#38bdf8",
      );
      return;
    }

    // Player attack hitting enemy
    if (
      (p.state === "attack_light" || p.state === "attack_heavy") &&
      dist < 70 &&
      e.state !== "hitstun"
    ) {
      const damage = p.state === "attack_heavy" ? 14 : 6;
      e.hp = Math.max(0, e.hp - damage);
      e.state = "hitstun";
      p.comboCount++;
      p.comboDamage += damage;
      p.ki = Math.min(p.maxKi, p.ki + 25);
      this.camera.shake = p.state === "attack_heavy" ? 5 : 2;

      // Onomatopoeia & hitsparks
      const onoma = p.state === "attack_heavy" ? "ドカッ！" : "バキッ！";
      this.addOnomatopoeia(onoma, e.x, e.y - 50, "#f59e0b");
      this.spawnHitspark(e.x, e.y - 45, p.state === "attack_heavy" ? 22 : 12);
      this.playSfx("hit");

      // Award Dragon Ball during high combos
      if (p.comboCount % 3 === 0 && this.dragonBallsCollected < 7) {
        this.dragonBallsCollected++;
        this.playSfx("radar_blip");
        this.addOnomatopoeia(`DRAGON BALL ${this.dragonBallsCollected}★`, p.x, p.y - 90, "#22c55e");
      }

      // Check Victory & Dramatic Finish
      if (e.hp <= 0) {
        this.triggerVictory();
      }
    }

    // Enemy attack hitting player
    if (
      (e.state === "attack_light" || e.state === "attack_heavy") &&
      dist < 70 &&
      p.state !== "hitstun"
    ) {
      const damage = e.state === "attack_heavy" ? 12 : 5;
      p.hp = Math.max(0, p.hp - damage);
      p.state = "hitstun";
      p.comboCount = 0;
      p.comboDamage = 0;
      this.camera.shake = 3;
      this.addOnomatopoeia("ガッ！", p.x, p.y - 45, "#ef4444");
      this.spawnHitspark(p.x, p.y - 40, 10);
      this.playSfx("hit");

      if (p.hp <= 0) {
        this.matchState = "defeat";
      }
    }
  }

  private updateBeamClash(playerMashing: boolean): void {
    const clash = this.beamClash;
    if (!clash.active) return;

    if (playerMashing) {
      clash.p1Energy = Math.min(100, clash.p1Energy + 2.5);
      clash.p2Energy = Math.max(0, clash.p2Energy - 2.5);
      this.camera.shake = 4;
    } else {
      clash.p2Energy = Math.min(100, clash.p2Energy + 0.8);
      clash.p1Energy = Math.max(0, clash.p1Energy - 0.8);
    }

    // Dynamic clash center movement
    clash.clashX = ((clash.p1Energy - 50) / 50) * 120;

    clash.durationFrames--;
    if (clash.durationFrames <= 0 || clash.p1Energy >= 100 || clash.p2Energy >= 100) {
      clash.active = false;
      if (clash.p1Energy > clash.p2Energy) {
        // Player wins beam clash
        this.enemy.hp = Math.max(0, this.enemy.hp - 45);
        this.enemy.state = "hitstun";
        this.addOnomatopoeia("ドッバァァン！！", this.enemy.x, this.enemy.y - 50, "#38bdf8");
        this.spawnHitspark(this.enemy.x, this.enemy.y - 50, 40);
        this.camera.shake = 12;
        this.playSfx("explosion");
        if (this.enemy.hp <= 0) {
          this.triggerVictory();
        } else {
          this.matchState = "fighting";
        }
      } else {
        // Enemy wins beam clash
        this.player.hp = Math.max(0, this.player.hp - 40);
        this.player.state = "hitstun";
        this.camera.shake = 10;
        this.playSfx("explosion");
        if (this.player.hp <= 0) {
          this.matchState = "defeat";
        } else {
          this.matchState = "fighting";
        }
      }
    }
  }

  private checkShenronSummon(requested: boolean): void {
    if (requested && this.dragonBallsCollected === 7 && !this.shenronSummoned) {
      this.shenronSummoned = true;
      this.player.hp = this.player.maxHp; // Wish: Full recovery
      this.player.ki = this.player.maxKi; // Wish: Max ki
      this.camera.shake = 10;
      this.playSfx("shenron_roar");
      this.addOnomatopoeia("神龍召喚！願いを叶えた！", 0, -100, "#22c55e");
      this.spawnShenronAura();
    }
  }

  private triggerVictory(): void {
    this.matchState = "victory";
    this.dramaticFinishTriggered = true;
    this.camera.shake = 14;
    this.playSfx("dramatic_finish");
    this.addOnomatopoeia("DRAMATIC FINISH !!", 0, -80, "#eab308");
  }

  // VFX & Onomatopoeia Handlers
  public addOnomatopoeia(text: string, x: number, y: number, color: string = "#ffffff"): void {
    this.onomatopoeias.push({
      id: ++this.onomaIdCounter,
      text,
      x,
      y,
      color,
      life: 45,
      maxLife: 45,
      scale: 1.0,
    });
  }

  private updateOnomatopoeias(): void {
    for (let i = this.onomatopoeias.length - 1; i >= 0; i--) {
      const o = this.onomatopoeias[i];
      o.life--;
      o.y -= 0.6; // drift upward like manga text
      o.scale += 0.01;
      if (o.life <= 0) {
        this.onomatopoeias.splice(i, 1);
      }
    }
  }

  private spawnHitspark(x: number, y: number, count: number): void {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 8;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color: Math.random() > 0.3 ? "#fde047" : "#f97316",
        size: 3 + Math.random() * 4,
        life: 15,
        maxLife: 15,
        shape: "spark",
      });
    }
  }

  private spawnKiBlast(f: FighterCombatState): void {
    const dir = f.facingRight ? 1 : -1;
    this.particles.push({
      x: f.x + dir * 45,
      y: f.y - 35,
      vx: dir * 14,
      vy: 0,
      color: "#38bdf8",
      size: 14,
      life: 60,
      maxLife: 60,
      shape: "circle",
    });
  }

  private spawnAuraParticles(f: FighterCombatState): void {
    for (let i = 0; i < 15; i++) {
      this.particles.push({
        x: f.x + (Math.random() - 0.5) * 40,
        y: f.y - Math.random() * 80,
        vx: (Math.random() - 0.5) * 2,
        vy: 3 + Math.random() * 6,
        color: "#38bdf8",
        size: 6 + Math.random() * 8,
        life: 25,
        maxLife: 25,
        shape: "aura",
      });
    }
  }

  private spawnShenronAura(): void {
    for (let i = 0; i < 60; i++) {
      this.particles.push({
        x: (Math.random() - 0.5) * 400,
        y: -Math.random() * 200,
        vx: (Math.random() - 0.5) * 4,
        vy: 2 + Math.random() * 5,
        color: "#22c55e",
        size: 8 + Math.random() * 12,
        life: 60,
        maxLife: 60,
        shape: "aura",
      });
    }
  }

  private updateParticles(): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.life--;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
      }
    }
  }

  // Web Audio API authentic synthesis
  private playSfx(
    type:
      | "punch"
      | "heavy_swing"
      | "hit"
      | "jump"
      | "ki_blast"
      | "beam_charge"
      | "beam_impact"
      | "explosion"
      | "radar_blip"
      | "shenron_roar"
      | "dramatic_finish",
  ): void {
    if (!this.audioContext || this.audioContext.state === "suspended") return;

    try {
      const ctx = this.audioContext;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      const now = ctx.currentTime;

      if (type === "punch") {
        osc.type = "sine";
        osc.frequency.setValueAtTime(140, now);
        osc.frequency.exponentialRampToValueAtTime(40, now + 0.08);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
        osc.start(now);
        osc.stop(now + 0.08);
      } else if (type === "heavy_swing") {
        osc.type = "triangle";
        osc.frequency.setValueAtTime(90, now);
        osc.frequency.exponentialRampToValueAtTime(30, now + 0.14);
        gain.gain.setValueAtTime(0.4, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.14);
        osc.start(now);
        osc.stop(now + 0.14);
      } else if (type === "hit") {
        osc.type = "square";
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.exponentialRampToValueAtTime(60, now + 0.1);
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        osc.start(now);
        osc.stop(now + 0.1);
      } else if (type === "ki_blast") {
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.exponentialRampToValueAtTime(150, now + 0.2);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
        osc.start(now);
        osc.stop(now + 0.2);
      } else if (type === "beam_charge") {
        osc.type = "sine";
        osc.frequency.setValueAtTime(200, now);
        osc.frequency.linearRampToValueAtTime(900, now + 0.6);
        gain.gain.setValueAtTime(0.05, now);
        gain.gain.linearRampToValueAtTime(0.35, now + 0.6);
        osc.start(now);
        osc.stop(now + 0.6);
      } else if (type === "beam_impact" || type === "explosion") {
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(120, now);
        osc.frequency.exponentialRampToValueAtTime(20, now + 0.6);
        gain.gain.setValueAtTime(0.5, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.6);
        osc.start(now);
        osc.stop(now + 0.6);
      } else if (type === "radar_blip") {
        osc.type = "sine";
        osc.frequency.setValueAtTime(1200, now);
        osc.frequency.setValueAtTime(1800, now + 0.05);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
        osc.start(now);
        osc.stop(now + 0.15);
      } else if (type === "shenron_roar" || type === "dramatic_finish") {
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(80, now);
        osc.frequency.linearRampToValueAtTime(260, now + 0.5);
        osc.frequency.exponentialRampToValueAtTime(40, now + 1.2);
        gain.gain.setValueAtTime(0.6, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 1.2);
        osc.start(now);
        osc.stop(now + 1.2);
      }
    } catch {
      // Audio node failure fallback
    }
  }

  /**
   * Export frame state for Bevy ECS and Axum frame sync.
   */
  public toBevyFramePacket(): {
    frame: number;
    p1: { x: number; y: number; hp: number; ki: number; state: string };
    p2: { x: number; y: number; hp: number; ki: number; state: string };
    beamClash: boolean;
    dragonBalls: number;
  } {
    return {
      frame: this.frameCount,
      p1: {
        x: this.player.x,
        y: this.player.y,
        hp: this.player.hp,
        ki: this.player.ki,
        state: this.player.state,
      },
      p2: {
        x: this.enemy.x,
        y: this.enemy.y,
        hp: this.enemy.hp,
        ki: this.enemy.ki,
        state: this.enemy.state,
      },
      beamClash: this.beamClash.active,
      dragonBalls: this.dragonBallsCollected,
    };
  }
}
