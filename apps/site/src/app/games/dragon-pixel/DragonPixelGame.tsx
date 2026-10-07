// SPDX-License-Identifier: Apache-2.0
"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  createGame,
  step,
  type FighterStyle,
  type FighterId,
  type ArenaId,
  type GameMode,
  type GameState,
  type GameInput,
  FIGHTERS,
  STORY_CHAPTERS,
} from "./engine";

const STYLES: { id: FighterStyle; label: string; desc: string }[] = [
  { id: "balanced", label: "Équilibré (Goku)", desc: "Vitesse et puissance équilibrées." },
  { id: "speed", label: "Vitesse (Gohan / Trunks)", desc: "Déplacements fulgurants et réflexes vifs." },
  { id: "power", label: "Puissance (Vegeta / Broly)", desc: "Dégâts bruts colossaux et impacts lourds." },
];

const FIGHTER_ROSTER: { id: FighterId; name: string; avatar: string; emblem: string }[] = [
  { id: "goku", name: "Son Goku", avatar: "/dbz/characters/goku.webp", emblem: "龜" },
  { id: "vegeta", name: "Vegeta", avatar: "/dbz/characters/vegeta.webp", emblem: "ベ" },
  { id: "gohan", name: "Son Gohan", avatar: "/dbz/characters/gohan.webp", emblem: "飯" },
  { id: "piccolo", name: "Piccolo", avatar: "/dbz/characters/piccolo.webp", emblem: "魔" },
  { id: "trunks", name: "Trunks", avatar: "/dbz/characters/trunks.webp", emblem: "CC" },
  { id: "frieza", name: "Freezer", avatar: "/dbz/characters/freezer.webp", emblem: "悪" },
  { id: "cell", name: "Cell", avatar: "/dbz/characters/celula.webp", emblem: "RR" },
  { id: "buu", name: "Majin Buu", avatar: "/dbz/characters/majin-buu.webp", emblem: "M" },
];

