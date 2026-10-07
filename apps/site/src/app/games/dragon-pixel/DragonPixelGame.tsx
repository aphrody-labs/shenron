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
  FIGHTERS,
  STORY_CHAPTERS,
} from "./engine";

const CHARACTER_ASSETS: Record<FighterId, string> = {
  goku: "/dbz/characters/goku.webp",
  vegeta: "/dbz/characters/vegeta.webp",
  gohan: "/dbz/characters/gohan.webp",
  piccolo: "/dbz/characters/piccolo.webp",
  trunks: "/dbz/characters/trunks.webp",
  frieza: "/dbz/characters/freezer.webp",
  cell: "/dbz/characters/celula.webp",
  buu: "/dbz/characters/majin-buu.webp",
};

const TRANSFORMATION_ASSETS: Record<FighterId, string> = {
  goku: "/dbz/transformations/goku-ssj.webp",
  vegeta: "/dbz/transformations/vegeta-ssj.webp",
  gohan: "/dbz/transformations/gohan-ssj2.webp",
  piccolo: "/dbz/transformations/piccolo-orange.webp",
  trunks: "/dbz/transformations/trunks-ssj.webp",
  frieza: "/dbz/transformations/freezer-perfect-form-golden.webp",
  cell: "/dbz/transformations/super-perfect-form.webp",
  buu: "/dbz/transformations/majin-buu-pure.webp",
};

const ARENA_BACKDROPS: Record<ArenaId, string> = {
  paozu: "/dbz/planets/tierra.webp",
  budokai: "/dbz/planets/tierra.webp",
  wasteland: "/dbz/planets/tierra.webp",
  namek: "/dbz/planets/namek.webp",
  cell_games: "/dbz/planets/tierra.webp",
  kaiohshin: "/dbz/planets/planeta-sagrado.webp",
};

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
};

interface WasmEngineInstance {
  step: (inputJson: string, dt: f32) => string;
  get_render_packet_json: () => string;
  restart: () => void;
  set_chapter: (chapterId: number) => void;
  set_fighter: (fighterId: string) => void;
}

type f32 = number;

