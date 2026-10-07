// SPDX-License-Identifier: Apache-2.0
"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  createGame,
  step,
  type FighterId,
  type ArenaId,
  type GameMode,
  type GameState,
  type GameInput,
  type MultiverseDimension,
  FIGHTERS,
  STORY_CHAPTERS,
} from "./engine";
import { KiExplosionEffect, type KiColorStyle } from "@shenron/ui/cinematic";

/**
 * Authentic Full-Body High-Definition Akira Toriyama Character Artwork.
 * Extracted from official high-resolution assets in /dbz/characters/ and /dbz/transformations/.
 */
const CHARACTER_FULL_ASSETS: Record<FighterId, string> = {
  goku: "/dbz/characters/goku.webp",
  vegeta: "/dbz/characters/vegeta.webp",
  gohan: "/dbz/characters/gohan.webp",
  piccolo: "/dbz/characters/piccolo.webp",
  trunks: "/dbz/characters/trunks.webp",
  frieza: "/dbz/characters/freezer.webp",
  cell: "/dbz/characters/celula.webp",
  buu: "/dbz/characters/majin-buu.webp",
  beerus: "/dbz/characters/Beerus_DBS_Broly_Artwork.webp",
  broly: "/dbz/characters/Broly_DBS_Base.webp",
  jiren: "/dbz/characters/Jiren.webp",
};

const TRANSFORMATION_FULL_ASSETS: Record<FighterId, string> = {
  goku: "/dbz/transformations/goku-ssj.webp",
  vegeta: "/dbz/transformations/vegeta-ssj.webp",
  gohan: "/dbz/transformations/gohan-ssj2.webp",
  piccolo: "/dbz/transformations/piccolo-orange.webp",
  trunks: "/dbz/transformations/trunks-ssj.webp",
  frieza: "/dbz/transformations/freezer-perfect-form-golden.webp",
  cell: "/dbz/transformations/super-perfect-form.webp",
  buu: "/dbz/transformations/majin-buu-pure.webp",
  beerus: "/dbz/characters/Beerus_DBS_Broly_Artwork.webp",
  broly: "/dbz/transformations/broly-lssj.webp",
  jiren: "/dbz/characters/Jiren.webp",
};

/**
 * Official Square Portraits for HUD and Manga Koma Cut-Ins.
 */
const PORTRAIT_ASSETS: Record<FighterId, string> = {
  goku: "/games/dragon-pixel/portraits/GOK.png",
  vegeta: "/games/dragon-pixel/portraits/VGT.png",
  gohan: "/games/dragon-pixel/portraits/GOH.png",
  piccolo: "/games/dragon-pixel/portraits/PIC.png",
  trunks: "/games/dragon-pixel/portraits/TRF.png",
  frieza: "/games/dragon-pixel/portraits/FRZ.png",
  cell: "/games/dragon-pixel/portraits/CEL.png",
  buu: "/games/dragon-pixel/portraits/BUU.png",
  beerus: "/games/dragon-pixel/portraits/BLS.png",
  broly: "/games/dragon-pixel/portraits/BRL.png",
  jiren: "/games/dragon-pixel/portraits/JRN.png",
};

/**
 * Official Backdrops and Celestial Planets.
 */
const ARENA_BACKDROPS: Record<
  ArenaId,
  { planet: string; skyGrad: [string, string, string]; floorColor: string; rimColor: string }
> = {
  paozu: {
    planet: "/dbz/planets/tierra.webp",
    skyGrad: ["#0f172a", "#1e293b", "#334155"],
    floorColor: "#1e3a1e",
    rimColor: "#4ade80",
  },
  budokai: {
    planet: "/dbz/planets/tierra.webp",
    skyGrad: ["#1e1b4b", "#312e81", "#4338ca"],
    floorColor: "#cbd5e1",
    rimColor: "#94a3b8",
  },
  wasteland: {
    planet: "/dbz/planets/tierra.webp",
    skyGrad: ["#451a03", "#78350f", "#b45309"],
    floorColor: "#78350f",
    rimColor: "#f59e0b",
  },
  namek: {
    planet: "/dbz/planets/namek.webp",
    skyGrad: ["#064e3b", "#065f46", "#047857"],
    floorColor: "#14532d",
    rimColor: "#22c55e",
  },
  cell_games: {
    planet: "/dbz/planets/tierra.webp",
    skyGrad: ["#18181b", "#27272a", "#3f3f46"],
    floorColor: "#475569",
    rimColor: "#94a3b8",
  },
  kaiohshin: {
    planet: "/dbz/planets/planeta-sagrado.webp",
    skyGrad: ["#4a044e", "#701a75", "#86198f"],
    floorColor: "#3b0764",
    rimColor: "#c084fc",
  },
};

/**
 * Authentic Japanese Manga Onomatopoeias.
 */
interface MangaSfxParticle {
  id: number;
  text: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  scale: number;
  rotation: number;
  alpha: number;
  color: string;
  stroke: string;
  life: number;
  maxLife: number;
}

/**
 * Zanzōken (Afterimage) trail snapshot.
 */
interface AfterimageSnapshot {
  x: number;
  y: number;
  facing: number;
  img: HTMLImageElement | null;
  alpha: number;
  auraColor: string;
}

/**
 * Manga Koma Cut-in State for Super Attacks.
 */
interface MangaCutInState {
  active: boolean;
  fighterId: FighterId;
  attackNameJa: string;
  attackNameFr: string;
  color: string;
  timer: number;
  duration: number;
}

const KEYS: Record<string, keyof GameInput> = {
  ArrowLeft: "left",
  ArrowRight: "right",
  q: "left",
  d: "right",
  " ": "jump",
  j: "punch",
  k: "blast",
  l: "charge",
  t: "transform",
  i: "guard",
  u: "vanish",
  o: "special",
  m: "mash",
  r: "sparking",
  R: "sparking",
  v: "dimensionSwitch",
  V: "dimensionSwitch",
};