const ARENA_NAMES: Record<ArenaId, { name: string; desc: string }> = {
  paozu: { name: "Mont Paozu", desc: "Forêts et pics rocheux de l'enfance de Goku." },
  budokai: { name: "Arène du Tenkaichi Budokai", desc: "Le ring officiel du championnat d'arts martiaux." },
  wasteland: { name: "Terres Désolées", desc: "Canyons et mesas arides des grands duels Saiyans." },
  namek: { name: "Planète Namek", desc: "Ciel émeraude et arbres Ajisa sous les trois soleils." },
  cell_games: { name: "Cell Games Arena", desc: "Le ring de roche taillé au cordeau par Cell." },
  kaiohshin: { name: "Monde des Kaiohshin", desc: "Le royaume céleste éternel des dieux de la création." },
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

export default function DragonPixelGame() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [mode, setMode] = useState<GameMode>("story");
  const [selectedFighter, setSelectedFighter] = useState<FighterId>("goku");
  const [selectedChapter, setSelectedChapter] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [inDialogue, setInDialogue] = useState(true);
  const [dialogueIndex, setDialogueIndex] = useState(0);
  const [gameStatus, setGameStatus] = useState<"playing" | "won" | "lost">("playing");

  const gameStateRef = useRef<GameState>(createGame(selectedFighter, mode, selectedChapter));
  const heldKeysRef = useRef<Set<keyof GameInput>>(new Set());
  const activePointersRef = useRef<Map<number, keyof GameInput>>(new Map());
  const animationFrameRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const audioContextRef = useRef<AudioContext | null>(null);

  // Synthétiseur d'effets sonores Web Audio natif (zéro dépendance)
  const playSound = useCallback((type: "punch" | "blast" | "charge" | "vanish" | "transform" | "clash") => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
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
        osc.frequency.setValueAtTime(480, now);
        osc.frequency.exponentialRampToValueAtTime(120, now + 0.25);
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.25);
        osc.start(now);
        osc.stop(now + 0.25);
      } else if (type === "charge") {
        osc.type = "sine";
        osc.frequency.setValueAtTime(140, now);
        osc.frequency.linearRampToValueAtTime(360, now + 0.15);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.15);
        osc.start(now);
        osc.stop(now + 0.15);
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
  }, []);

  // Rendu de l'arrière-plan selon l'arène sélectionnée
  const drawArena = (ctx: CanvasRenderingContext2D, arena: ArenaId) => {
    if (arena === "paozu") {
      // Mont Paozu (Tome 1)
      const grad = ctx.createLinearGradient(0, 0, 0, 400);
      grad.addColorStop(0, "#48cae4");
      grad.addColorStop(0.65, "#90e0ef");
      grad.addColorStop(1, "#2d6a4f");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 960, 400);

      // Collines rondes de Toriyama
      ctx.fillStyle = "#52b788";
      ctx.beginPath();
      ctx.arc(200, 380, 160, Math.PI, 0);
      ctx.arc(480, 410, 200, Math.PI, 0);
      ctx.arc(820, 390, 170, Math.PI, 0);
      ctx.fill();

      // Sol d'herbe
      ctx.fillStyle = "#2d6a4f";
      ctx.fillRect(0, 330, 960, 70);
      ctx.fillStyle = "#40916c";
      ctx.fillRect(0, 330, 960, 8);
    } else if (arena === "budokai") {
      // Arène du Tenkaichi Budokai (Tomes 4 & 16)
      const grad = ctx.createLinearGradient(0, 0, 0, 400);
      grad.addColorStop(0, "#0077b6");
      grad.addColorStop(0.6, "#90e0ef");
      grad.addColorStop(1, "#e0e1dd");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 960, 400);

      // Ciel avec nuages Toriyama
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.ellipse(320, 90, 80, 30, 0, 0, Math.PI * 2);
      ctx.ellipse(750, 70, 100, 35, 0, 0, Math.PI * 2);
      ctx.fill();

      // Murs et dallage de l'arène
      ctx.fillStyle = "#d3d3d3";
      ctx.fillRect(0, 330, 960, 70);
      ctx.strokeStyle = "#8d99ae";
      ctx.lineWidth = 2;
      for (let x = 0; x < 960; x += 60) {
        ctx.strokeRect(x, 330, 60, 70);
      }
      ctx.fillStyle = "#e63946";
      ctx.fillRect(440, 332, 80, 4); // Ligne centrale du ring
    } else if (arena === "namek") {
      // Planète Namek (Tomes 23 & 27)
      const grad = ctx.createLinearGradient(0, 0, 0, 400);
      grad.addColorStop(0, "#2ec4b6");
      grad.addColorStop(0.6, "#cbf3f0");
      grad.addColorStop(1, "#00b4d8");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 960, 400);

      // Trois soleils pâles
      ctx.fillStyle = "#fdffb6";
      ctx.beginPath();
      ctx.arc(280, 70, 22, 0, Math.PI * 2);
      ctx.arc(680, 90, 18, 0, Math.PI * 2);
      ctx.arc(820, 50, 14, 0, Math.PI * 2);
      ctx.fill();

      // Arbres Ajisa caractéristiques de Toriyama
      ctx.fillStyle = "#0077b6";
      for (let i = 0; i < 4; i++) {
        const ax = 120 + i * 240;
        ctx.fillRect(ax - 4, 250, 8, 80);
        ctx.beginPath();
        ctx.ellipse(ax, 240, 38, 22, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // Sol bleu-vert Namek
      ctx.fillStyle = "#0096c7";
      ctx.fillRect(0, 330, 960, 70);
      ctx.fillStyle = "#48cae4";
      ctx.fillRect(0, 330, 960, 6);
    } else if (arena === "cell_games") {
      // Arène du Cell Games (Tome 34)
      const grad = ctx.createLinearGradient(0, 0, 0, 400);
      grad.addColorStop(0, "#3d5a80");
      grad.addColorStop(0.65, "#98c1d9");
      grad.addColorStop(1, "#293241");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 960, 400);

      // Piliers de roche d'angle taillés par Cell
      ctx.fillStyle = "#98c1d9";
      ctx.fillRect(140, 210, 24, 120);
      ctx.fillRect(790, 210, 24, 120);

      // Dallage en blocs carrés
      ctx.fillStyle = "#e0e1dd";
      ctx.fillRect(0, 330, 960, 70);
      ctx.strokeStyle = "#415a77";
      ctx.lineWidth = 3;
      for (let x = 60; x < 900; x += 80) {
        ctx.strokeRect(x, 330, 80, 70);
      }
    } else if (arena === "kaiohshin") {
      // Royaume des Kaiohshin (Tome 42)
      const grad = ctx.createLinearGradient(0, 0, 0, 400);
      grad.addColorStop(0, "#4a0e4e");
      grad.addColorStop(0.6, "#b5179e");
      grad.addColorStop(1, "#7209b7");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 960, 400);

      // Ciel céleste et planètes lointaines
      ctx.fillStyle = "#f72585";
      ctx.beginPath();
      ctx.arc(800, 80, 45, 0, Math.PI * 2);
      ctx.fill();

      // Sol violet sacré
      ctx.fillStyle = "#3a0ca3";
      ctx.fillRect(0, 330, 960, 70);
      ctx.fillStyle = "#7209b7";
      ctx.fillRect(0, 330, 960, 8);
    } else {
      // Terres désolées / Canyons (Défaut)
      const grad = ctx.createLinearGradient(0, 0, 0, 400);
      grad.addColorStop(0, "#d97706");
      grad.addColorStop(0.65, "#fef3c7");
      grad.addColorStop(1, "#78350f");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 960, 400);

      // Mesas et falaises en strates
      ctx.fillStyle = "#b45309";
      ctx.fillRect(100, 230, 140, 100);
      ctx.fillRect(680, 200, 180, 130);

      // Sol ocre craquelé
      ctx.fillStyle = "#78350f";
      ctx.fillRect(0, 330, 960, 70);
      ctx.fillStyle = "#92400e";
      ctx.fillRect(0, 330, 960, 8);
    }
  };

  // Rendu soigné d'un combattant style Toriyama
  const drawFighterSprite = (
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
    ctx.scale(facing, 1);

    const def = FIGHTERS[fighterId] ?? FIGHTERS.goku;
    const isSuperSaiyan = transformed > 0;

    // Aura de Ki & Éclairs
    if (isCharging || isSuperSaiyan) {
      const auraColor = isSuperSaiyan ? "#ffd700" : (isCharging ? "#90e0ef" : "#ffffff");
      ctx.strokeStyle = auraColor;
      ctx.lineWidth = isSuperSaiyan ? 4 : 2;
      ctx.shadowColor = auraColor;
      ctx.shadowBlur = isSuperSaiyan ? 16 : 8;

      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const ang = (i / 8) * Math.PI * 2;
        const rad = 28 + Math.sin(Date.now() * 0.015 + i) * 6;
        ctx.lineTo(Math.cos(ang) * rad, -25 + Math.sin(ang) * rad * 1.4);
      }
      ctx.closePath();
      ctx.stroke();

      // Éclairs bleus pour SSJ2 / SSJ3
      if (isSuperSaiyan) {
        ctx.strokeStyle = "#00f5d4";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        const t = Date.now() * 0.02;
        ctx.moveTo(-20 + Math.sin(t) * 10, -50);
        ctx.lineTo(-12, -35);
        ctx.lineTo(-24, -20);
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
    }

    // Effet de garde
    if (isGuarding) {
      ctx.fillStyle = "rgba(0, 180, 216, 0.35)";
      ctx.strokeStyle = "#00b4d8";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(10, -25, 34, -Math.PI / 2, Math.PI / 2);
      ctx.fill();
      ctx.stroke();
    }

    // Corps & Gi (Pixel art Toriyama encré)
    const giColor = isSuperSaiyan ? "#ff8800" : def.themeColor;
    const skinColor = fighterId === "piccolo" ? "#40916c" : (fighterId === "buu" ? "#f72585" : "#fed7aa");

    // Jambes
    ctx.fillStyle = giColor;
    ctx.fillRect(-12, -10, 10, 12);
    ctx.fillRect(2, -10, 10, 12);

    // Bottines
    ctx.fillStyle = "#1e293b";
    ctx.fillRect(-13, 0, 12, 5);
    ctx.fillRect(2, 0, 12, 5);

    // Buste & Ceinture
    ctx.fillStyle = giColor;
    ctx.fillRect(-10, -32, 20, 23);
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(-11, -19, 22, 5); // Ceinture bleue marine / noire

    // Tête
    ctx.fillStyle = skinColor;
    ctx.fillRect(-8, -48, 16, 16);

    // Yeux manga
    ctx.fillStyle = isSuperSaiyan ? "#00f5d4" : "#0f172a";
    ctx.fillRect(2, -43, 4, 3);

    // Chevelure caractéristique Toriyama
    ctx.fillStyle = isSuperSaiyan ? "#ffd700" : "#111827";
    if (fighterId === "vegeta") {
      // Cheveux flammes érigés
      ctx.beginPath();
      ctx.moveTo(-9, -48);
      ctx.lineTo(-14, -68);
      ctx.lineTo(-3, -58);
      ctx.lineTo(6, -72);
      ctx.lineTo(8, -58);
      ctx.lineTo(14, -64);
      ctx.lineTo(9, -48);
      ctx.closePath();
      ctx.fill();
    } else if (fighterId === "piccolo") {
      // Antennes Namek
      ctx.fillStyle = "#2d6a4f";
      ctx.fillRect(-4, -53, 3, 6);
      ctx.fillRect(3, -53, 3, 6);
    } else {
      // Cheveux Goku épis emblématiques
      ctx.beginPath();
      ctx.moveTo(-9, -48);
      ctx.lineTo(-20, -56);
      ctx.lineTo(-9, -54);
      ctx.lineTo(-14, -66);
      ctx.lineTo(0, -60);
      ctx.lineTo(12, -68);
      ctx.lineTo(9, -52);
      ctx.lineTo(16, -56);
      ctx.lineTo(8, -48);
      ctx.closePath();
      ctx.fill();
    }

    // Bras et poings
    ctx.fillStyle = skinColor;
    ctx.fillRect(isGuarding ? 4 : 12, -28, 9, 8);

    ctx.restore();
  };

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

    // 1. Décor d'arène
    drawArena(ctx, g.arena);

    // 2. Joueur
    const p = g.player;
    const isCharging = heldKeysRef.current.has("charge");
    drawFighterSprite(
      ctx,
      p.x,
      p.y,
      p.facing,
      p.fighterId,
      p.transformed,
      p.guarding,
      isCharging,
    );

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
        // Faisceau continu (Kamehameha / Final Flash)
        const bWidth = s.width || 120;
        const bHeight = s.height || 22;
        const bx = s.vx > 0 ? s.x - bWidth : s.x;
        ctx.fillRect(bx, s.y - bHeight / 2, bWidth, bHeight);

        // Noyau blanc brillant
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(bx, s.y - bHeight / 4, bWidth, bHeight / 2);
      } else {
        // Kikōha sphérique
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

      // Boule de plasma au centre du choc
      const grad = ctx.createRadialGradient(cx, cy, 5, cx, cy, 45);
      grad.addColorStop(0, "#ffffff");
      grad.addColorStop(0.4, "#00f5d4");
      grad.addColorStop(1, "rgba(247, 37, 133, 0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, 45, 0, Math.PI * 2);
      ctx.fill();

      // Jauge de Tug of War (Bras de fer énergétique)
      ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
      ctx.fillRect(360, 45, 240, 22);
      ctx.strokeStyle = "#ffd700";
      ctx.lineWidth = 2;
      ctx.strokeRect(360, 45, 240, 22);

      // Curseur de force
      const barX = 480 + (g.clash.tension / 100) * 110;
      ctx.fillStyle = g.clash.tension > 0 ? "#00f5d4" : "#f72585";
      ctx.fillRect(Math.min(480, barX), 47, Math.abs(barX - 480), 18);

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 13px JetBrains Mono, monospace";
      ctx.textAlign = "center";
      ctx.fillText("⚡ MATRAQUEZ LES TOUCHES ! ⚡", 480, 35);
      ctx.restore();
    }

    // 6. HUD Supérieur (Barres de vie, Ki, Scouter)
    // Joueur (Gauche)
    ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
    ctx.fillRect(20, 16, 260, 42);
    ctx.strokeStyle = "#f85b1a";
    ctx.lineWidth = 2;
    ctx.strokeRect(20, 16, 260, 42);

    // PV Joueur
    ctx.fillStyle = "#22c55e";
    const hpRatio = Math.max(0, p.hp / p.maxHp);
    ctx.fillRect(24, 20, 252 * hpRatio, 16);

    // Ki Joueur
    ctx.fillStyle = "#00b4d8";
    const kiRatio = Math.max(0, p.energy / p.maxEnergy);
    ctx.fillRect(24, 40, 252 * kiRatio, 12);

    // Emblème & Nom Joueur
    const pDef = FIGHTERS[p.fighterId] ?? FIGHTERS.goku;
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 12px JetBrains Mono, monospace";
    ctx.textAlign = "left";
    ctx.fillText(`${pDef.name} [${pDef.emblemId.toUpperCase()}]`, 25, 12);

    // Adversaire / Boss (Droite)
    if (g.enemies.length > 0) {
      const e = g.enemies[0];
      const eDef = FIGHTERS[e.fighterId ?? "piccolo"] ?? FIGHTERS.piccolo;
      ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
      ctx.fillRect(680, 16, 260, 42);
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = 2;
      ctx.strokeRect(680, 16, 260, 42);

      // PV Ennemi
      ctx.fillStyle = "#ef4444";
      const eMax = e.maxHp ?? 100;
      const eHpRatio = Math.max(0, e.hp / eMax);
      ctx.fillRect(684 + 252 * (1 - eHpRatio), 20, 252 * eHpRatio, 16);

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 12px JetBrains Mono, monospace";
      ctx.textAlign = "right";
      const enemyLabel = g.mode === "story" ? (STORY_CHAPTERS[g.currentChapterId - 1]?.enemyName ?? eDef.name) : eDef.name;
      ctx.fillText(enemyLabel, 935, 12);
    }

    // Scouter Power Level (Centre-Haut)
    ctx.fillStyle = "rgba(0, 245, 212, 0.9)";
    ctx.font = "bold 14px JetBrains Mono, monospace";
    ctx.textAlign = "center";
    ctx.fillText(`SCOUTER POWER : ${p.powerLevel.toLocaleString()}`, 480, 22);

    // Score & Mode
    ctx.fillStyle = "#ffd700";
    ctx.font = "12px JetBrains Mono, monospace";
    ctx.fillText(
      g.mode === "story"
        ? `TOME ${STORY_CHAPTERS[g.currentChapterId - 1]?.tome ?? 1} — CH. ${g.currentChapterId} / 15`
        : `VAGUE ${g.wave} / 5 — SCORE : ${g.score}`,
      480,
      38,
    );

    ctx.restore();
  }, []);

  // Boucle de mise à jour physique (60 FPS)
  useEffect(() => {
    let animId: number;

    const loop = (timestamp: number) => {
      if (!lastTimeRef.current) lastTimeRef.current = timestamp;
      const dt = (timestamp - lastTimeRef.current) / 1000;
      lastTimeRef.current = timestamp;

      if (isPlaying && !isPaused && !inDialogue) {
        const input: GameInput = {};
        for (const k of heldKeysRef.current) input[k] = true;
        for (const k of activePointersRef.current.values()) input[k] = true;

        step(gameStateRef.current, input, dt);

        if (input.punch) playSound("punch");
        if (input.blast || input.special) playSound("blast");
        if (input.charge) playSound("charge");
        if (input.vanish) playSound("vanish");
        if (input.transform) playSound("transform");
        if (input.mash) playSound("clash");

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

  // Gestion des touches du clavier
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
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
  }, []);

  const handleStartChapter = (chapId: number) => {
    setSelectedChapter(chapId);
    gameStateRef.current = createGame(selectedFighter, "story", chapId);
    setGameStatus("playing");
    setDialogueIndex(0);
    setInDialogue(true);
    setIsPlaying(true);
    setIsPaused(false);
  };

  const handleNextDialogue = () => {
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
        }
      }
    }
  };

  const currentChap = STORY_CHAPTERS[selectedChapter - 1] ?? STORY_CHAPTERS[0];
  const currentDialogue =
    gameStatus === "won"
      ? currentChap.victoryDialogue[dialogueIndex]
      : currentChap.introDialogue[dialogueIndex];

  return (
    <div className="flex flex-col items-center w-full max-w-5xl mx-auto p-4 space-y-6">
      {/* Barre supérieure : Sélecteur de Mode */}
      <div className="flex flex-wrap items-center justify-between w-full bg-slate-900/90 border border-amber-500/30 rounded-xl p-4 shadow-xl">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-full bg-amber-500 flex items-center justify-center font-bold text-slate-950 text-xl shadow-lg">
            龜
          </div>
          <div>
            <h2 className="text-xl font-black text-amber-400 tracking-wide font-mono">
              DRAGON PIXEL — TORIYAMA MASTER EDITION
            </h2>
            <p className="text-xs text-slate-400">
              Manga Story Mode (42 Tomes) · 8 Guerriers · Ki Clashes · Moteur Rétro 60 FPS
            </p>
          </div>
        </div>

        <div className="flex space-x-2">
          {(["story", "arcade", "survival", "dojo"] as GameMode[]).map((m) => (
            <button
              key={m}
              onClick={() => {
                setMode(m);
                gameStateRef.current = createGame(selectedFighter, m, selectedChapter);
                setIsPlaying(true);
                setInDialogue(m === "story");
              }}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg uppercase tracking-wider transition-all ${
                mode === m
                  ? "bg-amber-500 text-slate-950 shadow-md font-mono"
                  : "bg-slate-800 text-slate-300 hover:bg-slate-700"
              }`}
            >
              {m === "story" ? "Histoire (42 Tomes)" : m}
            </button>
          ))}
        </div>
      </div>

      {/* Écran Canvas de Jeu */}
      <div className="relative w-full aspect-[960/400] max-h-[520px] bg-slate-950 rounded-2xl overflow-hidden border-2 border-amber-500/40 shadow-2xl">
        <canvas
          ref={canvasRef}
          width={960}
          height={400}
          className="w-full h-full object-contain block"
        />

        {/* Boîte de Dialogue Manga (Cutscenes du Mode Histoire) */}
        {inDialogue && isPlaying && currentDialogue && (
          <div className="absolute inset-x-6 bottom-6 bg-slate-900/95 border-2 border-amber-400 p-5 rounded-2xl shadow-2xl backdrop-blur-md flex items-center space-x-5 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="w-16 h-16 rounded-xl bg-amber-500/20 border border-amber-400/50 flex-shrink-0 flex items-center justify-center font-black text-2xl text-amber-400 font-mono">
              {currentDialogue.speaker.charAt(0)}
            </div>
            <div className="flex-1 space-y-1">
              <div className="flex items-center space-x-2">
                <span className="font-bold text-amber-400 text-sm font-mono uppercase">
                  {currentDialogue.speaker}
                </span>
                <span className="text-xs text-slate-400">
                  [{currentChap.title}]
                </span>
              </div>
              <p className="text-slate-100 text-sm md:text-base font-serif leading-relaxed">
                « {currentDialogue.text} »
              </p>
            </div>
            <button
              onClick={handleNextDialogue}
              className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs uppercase tracking-wider rounded-xl shadow-lg transition-transform active:scale-95"
            >
              Continuer →
            </button>
          </div>
        )}

        {/* Écran de Victoire / Défaite */}
        {!isPlaying && (
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center space-y-4">
            <h3 className="text-3xl font-black text-amber-400 tracking-wider font-mono">
              DRAGON PIXEL
            </h3>
            <p className="text-sm text-slate-300 max-w-md text-center">
              Revivez chaque saga du manga d&apos;Akira Toriyama, du Chapitre 1 avec Bulma jusqu&apos;au combat final contre Majin Buu.
            </p>
            <button
              onClick={() => {
                gameStateRef.current = createGame(selectedFighter, mode, selectedChapter);
                setIsPlaying(true);
                setInDialogue(mode === "story");
              }}
              className="px-8 py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-base uppercase tracking-widest rounded-xl shadow-2xl transition-transform hover:scale-105"
            >
              COMMENCER LE COMBAT
            </button>
          </div>
        )}
      </div>

      {/* Roster des Combattants */}
      <div className="w-full bg-slate-900/80 border border-slate-800 rounded-xl p-4 space-y-3">
        <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider font-mono">
          Sélection du Guerrier
        </h4>
        <div className="grid grid-cols-4 sm:grid-cols-8 gap-3">
          {FIGHTER_ROSTER.map((f) => (
            <button
              key={f.id}
              onClick={() => {
                setSelectedFighter(f.id);
                gameStateRef.current = createGame(f.id, mode, selectedChapter);
              }}
              className={`flex flex-col items-center p-2 rounded-xl border transition-all ${
                selectedFighter === f.id
                  ? "bg-amber-500/20 border-amber-400 shadow-md scale-105"
                  : "bg-slate-800/60 border-slate-700/60 hover:bg-slate-800"
              }`}
            >
              <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center font-bold text-amber-400 text-sm">
                {f.emblem}
              </div>
              <span className="text-[11px] font-bold text-slate-200 mt-1 truncate">
                {f.name}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Mode Histoire : Sélecteur des 15 Chapitres (Tomes 1 à 42) */}
      {mode === "story" && (
        <div className="w-full bg-slate-900/80 border border-slate-800 rounded-xl p-4 space-y-3">
          <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider font-mono">
            Mode Histoire Canonique — Les 42 Tomes d&apos;Akira Toriyama
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 md:grid-cols-5 gap-2 max-h-56 overflow-y-auto pr-1">
            {STORY_CHAPTERS.map((c) => (
              <button
                key={c.id}
                onClick={() => handleStartChapter(c.id)}
                className={`p-2.5 text-left rounded-lg border transition-all ${
                  selectedChapter === c.id
                    ? "bg-amber-500 text-slate-950 border-amber-400 font-bold shadow-md"
                    : "bg-slate-800/70 border-slate-700/60 text-slate-300 hover:bg-slate-800"
                }`}
              >
                <div className="text-[10px] uppercase font-mono opacity-80">
                  Tome {c.tome} · {c.saga}
                </div>
                <div className="text-xs font-bold truncate mt-0.5">{c.title}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Guide des Commandes & Contrôles */}
      <div className="w-full grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs bg-slate-900/60 border border-slate-800/80 rounded-xl p-4 font-mono">
        <div>
          <span className="text-amber-400 font-bold block">Déplacements</span>
          <span className="text-slate-300">Q / D ou Flèches · Espace (Saut)</span>
        </div>
        <div>
          <span className="text-amber-400 font-bold block">Combat</span>
          <span className="text-slate-300">J (Poing Combo) · K (Kikōha)</span>
        </div>
        <div>
          <span className="text-amber-400 font-bold block">Défense & Ki</span>
          <span className="text-slate-300">I (Garde) · U (Z-Vanish) · L (Charge)</span>
        </div>
        <div>
          <span className="text-amber-400 font-bold block">Super & Ultime</span>
          <span className="text-slate-300">O (Kamehameha) · T (Super Saiyan)</span>
        </div>
      </div>
    </div>
  );
}