export default function DragonPixelGame() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [mode] = useState<GameMode>("story");
  const [selectedFighter, setSelectedFighter] = useState<FighterId>("goku");
  const [selectedChapter, setSelectedChapter] = useState(1);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [inDialogue, setInDialogue] = useState(true);
  const [dialogueIndex, setDialogueIndex] = useState(0);
  const [gameStatus, setGameStatus] = useState<"playing" | "won" | "lost">("playing");

  const gameStateRef = useRef<GameState>(createGame(selectedFighter, mode, selectedChapter));
  const heldKeysRef = useRef<Set<keyof GameInput>>(new Set());
  const lastTimeRef = useRef<number>(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const imagesRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const wasmEngineRef = useRef<WasmEngineInstance | null>(null);

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

  // Préchargement de tous les assets officiels DBXV
  useEffect(() => {
    const allUrls = [
      ...Object.values(CHARACTER_ASSETS),
      ...Object.values(TRANSFORMATION_ASSETS),
      ...Object.values(ARENA_BACKDROPS),
    ];
    for (const url of allUrls) {
      const img = new Image();
      img.src = url;
      imagesRef.current.set(url, img);
    }
  }, []);

  // Chargement du moteur WebAssembly haute performance
  useEffect(() => {
    let active = true;
    const initWasm = async () => {
      try {
        if (typeof window === "undefined") return;
        const importFn = new Function("url", "return import(url)");
        const wasmModule = await importFn("/wasm/dragon-pixel/dragon_pixel_engine.js");
        await wasmModule.default("/wasm/dragon-pixel/dragon_pixel_engine_bg.wasm");
        if (active) {
          wasmEngineRef.current = new wasmModule.DragonPixelEngineWasm(
            selectedFighter,
            mode,
            selectedChapter,
            "paozu",
          ) as WasmEngineInstance;
        }
      } catch {
        // Repli transparent sur la simulation pure TypeScript
      }
    };
    initWasm();
    return () => {
      active = false;
    };
  }, [selectedFighter, mode, selectedChapter]);

  // Synthétiseur d'effets sonores Web Audio natif
  const playSound = useCallback(
    (type: "punch" | "blast" | "charge" | "vanish" | "transform" | "clash") => {
      try {
        if (!audioContextRef.current) {
          audioContextRef.current = new (
            window.AudioContext ||
            (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
          )();
        }
        const ctx = audioContextRef.current;
        if (ctx.state === "suspended") {
          ctx.resume();
        }

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);

        const now = ctx.currentTime;

        if (type === "punch") {
          osc.type = "triangle";
          osc.frequency.setValueAtTime(160, now);
          osc.frequency.exponentialRampToValueAtTime(40, now + 0.12);
          gain.gain.setValueAtTime(0.35, now);
          gain.gain.linearRampToValueAtTime(0.01, now + 0.12);
          osc.start(now);
          osc.stop(now + 0.12);
        } else if (type === "blast") {
          osc.type = "sawtooth";
          osc.frequency.setValueAtTime(440, now);
          osc.frequency.exponentialRampToValueAtTime(110, now + 0.2);
          gain.gain.setValueAtTime(0.25, now);
          gain.gain.linearRampToValueAtTime(0.01, now + 0.2);
          osc.start(now);
          osc.stop(now + 0.2);
        } else if (type === "vanish") {
          osc.type = "sine";
          osc.frequency.setValueAtTime(880, now);
          osc.frequency.exponentialRampToValueAtTime(180, now + 0.18);
          gain.gain.setValueAtTime(0.3, now);
          gain.gain.linearRampToValueAtTime(0.01, now + 0.18);
          osc.start(now);
          osc.stop(now + 0.18);
        } else if (type === "transform") {
          osc.type = "sawtooth";
          osc.frequency.setValueAtTime(220, now);
          osc.frequency.exponentialRampToValueAtTime(740, now + 0.5);
          gain.gain.setValueAtTime(0.4, now);
          gain.gain.linearRampToValueAtTime(0.01, now + 0.5);
          osc.start(now);
          osc.stop(now + 0.5);
        } else if (type === "clash") {
          osc.type = "square";
          osc.frequency.setValueAtTime(200 + Math.random() * 100, now);
          gain.gain.setValueAtTime(0.3, now);
          gain.gain.linearRampToValueAtTime(0.01, now + 0.1);
          osc.start(now);
          osc.stop(now + 0.1);
        }
      } catch {
        // Audio silencieux si non autorisé
      }
    },
    [],
  );

  // Rendu de l'arrière-plan avec les vrais assets de planète DBXV
  const drawArena = useCallback(
    (ctx: CanvasRenderingContext2D, arena: ArenaId) => {
      // 1. Dégradé atmosphérique du ciel
      const grad = ctx.createLinearGradient(0, 0, 0, 400);
      if (arena === "namek") {
        grad.addColorStop(0, "#065a60");
        grad.addColorStop(0.7, "#1b998b");
        grad.addColorStop(1, "#2ec4b6");
      } else if (arena === "kaiohshin") {
        grad.addColorStop(0, "#4a0e4e");
        grad.addColorStop(0.7, "#b5179e");
        grad.addColorStop(1, "#7209b7");
      } else {
        grad.addColorStop(0, "#1e293b");
        grad.addColorStop(0.7, "#334155");
        grad.addColorStop(1, "#475569");
      }
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 960, 400);

      // 2. Vrai asset de planète DBXV en arrière-plan
      const planetPath = ARENA_BACKDROPS[arena] ?? ARENA_BACKDROPS.paozu;
      const planetImg = getImage(planetPath);
      if (planetImg) {
        ctx.save();
        ctx.globalAlpha = 0.45;
        const pSize = 220;
        ctx.drawImage(planetImg, 960 - pSize - 40, 30, pSize, pSize);
        ctx.restore();
      }

      // 3. Sol d'arène fidèle
      if (arena === "namek") {
        ctx.fillStyle = "#14532d";
        ctx.fillRect(0, 330, 960, 70);
        ctx.fillStyle = "#16a34a";
        ctx.fillRect(0, 330, 960, 8);
      } else if (arena === "budokai" || arena === "cell_games") {
        ctx.fillStyle = "#cbd5e1";
        ctx.fillRect(0, 330, 960, 70);
        ctx.strokeStyle = "#64748b";
        ctx.lineWidth = 2;
        for (let x = 0; x < 960; x += 60) {
          ctx.strokeRect(x, 330, 60, 70);
        }
      } else if (arena === "kaiohshin") {
        ctx.fillStyle = "#3a0ca3";
        ctx.fillRect(0, 330, 960, 70);
        ctx.fillStyle = "#7209b7";
        ctx.fillRect(0, 330, 960, 8);
      } else {
        ctx.fillStyle = "#78350f";
        ctx.fillRect(0, 330, 960, 70);
        ctx.fillStyle = "#b45309";
        ctx.fillRect(0, 330, 960, 8);
      }
    },
    [getImage],
  );

  // Rendu d'un combattant avec les vrais assets officiels DBXV
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
    ) => {
      ctx.save();
      ctx.translate(x, y);

      // Orientation gauche/droite
      if (facing < 0) {
        ctx.scale(-1, 1);
      }

      const isSuperSaiyan = transformed > 0;
      const def = FIGHTERS[fighterId] ?? FIGHTERS.goku;

      // Ombre portée au sol
      ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
      ctx.beginPath();
      ctx.ellipse(0, 0, 24, 6, 0, 0, Math.PI * 2);
      ctx.fill();

      // Aura de Ki & Éclairs de transformation
      if (isCharging || isSuperSaiyan) {
        const auraColor = isSuperSaiyan ? "#ffd700" : isCharging ? "#00f5d4" : "#ffffff";
        ctx.save();
        ctx.strokeStyle = auraColor;
        ctx.lineWidth = isSuperSaiyan ? 4 : 2;
        ctx.shadowColor = auraColor;
        ctx.shadowBlur = isSuperSaiyan ? 20 : 10;

        ctx.beginPath();
        for (let i = 0; i < 10; i++) {
          const ang = (i / 10) * Math.PI * 2;
          const rad = 36 + Math.sin(Date.now() * 0.02 + i * 1.5) * 8;
          const ax = Math.cos(ang) * rad;
          const ay = -45 + Math.sin(ang) * rad * 1.3;
          if (i === 0) ctx.moveTo(ax, ay);
          else ctx.lineTo(ax, ay);
        }
        ctx.closePath();
        ctx.stroke();

        // Éclairs SSJ2 / SSJ3
        if (isSuperSaiyan) {
          ctx.strokeStyle = "#00f5d4";
          ctx.lineWidth = 2;
          ctx.beginPath();
          const t = Date.now() * 0.03;
          ctx.moveTo(-22 + Math.sin(t) * 12, -75);
          ctx.lineTo(-10, -50);
          ctx.lineTo(-26, -30);
          ctx.stroke();
        }
        ctx.restore();
      }

      // Bouclier d'énergie de garde
      if (isGuarding) {
        ctx.save();
        ctx.fillStyle = "rgba(0, 180, 216, 0.3)";
        ctx.strokeStyle = "#00b4d8";
        ctx.lineWidth = 3;
        ctx.shadowColor = "#00b4d8";
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(15, -45, 45, -Math.PI / 2, Math.PI / 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }

      // Vrai asset officiel DBXV (Portrait / Render haute résolution)
      const assetPath = isSuperSaiyan
        ? TRANSFORMATION_ASSETS[fighterId] || CHARACTER_ASSETS[fighterId]
        : CHARACTER_ASSETS[fighterId];
      const img = getImage(assetPath);

      if (img) {
        ctx.save();
        const targetHeight = 96;
        const targetWidth = (img.naturalWidth / img.naturalHeight) * targetHeight;
        ctx.drawImage(img, -targetWidth / 2, -targetHeight, targetWidth, targetHeight);
        ctx.restore();
      } else {
        // Silhouette de repli le temps du chargement
        ctx.fillStyle = isSuperSaiyan ? "#ffb703" : def.themeColor;
        ctx.fillRect(-14, -80, 28, 80);
      }

      ctx.restore();
    },
    [getImage],
  );

  // Boucle de rendu principal
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const g = gameStateRef.current;

    // Secousse d'écran (Screen Shake)
    ctx.save();
    if (g.screenShake > 0) {
      const sx = (Math.random() - 0.5) * g.screenShake * 3;
      const sy = (Math.random() - 0.5) * g.screenShake * 3;
      ctx.translate(sx, sy);
    }

    ctx.clearRect(0, 0, 960, 400);

    // 1. Décor d'arène avec les vraies planètes
    drawArena(ctx, g.arena);

    // 2. Joueur
    const p = g.player;
    const isCharging = heldKeysRef.current.has("charge");
    drawFighterSprite(ctx, p.x, p.y, p.facing, p.fighterId, p.transformed, p.guarding, isCharging);

    // 3. Ennemis
    for (const e of g.enemies) {
      drawFighterSprite(
        ctx,
        e.x,
        e.y,
        e.facing ?? -1,
        e.fighterId ?? "piccolo",
        e.formLevel ?? 0,
        e.guarding ?? false,
        false,
      );
    }

    // 4. Projectiles & Rayons
    for (const s of g.shots) {
      ctx.save();
      ctx.fillStyle = s.color || "#00b4d8";
      ctx.shadowColor = s.color || "#00b4d8";
      ctx.shadowBlur = s.isBeam ? 18 : 8;

      if (s.isBeam) {
        const bWidth = s.width || 120;
        const bHeight = s.height || 22;
        const bx = s.vx > 0 ? s.x - bWidth : s.x;
        ctx.fillRect(bx, s.y - bHeight / 2, bWidth, bHeight);

        ctx.fillStyle = "#ffffff";
        ctx.fillRect(bx, s.y - bHeight / 4, bWidth, bHeight / 2);
      } else {
        ctx.beginPath();
        ctx.arc(s.x, s.y, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(s.x, s.y, 4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // 5. Mini-Jeu de Beam Clash (Choc d'énergie)
    if (g.clash && g.clash.active) {
      ctx.save();
      const cx = g.clash.x;
      const cy = g.clash.y;

      const grad = ctx.createRadialGradient(cx, cy, 5, cx, cy, 45);
      grad.addColorStop(0, "#ffffff");
      grad.addColorStop(0.4, "#00f5d4");
      grad.addColorStop(1, "rgba(247, 37, 133, 0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, 45, 0, Math.PI * 2);
      ctx.fill();

      // Jauge de lutte énergétique
      ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
      ctx.fillRect(360, 45, 240, 22);
      ctx.strokeStyle = "#ffd700";
      ctx.lineWidth = 2;
      ctx.strokeRect(360, 45, 240, 22);

      const barX = 480 + (g.clash.tension / 100) * 110;
      ctx.fillStyle = g.clash.tension > 0 ? "#00f5d4" : "#f72585";
      ctx.fillRect(Math.min(480, barX), 47, Math.abs(barX - 480), 18);

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 13px JetBrains Mono, monospace";
      ctx.textAlign = "center";
      ctx.fillText("⚡ MATRAQUEZ LES TOUCHES ! ⚡", 480, 35);
      ctx.restore();
    }

    // 6. HUD Supérieur avec Vrais Portraits DBXV
    // Joueur (Gauche)
    const pDef = FIGHTERS[p.fighterId] ?? FIGHTERS.goku;
    const pImg = getImage(CHARACTER_ASSETS[p.fighterId]);
    if (pImg) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(38, 38, 22, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(pImg, 16, 16, 44, 44);
      ctx.restore();
      ctx.strokeStyle = "#ffd700";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(38, 38, 22, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
    ctx.fillRect(68, 16, 220, 42);
    ctx.strokeStyle = "#f85b1a";
    ctx.lineWidth = 2;
    ctx.strokeRect(68, 16, 220, 42);

    // PV Joueur
    ctx.fillStyle = "#22c55e";
    const hpRatio = Math.max(0, p.hp / p.maxHp);
    ctx.fillRect(72, 20, 212 * hpRatio, 16);

    // Ki Joueur
    ctx.fillStyle = "#00b4d8";
    const kiRatio = Math.max(0, p.energy / p.maxEnergy);
    ctx.fillRect(72, 40, 212 * kiRatio, 12);

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 12px JetBrains Mono, monospace";
    ctx.textAlign = "left";
    ctx.fillText(`${pDef.name} [${pDef.emblemId.toUpperCase()}]`, 70, 12);

    // Adversaire / Boss (Droite)
    if (g.enemies.length > 0) {
      const e = g.enemies[0];
      const eFighterId = e.fighterId ?? "piccolo";
      const eDef = FIGHTERS[eFighterId] ?? FIGHTERS.piccolo;
      const eImg = getImage(CHARACTER_ASSETS[eFighterId] ?? CHARACTER_ASSETS.piccolo);

      if (eImg) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(922, 38, 22, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(eImg, 900, 16, 44, 44);
        ctx.restore();
        ctx.strokeStyle = "#ef4444";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(922, 38, 22, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
      ctx.fillRect(672, 16, 220, 42);
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = 2;
      ctx.strokeRect(672, 16, 220, 42);

      // PV Ennemi
      ctx.fillStyle = "#ef4444";
      const eMax = e.maxHp ?? 100;
      const eHpRatio = Math.max(0, e.hp / eMax);
      ctx.fillRect(676 + 212 * (1 - eHpRatio), 20, 212 * eHpRatio, 16);

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 12px JetBrains Mono, monospace";
      ctx.textAlign = "right";
      const enemyLabel =
        g.mode === "story"
          ? (STORY_CHAPTERS[g.currentChapterId - 1]?.enemyName ?? eDef.name)
          : eDef.name;
      ctx.fillText(enemyLabel, 890, 12);
    }

    // Scouter Power Level (Centre)
    ctx.fillStyle = "rgba(0, 245, 212, 0.9)";
    ctx.font = "bold 14px JetBrains Mono, monospace";
    ctx.textAlign = "center";
    ctx.fillText(`SCOUTER POWER : ${p.powerLevel.toLocaleString()}`, 480, 22);

    ctx.fillStyle = "#ffd700";
    ctx.font = "12px JetBrains Mono, monospace";
    ctx.fillText(
      g.mode === "story"
        ? `TOME ${STORY_CHAPTERS[g.currentChapterId - 1]?.tome ?? 1} — CH. ${g.currentChapterId} / 15`
        : `VAGUE ${g.wave} / 5 — SCORE : ${g.score}`,
      480,
      40,
    );

    // 7. Écran de Victoire / Défaite directement dans le Canvas
    if (!isPlaying || g.status !== "playing") {
      ctx.save();
      ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
      ctx.fillRect(0, 0, 960, 400);

      ctx.fillStyle = g.status === "won" ? "#ffd700" : g.status === "lost" ? "#ef4444" : "#ffffff";
      ctx.font = "900 48px JetBrains Mono, monospace";
      ctx.textAlign = "center";
      ctx.shadowColor = ctx.fillStyle;
      ctx.shadowBlur = 18;
      const bannerText =
        g.status === "won" ? "VICTOIRE !" : g.status === "lost" ? "K.O. - DÉFAITE" : "DRAGON PIXEL";
      ctx.fillText(bannerText, 480, 190);

      ctx.shadowBlur = 0;
      ctx.fillStyle = "#e2e8f0";
      ctx.font = "bold 16px JetBrains Mono, monospace";
      ctx.fillText(
        g.status === "won"
          ? "Appuyez sur ESPACE ou touchez l'écran pour continuer"
          : "Appuyez sur ESPACE ou touchez l'écran pour rejouer",
        480,
        240,
      );
      ctx.restore();
    }

    ctx.restore();
  }, [drawArena, drawFighterSprite, getImage, isPlaying]);

  // Boucle de jeu 60 FPS
  useEffect(() => {
    let animId: number;

    const loop = (timestamp: number) => {
      if (!lastTimeRef.current) lastTimeRef.current = timestamp;
      const dt = Math.min((timestamp - lastTimeRef.current) / 1000, 0.1);
      lastTimeRef.current = timestamp;

      if (isPlaying && !isPaused && !inDialogue) {
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

        // Synchronisation moteur WebAssembly
        if (wasmEngineRef.current) {
          try {
            wasmEngineRef.current.step(JSON.stringify(input), dt);
          } catch {
            // Repli sur le moteur TS
          }
        }

        step(gameStateRef.current, input, dt);

        if (input.punch) playSound("punch");
        else if (input.blast) playSound("blast");
        else if (input.vanish) playSound("vanish");
        else if (input.transform) playSound("transform");
        else if (input.mash) playSound("clash");

        const g = gameStateRef.current;
        setGameStatus((prev) => (prev !== g.status ? g.status : prev));
        if (g.status === "won" && mode === "story") {
          setInDialogue(true);
        }
      }

      renderCanvas();
      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [isPlaying, isPaused, inDialogue, mode, playSound, renderCanvas]);

  const handleStartChapter = useCallback(
    (chapId: number) => {
      setSelectedChapter(chapId);
      gameStateRef.current = createGame(selectedFighter, "story", chapId);
      setGameStatus("playing");
      setDialogueIndex(0);
      setInDialogue(true);
      setIsPlaying(true);
      setIsPaused(false);
      if (wasmEngineRef.current) {
        try {
          wasmEngineRef.current.set_chapter(chapId);
        } catch {
          // Repli
        }
      }
    },
    [selectedFighter],
  );

  const handleRestart = useCallback(() => {
    gameStateRef.current = createGame(selectedFighter, mode, selectedChapter);
    setGameStatus("playing");
    setDialogueIndex(0);
    setInDialogue(mode === "story");
    setIsPlaying(true);
    setIsPaused(false);
    if (wasmEngineRef.current) {
      try {
        wasmEngineRef.current.restart();
      } catch {
        // Repli
      }
    }
  }, [selectedFighter, mode, selectedChapter]);

  const handleNextDialogue = useCallback(() => {
    const chap = STORY_CHAPTERS[selectedChapter - 1];
    if (!chap) return;
    const isIntro = gameStatus === "playing";
    const dialogueList = isIntro ? chap.introDialogue : chap.victoryDialogue;

    if (dialogueIndex + 1 < dialogueList.length) {
      setDialogueIndex((i) => i + 1);
    } else {
      setInDialogue(false);
      if (gameStatus === "won") {
        if (selectedChapter < 15) {
          handleStartChapter(selectedChapter + 1);
        } else {
          handleRestart();
        }
      }
    }
  }, [selectedChapter, gameStatus, dialogueIndex, handleStartChapter, handleRestart]);

  // Clavier
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (inDialogue && (e.key === " " || e.key === "Enter")) {
        e.preventDefault();
        handleNextDialogue();
        return;
      }
      if (gameStatus !== "playing" && (e.key === " " || e.key === "Enter")) {
        e.preventDefault();
        if (gameStatus === "won" && selectedChapter < 15) {
          handleStartChapter(selectedChapter + 1);
        } else {
          handleRestart();
        }
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
  ]);

  const handleCanvasClick = () => {
    if (inDialogue) {
      handleNextDialogue();
      return;
    }
    if (gameStatus !== "playing") {
      if (gameStatus === "won" && selectedChapter < 15) {
        handleStartChapter(selectedChapter + 1);
      } else {
        handleRestart();
      }
    }
  };

  const currentChap = STORY_CHAPTERS[selectedChapter - 1] ?? STORY_CHAPTERS[0];
  const currentDialogue =
    gameStatus === "won"
      ? currentChap.victoryDialogue[dialogueIndex]
      : currentChap.introDialogue[dialogueIndex];

  return (
    <div
      onClick={handleCanvasClick}
      className="fixed inset-0 w-screen h-screen bg-black overflow-hidden select-none flex items-center justify-center cursor-pointer m-0 p-0 z-50"
    >
      <canvas
        ref={canvasRef}
        width={960}
        height={400}
        className="w-full h-full object-contain block"
      />

      {/* Boîte de Dialogue Manga Cutscene (Mode Histoire) */}
      {inDialogue && isPlaying && currentDialogue && (
        <div
          onClick={(e) => {
            e.stopPropagation();
            handleNextDialogue();
          }}
          className="absolute inset-x-6 md:inset-x-16 bottom-6 bg-slate-950/95 border-2 border-amber-400 p-4 md:p-6 rounded-2xl shadow-2xl backdrop-blur-md flex items-center space-x-4 md:space-x-6 z-10"
        >
          <div className="w-14 h-14 md:w-16 md:h-16 rounded-xl bg-amber-500/20 border border-amber-400/50 flex-shrink-0 flex items-center justify-center font-black text-2xl text-amber-400 font-mono">
            {currentDialogue.speaker.charAt(0)}
          </div>
          <div className="flex-1 space-y-1">
            <div className="flex items-center space-x-2">
              <span className="font-bold text-amber-400 text-sm md:text-base font-mono uppercase">
                {currentDialogue.speaker}
              </span>
              <span className="text-xs text-slate-400 font-mono">[{currentChap.title}]</span>
            </div>
            <p className="text-slate-100 text-sm md:text-lg font-serif leading-relaxed">
              « {currentDialogue.text} »
            </p>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleNextDialogue();
            }}
            className="px-4 py-2 md:px-6 md:py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs md:text-sm uppercase tracking-wider rounded-xl shadow-lg transition-transform active:scale-95"
          >
            Suivant →
          </button>
        </div>
      )}
    </div>
  );
}