export default function DragonPixelGame() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [mode] = useState<GameMode>("story");
  const [selectedFighter, setSelectedFighter] = useState<FighterId>("goku");
  const [selectedChapter, setSelectedChapter] = useState(1);
  const [isPlaying] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [inDialogue, setInDialogue] = useState(true);
  const [dialogueIndex, setDialogueIndex] = useState(0);
  const [gameStatus, setGameStatus] = useState<"playing" | "won" | "lost">("playing");
  const [explosionKey, setExplosionKey] = useState(0);
  const [explosionColor, setExplosionColor] = useState<KiColorStyle>("gold");

  const gameStateRef = useRef<GameState>(createGame(selectedFighter, mode, selectedChapter));
  const heldKeysRef = useRef<Set<keyof GameInput>>(new Set());
  const lastTimeRef = useRef<number>(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioBuffersRef = useRef<Map<string, AudioBuffer>>(new Map());
  const chargeSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const chargeGainRef = useRef<GainNode | null>(null);
  const imagesRef = useRef<Map<string, HTMLImageElement>>(new Map());

  // Visual enhancement state
  const onomatopoeiaRef = useRef<MangaSfxParticle[]>([]);
  const nextParticleIdRef = useRef(1);
  const playerTrailsRef = useRef<AfterimageSnapshot[]>([]);
  const enemyTrailsRef = useRef<AfterimageSnapshot[]>([]);
  const cutInRef = useRef<MangaCutInState>({
    active: false,
    fighterId: "goku",
    attackNameJa: "",
    attackNameFr: "",
    color: "#00b4d8",
    timer: 0,
    duration: 0.65,
  });
  const screenFlashRef = useRef<number>(0);

  // Helper de cache et chargement d'image
  const getImage = useCallback((src: string): HTMLImageElement | null => {
    let img = imagesRef.current.get(src);
    if (!img) {
      img = new Image();
      img.src = src;
      imagesRef.current.set(src, img);
    }
    return img.complete && img.naturalWidth > 0 ? img : null;
  }, []);

  // Preload all high-definition Toriyama artwork & backdrops
  useEffect(() => {
    const allUrls = [
      ...Object.values(CHARACTER_FULL_ASSETS),
      ...Object.values(TRANSFORMATION_FULL_ASSETS),
      ...Object.values(PORTRAIT_ASSETS),
      ...Object.values(ARENA_BACKDROPS).map((a) => a.planet),
    ];
    for (const url of allUrls) {
      const img = new Image();
      img.src = url;
      imagesRef.current.set(url, img);
    }
  }, []);

  // Initialize and preload official Toei/Dimps Audio Pipeline
  useEffect(() => {
    const soundUrls: Record<string, string> = {
      punch: "/sfx/official/punch.mp3",
      hit: "/sfx/official/hit.mp3",
      charge: "/sfx/official/ki-charge.mp3",
      powerup: "/sfx/official/power-up.mp3",
      teleport: "/sfx/official/teleport.mp3",
      final_flash: "/sfx/official/final-flash.mp3",
      kamehameha: "/sfx/kamehameha.mp3",
      kamehameha_wave: "/sfx/kamehameha-wave.mp3",
      galick: "/sfx/galick.mp3",
      scream: "/sfx/official/scream.mp3",
      explosion: "/sfx/explosion.mp3",
      kaioken: "/sfx/kaioken.mp3",
      ultra_instinct: "/sfx/ultra-instinct.mp3",
      whoosh: "/sfx/whoosh.mp3",
    };

    const getAudioCtx = () => {
      if (!audioContextRef.current && typeof window !== "undefined") {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        audioContextRef.current = new AudioCtx();
      }
      return audioContextRef.current;
    };

    const loadSounds = async () => {
      const ctx = getAudioCtx();
      if (!ctx) return;

      for (const [key, url] of Object.entries(soundUrls)) {
        try {
          const res = await fetch(url);
          const buf = await res.arrayBuffer();
          const decoded = await ctx.decodeAudioData(buf);
          audioBuffersRef.current.set(key, decoded);
        } catch {
          // Fallback transparent si un fichier est indisponible
        }
      }
    };

    loadSounds();
  }, []);

  // Production-grade sound trigger with dynamic pitch & zero-latency Web Audio buffers
  const playSound = useCallback((key: string, rateVariation = true) => {
    try {
      const ctx = audioContextRef.current;
      if (!ctx) return;
      if (ctx.state === "suspended") {
        ctx.resume();
      }

      const buffer = audioBuffersRef.current.get(key);
      if (buffer) {
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        if (rateVariation) {
          source.playbackRate.value = 0.96 + Math.random() * 0.08;
        }
        const gain = ctx.createGain();
        gain.gain.value = 0.6;
        source.connect(gain);
        gain.connect(ctx.destination);
        source.start(0);
        return;
      }

      // Synthétiseur d'appoint haute fidélité si le buffer n'est pas encore décodé
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      const now = ctx.currentTime;
      if (key === "punch" || key === "hit") {
        osc.type = "triangle";
        osc.frequency.setValueAtTime(180, now);
        osc.frequency.exponentialRampToValueAtTime(45, now + 0.12);
        gain.gain.setValueAtTime(0.4, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.12);
        osc.start(now);
        osc.stop(now + 0.12);
      } else if (key === "teleport") {
        osc.type = "sine";
        osc.frequency.setValueAtTime(920, now);
        osc.frequency.exponentialRampToValueAtTime(200, now + 0.15);
        gain.gain.setValueAtTime(0.35, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.15);
        osc.start(now);
        osc.stop(now + 0.15);
      } else if (key === "explosion" || key === "final_flash") {
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(140, now);
        osc.frequency.exponentialRampToValueAtTime(30, now + 0.4);
        gain.gain.setValueAtTime(0.5, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.4);
        osc.start(now);
        osc.stop(now + 0.4);
      }
    } catch {
      // Audio silencieux si bloqué
    }
  }, []);

  // Ki Charge loop management
  const updateChargeAudio = useCallback((isCharging: boolean) => {
    try {
      const ctx = audioContextRef.current;
      if (!ctx) return;
      if (ctx.state === "suspended") ctx.resume();

      if (isCharging) {
        if (!chargeSourceRef.current) {
          const buffer = audioBuffersRef.current.get("charge");
          if (buffer) {
            const src = ctx.createBufferSource();
            src.buffer = buffer;
            src.loop = true;
            const gain = ctx.createGain();
            gain.gain.setValueAtTime(0.01, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.45, ctx.currentTime + 0.2);
            src.connect(gain);
            gain.connect(ctx.destination);
            src.start(0);
            chargeSourceRef.current = src;
            chargeGainRef.current = gain;
          }
        }
      } else if (chargeSourceRef.current && chargeGainRef.current) {
        const gain = chargeGainRef.current;
        gain.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 0.15);
        setTimeout(() => {
          try {
            chargeSourceRef.current?.stop();
            chargeSourceRef.current?.disconnect();
          } catch {
            // Already disconnected
          }
          chargeSourceRef.current = null;
          chargeGainRef.current = null;
        }, 160);
      }
    } catch {
      // Fallback
    }
  }, []);

  // Spawn Japanese Manga Onomatopoeia Particle
  const spawnOnomatopoeia = useCallback(
    (text: string, x: number, y: number, color = "#ffeb3b", stroke = "#000000") => {
      const id = nextParticleIdRef.current++;
      const p: MangaSfxParticle = {
        id,
        text,
        x: x + (Math.random() - 0.5) * 40,
        y: y - 20 + (Math.random() - 0.5) * 30,
        vx: (Math.random() - 0.5) * 60,
        vy: -120 - Math.random() * 80,
        scale: 1.5,
        rotation: (Math.random() - 0.5) * 0.35,
        alpha: 1.0,
        color,
        stroke,
        life: 0.55,
        maxLife: 0.55,
      };
      onomatopoeiaRef.current.push(p);
      if (onomatopoeiaRef.current.length > 20) {
        onomatopoeiaRef.current.shift();
      }
    },
    [],
  );

  // Trigger dramatic Manga Koma Cut-in
  const triggerMangaCutIn = useCallback(
    (fighterId: FighterId, attackNameJa: string, attackNameFr: string, color = "#00b4d8") => {
      cutInRef.current = {
        active: true,
        fighterId,
        attackNameJa,
        attackNameFr,
        color,
        timer: 0,
        duration: 0.65,
      };
      screenFlashRef.current = 1.0;
      playSound("kamehameha", false);
    },
    [playSound],
  );

  // Rendu de l'arrière-plan avec planète céleste et dégradé atmosphérique
  const drawArena = useCallback(
    (ctx: CanvasRenderingContext2D, arena: ArenaId) => {
      const stage = ARENA_BACKDROPS[arena] ?? ARENA_BACKDROPS.paozu;

      // 1. Dégradé atmosphérique du ciel
      const grad = ctx.createLinearGradient(0, 0, 0, 580);
      grad.addColorStop(0, stage.skyGrad[0]);
      grad.addColorStop(0.65, stage.skyGrad[1]);
      grad.addColorStop(1, stage.skyGrad[2]);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 1280, 720);

      // 2. Planète céleste flottante
      const planetImg = getImage(stage.planet);
      if (planetImg) {
        ctx.save();
        ctx.globalAlpha = 0.5;
        const pSize = 300;
        const floatY = Math.sin(Date.now() * 0.0008) * 12;
        ctx.drawImage(planetImg, 1280 - pSize - 60, 40 + floatY, pSize, pSize);
        ctx.restore();
      }

      // 3. Sol d'arène fidèle et lignes de fuite
      ctx.fillStyle = stage.floorColor;
      ctx.fillRect(0, 570, 1280, 150);

      // Bordure supérieure lumineuse du sol
      ctx.fillStyle = stage.rimColor;
      ctx.fillRect(0, 570, 1280, 8);

      // Dalles pour Budokai / Cell Games
      if (arena === "budokai" || arena === "cell_games") {
        ctx.strokeStyle = stage.rimColor;
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.4;
        for (let x = 0; x < 1280; x += 80) {
          ctx.strokeRect(x, 578, 80, 142);
        }
        ctx.globalAlpha = 1.0;
      }
    },
    [getImage],
  );

  // Rendu des traînées d'après-image (Zanzōken)
  const drawAfterimages = useCallback(
    (ctx: CanvasRenderingContext2D, trails: AfterimageSnapshot[]) => {
      for (const t of trails) {
        if (!t.img || t.alpha <= 0.05) continue;
        ctx.save();
        ctx.translate(t.x, t.y);
        if (t.facing < 0) ctx.scale(-1, 1);
        ctx.globalAlpha = t.alpha * 0.4;

        // Silhouette lumineuse aux teintes de l'aura
        ctx.shadowColor = t.auraColor;
        ctx.shadowBlur = 18;

        const targetHeight = 175;
        const targetWidth = (t.img.naturalWidth / t.img.naturalHeight) * targetHeight;
        ctx.drawImage(t.img, -targetWidth / 2, -targetHeight, targetWidth, targetHeight);
        ctx.restore();
      }
    },
    [],
  );

  // Rendu haute fidélité d'un combattant (Artwork complet, Cel-Shading et Auras animées)
  const drawFighterSprite = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      x: number,
      y: number,
      facing: number,
      fighterId: FighterId,
      transformed: number,
      isGuarding: boolean,
      isCharging: boolean,
      trails: AfterimageSnapshot[],
    ) => {
      ctx.save();
      ctx.translate(x, y);

      if (facing < 0) {
        ctx.scale(-1, 1);
      }

      const isSuperSaiyan = transformed > 0;
      const def = FIGHTERS[fighterId] ?? FIGHTERS.goku;

      // Ombre portée dynamique au sol
      ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
      ctx.beginPath();
      ctx.ellipse(0, 0, 48, 12, 0, 0, Math.PI * 2);
      ctx.fill();

      // Palette d'aura selon la forme
      const auraColor =
        isSuperSaiyan && fighterId === "goku"
          ? "#ffd700"
          : isSuperSaiyan && fighterId === "gohan"
            ? "#ffd700"
            : isSuperSaiyan && fighterId === "vegeta"
              ? "#f72585"
              : isCharging
                ? "#00f5d4"
                : isSuperSaiyan
                  ? "#ffd700"
                  : "#ffffff";

      // Rendu de l'aura vivante aux flammes polygonales
      if (isCharging || isSuperSaiyan) {
        ctx.save();
        ctx.strokeStyle = auraColor;
        ctx.lineWidth = isSuperSaiyan ? 5 : 3;
        ctx.shadowColor = auraColor;
        ctx.shadowBlur = isSuperSaiyan ? 32 : 18;

        // Flamme externe d'énergie
        ctx.beginPath();
        for (let i = 0; i < 16; i++) {
          const ang = (i / 16) * Math.PI * 2;
          const rad = 65 + Math.sin(Date.now() * 0.02 + i * 1.4) * 16;
          const ax = Math.cos(ang) * rad;
          const ay = -95 + Math.sin(ang) * rad * 1.4;
          if (i === 0) ctx.moveTo(ax, ay);
          else ctx.lineTo(ax, ay);
        }
        ctx.closePath();
        ctx.stroke();

        // Cœur blanc de l'aura
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < 12; i++) {
          const ang = (i / 12) * Math.PI * 2;
          const rad = 45 + Math.sin(Date.now() * 0.025 + i * 1.8) * 10;
          const ax = Math.cos(ang) * rad;
          const ay = -95 + Math.sin(ang) * rad * 1.3;
          if (i === 0) ctx.moveTo(ax, ay);
          else ctx.lineTo(ax, ay);
        }
        ctx.closePath();
        ctx.stroke();

        // Éclairs SSJ2 / SSJ3 / Forme Parfaite
        if (isSuperSaiyan) {
          ctx.strokeStyle = "#a5f3fc";
          ctx.lineWidth = 3;
          ctx.beginPath();
          const t = Date.now() * 0.04;
          ctx.moveTo(-45 + Math.sin(t) * 22, -150);
          ctx.lineTo(-20, -100);
          ctx.lineTo(-50, -55);
          ctx.stroke();

          ctx.beginPath();
          ctx.moveTo(35 + Math.cos(t) * 20, -140);
          ctx.lineTo(15, -85);
          ctx.lineTo(40, -40);
          ctx.stroke();
        }
        ctx.restore();
      }

      // Bouclier d'énergie de garde
      if (isGuarding) {
        ctx.save();
        ctx.fillStyle = "rgba(0, 180, 216, 0.4)";
        ctx.strokeStyle = "#00b4d8";
        ctx.lineWidth = 4.5;
        ctx.shadowColor = "#00b4d8";
        ctx.shadowBlur = 24;
        ctx.beginPath();
        ctx.arc(25, -90, 85, -Math.PI / 2, Math.PI / 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }

      // Artwork officiel Toriyama haute définition
      const assetPath = isSuperSaiyan
        ? TRANSFORMATION_FULL_ASSETS[fighterId] || CHARACTER_FULL_ASSETS[fighterId]
        : CHARACTER_FULL_ASSETS[fighterId];
      const img = getImage(assetPath);

      if (img) {
        ctx.save();
        const targetHeight = 175;
        const targetWidth = (img.naturalWidth / img.naturalHeight) * targetHeight;
        // Animation subtile de respiration
        const floatY = Math.sin(Date.now() * 0.005) * 3;

        // Enregistrement pour Zanzōken
        if (trails.length === 0 || Math.hypot(trails[0].x - x, trails[0].y - y) > 20) {
          trails.unshift({
            x,
            y,
            facing,
            img,
            alpha: 0.7,
            auraColor,
          });
          if (trails.length > 4) trails.pop();
        }

        // Contour encré manga façon Akira Toriyama
        ctx.shadowColor = "#000000";
        ctx.shadowBlur = 8;
        ctx.drawImage(img, -targetWidth / 2, -targetHeight + floatY, targetWidth, targetHeight);
        ctx.restore();
      } else {
        ctx.fillStyle = isSuperSaiyan ? "#ffb703" : def.themeColor;
        ctx.fillRect(-28, -150, 56, 150);
      }

      ctx.restore();
    },
    [getImage],
  );

  // Rendu du Koma Cut-In manga dramatique
  const drawMangaCutIn = useCallback(
    (ctx: CanvasRenderingContext2D) => {
      const cut = cutInRef.current;
      if (!cut.active) return;

      ctx.save();
      // 1. Assombrissement du reste de l'écran avec lignes de vitesse radiales
      ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
      ctx.fillRect(0, 0, 1280, 720);

      // 2. Panneau manga diagonal tranchant l'écran
      ctx.beginPath();
      ctx.moveTo(0, 220);
      ctx.lineTo(1280, 290);
      ctx.lineTo(1280, 510);
      ctx.lineTo(0, 440);
      ctx.closePath();
      ctx.save();
      ctx.clip();

      // Fond de trame manga avec dégradé d'énergie
      const grad = ctx.createLinearGradient(0, 220, 1280, 510);
      grad.addColorStop(0, "#09090b");
      grad.addColorStop(0.5, cut.color);
      grad.addColorStop(1, "#09090b");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 220, 1280, 290);

      // Lignes de vitesse manga (Shūchū-sen)
      ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
      ctx.lineWidth = 3;
      for (let i = 0; i < 40; i++) {
        const lx = Math.random() * 1280;
        ctx.beginPath();
        ctx.moveTo(lx, 220);
        ctx.lineTo(640 + (lx - 640) * 0.4, 365);
        ctx.stroke();
      }

      // Portrait gros plan du visage / yeux
      const portrait = getImage(PORTRAIT_ASSETS[cut.fighterId]);
      if (portrait) {
        ctx.drawImage(portrait, 140, 240, 240, 240);
      }

      // Calligraphie japonaise de la technique en lettres géantes
      ctx.font = "900 64px 'Impact', 'Noto Sans JP', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 10;
      ctx.strokeText(cut.attackNameJa, 740, 355);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(cut.attackNameJa, 740, 355);

      // Sous-titre officiel en français
      ctx.font = "700 24px 'Impact', sans-serif";
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 5;
      ctx.strokeText(`« ${cut.attackNameFr} »`, 740, 420);
      ctx.fillStyle = "#fbbf24";
      ctx.fillText(`« ${cut.attackNameFr} »`, 740, 420);

      ctx.restore();

      // Bordure dorée du panneau manga
      ctx.strokeStyle = "#f59e0b";
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(0, 220);
      ctx.lineTo(1280, 290);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, 440);
      ctx.lineTo(1280, 510);
      ctx.stroke();

      ctx.restore();
    },
    [getImage],
  );

  // Rendu des onomatopées japonaises animées
  const drawOnomatopoeias = useCallback((ctx: CanvasRenderingContext2D) => {
    for (const p of onomatopoeiaRef.current) {
      if (p.life <= 0) continue;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.scale(p.scale, p.scale);
      ctx.globalAlpha = p.alpha;

      ctx.font = "900 48px 'Impact', 'Noto Sans JP', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      // Contour noir épais Toriyama
      ctx.strokeStyle = p.stroke;
      ctx.lineWidth = 6;
      ctx.strokeText(p.text, 0, 0);

      // Remplissage éclatant
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, 0, 0);

      ctx.restore();
    }
  }, []);

  // Rendu complet du canvas à 60 FPS
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const g = gameStateRef.current;

    // Mise à l'échelle pour 1280x720 natif
    const scaleX = 1280 / 960;
    const scaleY = 720 / 400;

    ctx.save();

    // Tremblement de caméra dynamique
    if (g.screenShake > 0) {
      const sx = (Math.random() - 0.5) * g.screenShake * 6;
      const sy = (Math.random() - 0.5) * g.screenShake * 6;
      ctx.translate(sx, sy);
    }

    ctx.clearRect(0, 0, 1280, 720);

    // 1. Arène & Sol
    drawArena(ctx, g.arena);

    // 2. Traînées de vitesse (Zanzōken)
    drawAfterimages(ctx, playerTrailsRef.current);
    drawAfterimages(ctx, enemyTrailsRef.current);

    // 3. Combattant Joueur
    const p = g.player;
    const isCharging = heldKeysRef.current.has("charge");
    drawFighterSprite(
      ctx,
      p.x * scaleX,
      p.y * scaleY,
      p.facing,
      p.fighterId,
      p.transformed,
      p.guarding,
      isCharging,
      playerTrailsRef.current,
    );

    // 4. Ennemis / Boss
    for (const e of g.enemies) {
      drawFighterSprite(
        ctx,
        e.x * scaleX,
        e.y * scaleY,
        e.facing ?? -1,
        e.fighterId ?? "piccolo",
        e.formLevel ?? 0,
        e.guarding ?? false,
        false,
        enemyTrailsRef.current,
      );
    }

    // 5. Kikōha & Rayons d'énergie géants
    for (const s of g.shots) {
      ctx.save();
      const sx = s.x * scaleX;
      const sy = s.y * scaleY;
      ctx.fillStyle = s.color || "#00b4d8";
      ctx.shadowColor = s.color || "#00b4d8";
      ctx.shadowBlur = s.isBeam ? 36 : 14;

      if (s.isBeam) {
        const bWidth = (s.width || 180) * scaleX;
        const bHeight = (s.height || 36) * scaleY;
        const bx = s.vx > 0 ? sx - bWidth : sx;
        ctx.fillRect(bx, sy - bHeight / 2, bWidth, bHeight);

        // Cœur blanc de pure énergie
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(bx, sy - bHeight / 4, bWidth, bHeight / 2);
      } else {
        ctx.beginPath();
        ctx.arc(sx, sy, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(sx, sy, 7, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // 6. Choc de Kikōha (Beam Clash)
    if (g.clash && g.clash.active) {
      ctx.save();
      const cx = g.clash.x * scaleX;
      const cy = g.clash.y * scaleY;

      const grad = ctx.createRadialGradient(cx, cy, 10, cx, cy, 90);
      grad.addColorStop(0, "#ffffff");
      grad.addColorStop(0.35, "#00f5d4");
      grad.addColorStop(0.7, "#ff007f");
      grad.addColorStop(1, "transparent");

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, 90, 0, Math.PI * 2);
      ctx.fill();

      // Éclairs de tension
      for (let i = 0; i < 12; i++) {
        const ang = Math.random() * Math.PI * 2;
        const len = 45 + Math.random() * 55;
        ctx.strokeStyle = Math.random() > 0.5 ? "#00f5d4" : "#ff007f";
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(ang) * len, cy + Math.sin(ang) * len);
        ctx.stroke();
      }
      ctx.restore();
    }

    // 7. Onomatopées japonaises animées
    drawOnomatopoeias(ctx);

    // 8. Manga Koma Cut-in en surimpression
    drawMangaCutIn(ctx);

    // 9. Écran de flash lumineux
    if (screenFlashRef.current > 0.05) {
      ctx.fillStyle = `rgba(255, 255, 255, ${screenFlashRef.current * 0.75})`;
      ctx.fillRect(0, 0, 1280, 720);
    }

    // 10. HUD Haute Définition style Dragon Ball FighterZ
    const enemy = g.enemies[0];
    const enemyDef = enemy ? (FIGHTERS[enemy.fighterId ?? "piccolo"] ?? FIGHTERS.piccolo) : null;
    const chap = STORY_CHAPTERS[selectedChapter - 1] ?? STORY_CHAPTERS[0];

    // Badge de chapitre et Multiverse Dimension au centre
    const m = g.multiverse;
    const dimConfig: Record<
      MultiverseDimension,
      { label: string; game: string; color: string; perk: string }
    > = {
      xenoverse: {
        label: "DIMENSION: XENOVERSE 2",
        game: "Dimps Engine",
        color: "#10b981",
        perk: "Stamina & Z-Vanish [U]",
      },
      fighterz: {
        label: "DIMENSION: FIGHTERZ",
        game: "ArcSys Engine",
        color: "#f59e0b",
        perk: "Sparking Blast [R]",
      },
      butoden: {
        label: "DIMENSION: SUPER BUTŌDEN",
        game: "Super Famicom 16-bit",
        color: "#ec4899",
        perk: "Desperation Mode (<30% HP)",
      },
      tenkaichi: {
        label: "DIMENSION: BUDOKAI TENKAICHI",
        game: "Spike Chunsoft Engine",
        color: "#38bdf8",
        perk: "Max Power Mode (Ki Overcharge)",
      },
      legend: {
        label: "DIMENSION: THE LEGEND",
        game: "Tose / BEC 1996",
        color: "#a855f7",
        perk: "Power Balance Meteor Smash",
      },
    };
    const activeDim = dimConfig[m.dimension];

    ctx.save();
    // 1. Titre du Chapitre
    ctx.fillStyle = "rgba(15, 23, 42, 0.9)";
    ctx.strokeStyle = "#f59e0b";
    ctx.lineWidth = 2;
    ctx.fillRect(460, 14, 360, 32);
    ctx.strokeRect(460, 14, 360, 32);
    ctx.font = "800 13px 'Noto Sans JP', sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = "#f59e0b";
    ctx.fillText(`${chap.saga} • ${chap.titleJa}`, 640, 34);

    // 2. Badge Multiverse Dimension
    ctx.fillStyle = "rgba(10, 15, 30, 0.92)";
    ctx.strokeStyle = activeDim.color;
    ctx.lineWidth = 2;
    ctx.fillRect(440, 50, 400, 28);
    ctx.strokeRect(440, 50, 400, 28);

    ctx.font = "900 11px 'Impact', 'Noto Sans JP', sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = activeDim.color;
    ctx.fillText(`${activeDim.label} ✦ ${activeDim.perk}`, 640, 68);
    ctx.restore();

    // Jauge Joueur (Haut Gauche)
    ctx.save();
    ctx.fillStyle = "rgba(15, 23, 42, 0.92)";
    ctx.fillRect(24, 16, 360, 84);
    ctx.strokeStyle = activeDim.color;
    ctx.lineWidth = 2.5;
    ctx.strokeRect(24, 16, 360, 84);

    // Barre de Vie Joueur
    const hpRatio = Math.max(0, Math.min(1, p.hp / (p.maxHp || 100)));
    ctx.fillStyle = "#1e293b";
    ctx.fillRect(100, 26, 268, 18);
    ctx.fillStyle = hpRatio > 0.3 ? "#22c55e" : "#ef4444";
    ctx.fillRect(100, 26, 268 * hpRatio, 18);

    // Barre de Ki Joueur
    const kiRatio = Math.max(0, Math.min(1, p.energy / (p.maxEnergy || 100)));
    ctx.fillStyle = "#1e293b";
    ctx.fillRect(100, 48, 268, 12);
    ctx.fillStyle = m.maxPowerActive ? "#facc15" : "#0284c7";
    ctx.fillRect(100, 48, 268 * kiRatio, 12);

    // Barre d'Endurance (Stamina)
    const staRatio = Math.max(0, Math.min(1, m.stamina / (m.maxStamina || 100)));
    ctx.fillStyle = "#1e293b";
    ctx.fillRect(100, 64, 268, 8);
    ctx.fillStyle = "#10b981";
    ctx.fillRect(100, 64, 268 * staRatio, 8);

    // Badges d'état Multiverse
    if (m.sparkingActive) {
      ctx.font = "900 11px 'Impact', sans-serif";
      ctx.fillStyle = "#f59e0b";
      ctx.fillText(`★ SPARKING: ${m.sparkingTimer.toFixed(1)}s`, 100, 88);
    } else if (m.maxPowerActive) {
      ctx.font = "900 11px 'Impact', sans-serif";
      ctx.fillStyle = "#facc15";
      ctx.fillText(`★ MAX POWER: ${m.maxPowerTimer.toFixed(1)}s`, 100, 88);
    } else if (m.dimension === "butoden" && p.hp < p.maxHp * 0.3) {
      ctx.font = "900 11px 'Impact', sans-serif";
      ctx.fillStyle = "#ef4444";
      ctx.fillText("⚠ DESPERATION MODE x1.5", 100, 88);
    } else {
      ctx.font = "700 10px monospace";
      ctx.fillStyle = "#94a3b8";
      ctx.fillText(`KI: ${Math.round(p.energy)}% • STM: ${Math.round(m.stamina)}%`, 100, 88);
    }

    // Portrait Joueur
    const pThumb = getImage(PORTRAIT_ASSETS[p.fighterId]);
    if (pThumb) {
      ctx.drawImage(pThumb, 30, 22, 60, 60);
    }
    ctx.restore();

    // Jauge Boss (Haut Droite)
    if (enemy && enemyDef) {
      ctx.save();
      ctx.fillStyle = "rgba(15, 23, 42, 0.92)";
      ctx.fillRect(896, 16, 360, 84);
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = 2.5;
      ctx.strokeRect(896, 16, 360, 84);

      const eHpRatio = Math.max(0, Math.min(1, enemy.hp / (enemy.maxHp || 100)));
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(912, 26, 268, 18);
      ctx.fillStyle = "#ef4444";
      ctx.fillRect(912, 26, 268 * eHpRatio, 18);

      // Nom du boss
      ctx.font = "800 12px 'Noto Sans JP', sans-serif";
      ctx.fillStyle = "#fca5a5";
      ctx.fillText(enemyDef.nameJa || enemyDef.name, 912, 58);

      const eThumb = getImage(PORTRAIT_ASSETS[enemy.fighterId ?? "piccolo"]);
      if (eThumb) {
        ctx.drawImage(eThumb, 1188, 22, 60, 60);
      }
      ctx.restore();
    }

    // Jauge The Legend: Power Balance Tug-of-War (Bas Centre)
    if (m.dimension === "legend") {
      ctx.save();
      const pbX = 420;
      const pbY = 650;
      const pbW = 440;
      const pbH = 22;

      ctx.fillStyle = "rgba(10, 15, 30, 0.95)";
      ctx.fillRect(pbX, pbY, pbW, pbH);
      ctx.strokeStyle = "#a855f7";
      ctx.lineWidth = 2.5;
      ctx.strokeRect(pbX, pbY, pbW, pbH);

      // Séparation 50/50 Joueur (Bleu) / Ennemi (Rouge)
      const mid = pbX + pbW / 2;
      const balanceShift = (m.powerBalance / 100) * (pbW / 2);

      // Barre joueur
      ctx.fillStyle = "#0284c7";
      ctx.fillRect(pbX + 2, pbY + 2, pbW / 2 - 2, pbH - 4);
      // Barre ennemi
      ctx.fillStyle = "#dc2626";
      ctx.fillRect(mid, pbY + 2, pbW / 2 - 2, pbH - 4);

      // Curseur dynamique de domination
      const cursorX = mid + balanceShift;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(cursorX - 4, pbY - 3, 8, pbH + 6);

      ctx.font = "900 11px 'Impact', sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = "#f8fafc";
      ctx.shadowColor = "#000000";
      ctx.shadowBlur = 4;
      ctx.fillText(`POWER BALANCE: ${Math.round(m.powerBalance)}% • METEOR SMASH AT 100%`, 640, pbY + 16);
      ctx.restore();
    }

    // Guide de touches arcade discret (Bas)
    if (!inDialogue && isPlaying && gameStatus === "playing") {
      ctx.save();
      ctx.font = "600 11px monospace";
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(255, 255, 255, 0.55)";
      ctx.fillText(
        "Q/D: Move • ESPACE: Saut • J: Coup • K: Kikōha • L: Ki • I: Garde • U: Vanish • O: Spécial • T: Éveil • R: Sparking • TAB/V: Dimension",
        640,
        708,
      );
      ctx.restore();
    }

    // 11. Dialogue Manga Intégré Directement dans le Canvas
    if (inDialogue && isPlaying) {
      const currentDialogue =
        gameStatus === "won"
          ? chap.victoryDialogue[dialogueIndex]
          : chap.introDialogue[dialogueIndex];

      if (currentDialogue) {
        ctx.save();
        const boxX = 80;
        const boxY = 560;
        const boxW = 1120;
        const boxH = 135;

        // Cadre de bulle de manga avec fond noir et bordure dorée
        ctx.fillStyle = "rgba(9, 9, 11, 0.95)";
        ctx.fillRect(boxX, boxY, boxW, boxH);
        ctx.strokeStyle = "#f59e0b";
        ctx.lineWidth = 3.5;
        ctx.strokeRect(boxX, boxY, boxW, boxH);

        // Nom du locuteur
        ctx.font = "900 18px 'Noto Sans JP', sans-serif";
        ctx.fillStyle = "#f59e0b";
        ctx.fillText(`【 ${currentDialogue.speaker.toUpperCase()} 】`, boxX + 28, boxY + 36);

        // Texte du dialogue
        ctx.font = "500 20px serif";
        ctx.fillStyle = "#f8fafc";
        ctx.fillText(`« ${currentDialogue.text} »`, boxX + 28, boxY + 76);

        // Invite pour continuer
        ctx.font = "800 14px 'Noto Sans JP', sans-serif";
        ctx.fillStyle = "#94a3b8";
        ctx.textAlign = "right";
        ctx.fillText("▶ Appuyez sur Espace ou Touchez l'écran pour continuer", boxX + boxW - 28, boxY + 115);

        ctx.restore();
      }
    }

    ctx.restore();
  }, [
    drawArena,
    drawAfterimages,
    drawFighterSprite,
    drawOnomatopoeias,
    drawMangaCutIn,
    getImage,
    selectedChapter,
    inDialogue,
    isPlaying,
    gameStatus,
    dialogueIndex,
  ]);

  // Boucle de simulation et d'animation à 60 FPS
  useEffect(() => {
    let animId: number;

    const gameLoop = (timestamp: number) => {
      if (!lastTimeRef.current) lastTimeRef.current = timestamp;
      const dt = Math.min(0.033, (timestamp - lastTimeRef.current) / 1000);
      lastTimeRef.current = timestamp;

      // Mise à jour des particules d'onomatopées
      for (const p of onomatopoeiaRef.current) {
        p.life -= dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.alpha = Math.max(0, p.life / p.maxLife);
        p.scale = 1.0 + (p.life / p.maxLife) * 0.4;
      }
      onomatopoeiaRef.current = onomatopoeiaRef.current.filter((p) => p.life > 0);

      // Traînées Zanzōken
      for (const t of playerTrailsRef.current) t.alpha -= dt * 1.8;
      for (const t of enemyTrailsRef.current) t.alpha -= dt * 1.8;
      playerTrailsRef.current = playerTrailsRef.current.filter((t) => t.alpha > 0.05);
      enemyTrailsRef.current = enemyTrailsRef.current.filter((t) => t.alpha > 0.05);

      // Manga Koma Cut-in timer
      if (cutInRef.current.active) {
        cutInRef.current.timer += dt;
        if (cutInRef.current.timer >= cutInRef.current.duration) {
          cutInRef.current.active = false;
        }
      }

      // Flash fondu
      if (screenFlashRef.current > 0) {
        screenFlashRef.current = Math.max(0, screenFlashRef.current - dt * 3.5);
      }

      // Simulation combat
      if (isPlaying && !isPaused && !inDialogue && gameStatus === "playing") {
        const input: GameInput = {
          left: heldKeysRef.current.has("left"),
          right: heldKeysRef.current.has("right"),
          jump: heldKeysRef.current.has("jump"),
          punch: heldKeysRef.current.has("punch"),
          blast: heldKeysRef.current.has("blast"),
          charge: heldKeysRef.current.has("charge"),
          transform: heldKeysRef.current.has("transform"),
          guard: heldKeysRef.current.has("guard"),
          vanish: heldKeysRef.current.has("vanish"),
          special: heldKeysRef.current.has("special"),
          mash: heldKeysRef.current.has("mash"),
        };

        updateChargeAudio(!!input.charge);

        const prevPlayerHp = gameStateRef.current.player.hp;
        const prevEnemiesHp = gameStateRef.current.enemies.map((e) => e.hp);

        // Déclenchement de Super Attaque
        if (input.special && gameStateRef.current.player.energy >= 40 && !cutInRef.current.active) {
          triggerMangaCutIn(
            selectedFighter,
            selectedFighter === "vegeta" ? "ファイナルフラッシュ!!" : "かめはめ波───ッ!!",
            selectedFighter === "vegeta" ? "FINAL FLASH" : "KAMEHAMEHA",
            selectedFighter === "vegeta" ? "#f59e0b" : "#00b4d8",
          );
        }

        // Déclenchement Sparking Blast (FighterZ)
        if (input.sparking && !gameStateRef.current.multiverse.sparkingActive) {
          playSound("power_up");
          spawnOnomatopoeia("スパーク!!", gameStateRef.current.player.x * 1.33, 500, "#f59e0b");
        }

        step(gameStateRef.current, input, dt);

        // Réception de dégâts joueur
        if (gameStateRef.current.player.hp < prevPlayerHp) {
          playSound("hit");
          spawnOnomatopoeia("ドゴォッ!!", gameStateRef.current.player.x * 1.33, 500, "#ef4444");
          setExplosionKey((k) => k + 1);
          setExplosionColor("gold");
        }

        // Dégâts infligés à l'ennemi
        for (let i = 0; i < gameStateRef.current.enemies.length; i++) {
          const e = gameStateRef.current.enemies[i];
          if (prevEnemiesHp[i] !== undefined && e.hp < prevEnemiesHp[i]) {
            playSound("punch");
            spawnOnomatopoeia("バキィッ!!", e.x * 1.33, 500, "#fbbf24");
          }
        }

        // Téléportation Z-Vanish
        if (input.vanish && gameStateRef.current.player.vanishCooldown > 0.7) {
          playSound("teleport");
          spawnOnomatopoeia("シュバッ!!", gameStateRef.current.player.x * 1.33, 520, "#38bdf8");
        }

        // Choc de Kikōha
        if (gameStateRef.current.clash?.active) {
          playSound("final_flash");
          setExplosionKey((k) => k + 1);
          setExplosionColor("cyan");
        }

        if (gameStateRef.current.player.hp <= 0) {
          setGameStatus("lost");
          updateChargeAudio(false);
        } else if (
          gameStateRef.current.enemies.length > 0 &&
          gameStateRef.current.enemies.every((e) => e.hp <= 0)
        ) {
          setGameStatus("won");
          setInDialogue(true);
          setDialogueIndex(0);
          updateChargeAudio(false);
        }
      }

      renderCanvas();
      animId = requestAnimationFrame(gameLoop);
    };

    animId = requestAnimationFrame(gameLoop);
    return () => {
      cancelAnimationFrame(animId);
      updateChargeAudio(false);
    };
  }, [
    isPlaying,
    isPaused,
    inDialogue,
    gameStatus,
    playSound,
    updateChargeAudio,
    spawnOnomatopoeia,
    triggerMangaCutIn,
    renderCanvas,
    selectedFighter,
  ]);

  const handleStartChapter = useCallback(
    (chapterId: number) => {
      setSelectedChapter(chapterId);
      gameStateRef.current = createGame(selectedFighter, "story", chapterId);
      setGameStatus("playing");
      setInDialogue(true);
      setDialogueIndex(0);
    },
    [selectedFighter],
  );

  const handleRestart = useCallback(() => {
    gameStateRef.current = createGame(selectedFighter, mode, selectedChapter);
    setGameStatus("playing");
    setInDialogue(true);
    setDialogueIndex(0);
  }, [selectedFighter, mode, selectedChapter]);

  const handleNextDialogue = useCallback(() => {
    const chap = STORY_CHAPTERS.find((c) => c.id === selectedChapter);
    if (!chap) return;
    const isIntro = gameStatus === "playing";
    const dialogueList = isIntro ? chap.introDialogue : chap.victoryDialogue;

    if (dialogueIndex + 1 < dialogueList.length) {
      setDialogueIndex((i) => i + 1);
    } else {
      setInDialogue(false);
      if (gameStatus === "won") {
        if (selectedChapter < 18) {
          handleStartChapter(selectedChapter + 1);
        } else {
          handleRestart();
        }
      }
    }
  }, [selectedChapter, gameStatus, dialogueIndex, handleStartChapter, handleRestart]);

  // Keyboard navigation & Gamepad polling
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (inDialogue && (e.key === " " || e.key === "Enter")) {
        e.preventDefault();
        handleNextDialogue();
        return;
      }
      if (gameStatus !== "playing" && (e.key === " " || e.key === "Enter")) {
        e.preventDefault();
        if (gameStatus === "won" && selectedChapter < 18) {
          handleStartChapter(selectedChapter + 1);
        } else {
          handleRestart();
        }
        return;
      }
      if (e.key === "Tab" || e.key === "v" || e.key === "V") {
        e.preventDefault();
        const dims: MultiverseDimension[] = ["xenoverse", "fighterz", "butoden", "tenkaichi", "legend"];
        const m = gameStateRef.current.multiverse;
        const idx = (dims.indexOf(m.dimension) + 1) % dims.length;
        m.dimension = dims[idx];
        gameStateRef.current.screenShake = 6;
        playSound("power_up");
        spawnOnomatopoeia("次元変革!!", 640, 200, "#38bdf8");
        return;
      }
      const action = KEYS[e.key];
      if (action) {
        heldKeysRef.current.add(action);
      }
      if (e.key === "Escape") {
        setIsPaused((p) => !p);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const action = KEYS[e.key];
      if (action) {
        heldKeysRef.current.delete(action);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [
    inDialogue,
    gameStatus,
    selectedChapter,
    handleNextDialogue,
    handleStartChapter,
    handleRestart,
    playSound,
    spawnOnomatopoeia,
  ]);

  // Click on screen advances dialogue or triggers attack
  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (inDialogue) {
        handleNextDialogue();
        return;
      }
      if (gameStatus !== "playing") {
        if (gameStatus === "won" && selectedChapter < 18) {
          handleStartChapter(selectedChapter + 1);
        } else {
          handleRestart();
        }
        return;
      }

      // Check if clicking top-center dimension badge
      const canvas = canvasRef.current;
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        const clickX = ((e.clientX - rect.left) / rect.width) * 1280;
        const clickY = ((e.clientY - rect.top) / rect.height) * 720;

        if (clickX >= 440 && clickX <= 840 && clickY >= 14 && clickY <= 82) {
          const dims: MultiverseDimension[] = ["xenoverse", "fighterz", "butoden", "tenkaichi", "legend"];
          const m = gameStateRef.current.multiverse;
          const idx = (dims.indexOf(m.dimension) + 1) % dims.length;
          m.dimension = dims[idx];
          gameStateRef.current.screenShake = 6;
          playSound("power_up");
          spawnOnomatopoeia("次元変革!!", 640, 200, "#38bdf8");
          return;
        }
      }
    },
    [inDialogue, gameStatus, selectedChapter, handleNextDialogue, handleStartChapter, handleRestart, playSound, spawnOnomatopoeia],
  );

  return (
    <div
      onClick={handleCanvasClick}
      className="fixed inset-0 w-screen h-screen bg-black overflow-hidden select-none flex items-center justify-center cursor-pointer m-0 p-0 z-50"
    >
      <canvas
        ref={canvasRef}
        width={1280}
        height={720}
        className="w-full h-full object-contain block bg-black"
      />

      {/* Couche d'effets de particules GPU */}
      <KiExplosionEffect
        triggerKey={explosionKey}
        color={explosionColor}
        radius={220}
        particleCount={64}
      />
    </div>
  );
}
