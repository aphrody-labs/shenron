/* oxlint-disable eslint/no-shadow, jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex, jsx-a11y/prefer-tag-over-role, react/no-array-index-key, react/set-state-in-effect -- legacy UI kept as-is (behavior-preserving lint pass) */
"use client";

import {
  useState,
  useEffect,
  useCallback,
  useId,
  useRef,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from "lucide-react";
import { DBZ_TILES } from "./tiles";
import { directionFromKey, directionFromSwipe, type Direction } from "./controls";
import { assetUrl } from "@/lib/assets";
import { sfx } from "@/lib/sfx";
import { KiShock, PowerLevel } from "@/components/games/KiFx";
import { BTN_PRIMARY } from "@/components/games/planche";
import { useT } from "@/components/T";
import fx from "@/components/games/games.module.css";

type Tile = {
  id: number;
  value: number;
  x: number;
  y: number;
  isNew: boolean;
  isMerged: boolean;
};

const GRID_SIZE = 4;

function generateId() {
  return Math.random() * 1000000;
}

/** Boutons directionnels : repli tactile et clavier du balayage. */
const PAD: ReadonlyArray<{ dir: Direction; key: string; Icon: typeof ChevronUp; cell: string }> = [
  { dir: "UP", key: "communaute.jeux.2048.up", Icon: ChevronUp, cell: "col-start-2" },
  { dir: "LEFT", key: "communaute.jeux.2048.left", Icon: ChevronLeft, cell: "col-start-1" },
  { dir: "DOWN", key: "communaute.jeux.2048.down", Icon: ChevronDown, cell: "col-start-2" },
  { dir: "RIGHT", key: "communaute.jeux.2048.right", Icon: ChevronRight, cell: "col-start-3" },
];

export default function DragonBall2048() {
  const t = useT();
  const helpId = useId();
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  // FX : pulse d'onde de choc à chaque fusion, flash + speed-lines sur record.
  const [mergePulse, setMergePulse] = useState(0);
  const [ascendFlash, setAscendFlash] = useState(0);
  const [showSpeed, setShowSpeed] = useState(false);
  const bestTile = useRef(2);

  const initializeGame = useCallback(() => {
    // Deux cases DISTINCTES : deux tirages indépendants superposaient les tuiles
    // de départ une partie sur seize, et le plateau démarrait alors avec une
    // seule case visible.
    const libres = Array.from({ length: GRID_SIZE * GRID_SIZE }, (_, i) => i);
    const depart = [0, 0].map(
      () => libres.splice(Math.floor(Math.random() * libres.length), 1)[0]!,
    );
    setTiles(
      depart.map((c) => ({
        id: generateId(),
        value: 2,
        x: c % GRID_SIZE,
        y: Math.floor(c / GRID_SIZE),
        isNew: true,
        isMerged: false,
      })),
    );
    setScore(0);
    setGameOver(false);
    setShowSpeed(false);
    bestTile.current = 2;
  }, []);

  useEffect(() => {
    initializeGame();
  }, [initializeGame]);

  // Basic 2048 logic
  const move = useCallback(
    (direction: Direction) => {
      if (gameOver) return;

      setTiles((prevTiles) => {
        let newTiles = [...prevTiles].map((t) =>
          Object.assign(t, {
            isNew: false,
            isMerged: false,
          }),
        );
        // Tuiles SURVIVANTES du coup : une tuile absorbée par une fusion doit
        // disparaître du plateau. `newTiles` la gardait (seule la ligne fusionnée
        // était reconstruite), donc chaque fusion laissait un fantôme à l'ancienne
        // place — le plateau se remplissait de doublons dès le premier coup.
        const survivants: Tile[] = [];
        let hasMoved = false;
        let didMerge = false;
        let topValue = 0;
        let currentScore = score;

        const moveInLine = (line: Tile[]) => {
          let result: Tile[] = [];
          for (let i = 0; i < line.length; i++) {
            if (line[i]) {
              if (
                result.length > 0 &&
                result[result.length - 1].value === line[i].value &&
                !result[result.length - 1].isMerged
              ) {
                result[result.length - 1].value *= 2;
                result[result.length - 1].isMerged = true;
                currentScore += result[result.length - 1].value;
                hasMoved = true;
                didMerge = true;
                if (result[result.length - 1].value > topValue)
                  topValue = result[result.length - 1].value;
              } else {
                result.push(line[i]);
              }
            }
          }
          return result;
        };

        for (let i = 0; i < GRID_SIZE; i++) {
          let line = newTiles.filter((t) =>
            direction === "UP" || direction === "DOWN" ? t.x === i : t.y === i,
          );
          line.sort((a, b) => (direction === "UP" || direction === "DOWN" ? a.y - b.y : a.x - b.x));
          if (direction === "DOWN" || direction === "RIGHT") line.reverse();

          const mergedLine = moveInLine(line);

          for (let j = 0; j < mergedLine.length; j++) {
            const targetPos = direction === "DOWN" || direction === "RIGHT" ? GRID_SIZE - 1 - j : j;
            if (direction === "UP" || direction === "DOWN") {
              if (mergedLine[j].y !== targetPos) hasMoved = true;
              mergedLine[j].y = targetPos;
            } else {
              if (mergedLine[j].x !== targetPos) hasMoved = true;
              mergedLine[j].x = targetPos;
            }
          }
          survivants.push(...mergedLine);
        }

        if (hasMoved) {
          // Add new tile
          const emptySpots = [];
          for (let x = 0; x < GRID_SIZE; x++) {
            for (let y = 0; y < GRID_SIZE; y++) {
              if (!survivants.some((t) => t.x === x && t.y === y)) emptySpots.push({ x, y });
            }
          }
          if (emptySpots.length > 0) {
            const randomSpot = emptySpots[Math.floor(Math.random() * emptySpots.length)];
            survivants.push({
              id: generateId(),
              value: Math.random() < 0.9 ? 2 : 4,
              x: randomSpot.x,
              y: randomSpot.y,
              isNew: true,
              isMerged: false,
            });
          }
          setScore(currentScore);

          // FX déférés (hors render strict-mode) : onde de choc + son de
          // fusion ; flash + speed-lines + son de victoire sur nouveau record.
          const ascended = topValue > bestTile.current;
          if (topValue > bestTile.current) bestTile.current = topValue;
          setTimeout(() => {
            if (didMerge) {
              setMergePulse((p) => p + 1);
              if (ascended) {
                setAscendFlash((p) => p + 1);
                setShowSpeed(true);
                setTimeout(() => setShowSpeed(false), 700);
                sfx.win();
              } else {
                sfx.click();
              }
            }
          }, 0);
        }

        return survivants;
      });
    },
    [gameOver, score],
  );

  // Flèches du clavier quand AUCUN élément n'a le focus (page fraîchement
  // ouverte) : on joue sans devoir d'abord cliquer le plateau. Dès qu'un champ,
  // un lien ou un bouton a le focus, les flèches lui reviennent — l'écoute sur
  // `window` confisquait sinon le curseur de tout champ de saisie de la page.
  useEffect(() => {
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      if (document.activeElement && document.activeElement !== document.body) return;
      const direction = directionFromKey(e.key);
      if (!direction) return;
      e.preventDefault();
      move(direction);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [move]);

  // Plateau focalisé : les flèches jouent, sans faire défiler la page.
  const onBoardKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const direction = directionFromKey(e.key);
    if (!direction) return;
    e.preventDefault();
    move(direction);
  };

  // Balayage en Pointer Events (doigt, souris, stylet), écouté SUR le plateau
  // seulement : posé sur l'enveloppe, un simple défilement de la page jouait un
  // coup. `touch-action: none` (plateau seul) évite que le même geste fasse
  // défiler la page ET joue le coup.
  const swipe = useRef<{ id: number; x: number; y: number } | null>(null);
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!e.isPrimary) return;
    swipe.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const start = swipe.current;
    swipe.current = null;
    if (!start || start.id !== e.pointerId) return;
    const direction = directionFromSwipe(e.clientX - start.x, e.clientY - start.y);
    if (direction) move(direction);
  };
  const onPointerCancel = () => {
    swipe.current = null;
  };

  // Simple check for game over
  useEffect(() => {
    if (gameOver) return;
    if (tiles.length === GRID_SIZE * GRID_SIZE) {
      const canMove = tiles.some((t) => {
        const neighbors = tiles.filter(
          (n) =>
            (Math.abs(n.x - t.x) === 1 && n.y === t.y) ||
            (Math.abs(n.y - t.y) === 1 && n.x === t.x),
        );
        return neighbors.some((n) => n.value === t.value);
      });
      if (!canMove) {
        setGameOver(true);
        sfx.lose();
      }
    }
  }, [tiles, gameOver]);

  // Tuile la plus puissante du plateau (pour l'aura de Ki renforcée).
  const maxValue = tiles.reduce((m, t) => Math.max(m, t.value), 0);
  const scoreText = score.toLocaleString("fr-FR");

  return (
    <div className="flex flex-col items-center text-white">
      <div className="mb-5 flex w-full max-w-md items-center justify-between gap-4">
        <p id={helpId} className="text-[0.8125rem] leading-snug text-white/60">
          {t("communaute.jeux.2048.help")}
        </p>
        <PowerLevel
          value={score}
          label="Ki total"
          className="dbz-panel shrink-0 border border-dbz-orange/50"
        />
      </div>

      {/* Annonce du score et de la fin de partie aux lecteurs d'écran : le
			    plateau est une grille d'images, rien n'y dit que le coup a compté. */}
      <p className="sr-only" aria-live="polite">
        {gameOver
          ? t("communaute.jeux.2048.gameOver", { score: scoreText })
          : t("communaute.jeux.2048.score", { score: scoreText })}
      </p>

      <div
        tabIndex={0}
        role="group"
        aria-label={t("communaute.jeux.2048.board")}
        aria-describedby={helpId}
        onKeyDown={onBoardKeyDown}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        style={{ touchAction: "none" }}
        className="relative aspect-square w-full max-w-md select-none rounded-xl border-4 border-dbz-border bg-zinc-900/80 p-3 outline-none hud-frame focus-visible:ring-4 focus-visible:ring-dbz-orange/70"
      >
        {/* Speed-lines d'énergie quand une nouvelle transformation est atteinte */}
        {showSpeed && (
          <div
            className="absolute inset-0 speed-lines z-30 pointer-events-none rounded-lg motion-reduce:hidden"
            aria-hidden
          />
        )}
        {/* Onde de choc de fusion + flash d'ascension */}
        <KiShock trigger={mergePulse || null} color="yellow" />
        {ascendFlash > 0 && <KiShock trigger={ascendFlash} color="yellow" flash />}

        <div className="grid grid-cols-4 grid-rows-4 gap-3 w-full h-full" aria-hidden>
          {Array.from({ length: GRID_SIZE * GRID_SIZE }).map((_, i) => (
            <div key={i} className="w-full h-full bg-zinc-800/50 rounded-lg" />
          ))}
        </div>

        {tiles.map((tile) => {
          const tileInfo = DBZ_TILES[tile.value] || DBZ_TILES[16384];
          const isTop = tile.value === maxValue && maxValue >= 8;
          // Aura de Ki : glow renforcé sur la tuile la plus puissante et
          // pendant la fusion (montée d'énergie).
          const glow =
            tile.isMerged || isTop
              ? `0 0 18px ${tileInfo.color}, 0 0 36px ${tileInfo.color}80`
              : `0 0 10px ${tileInfo.color}40`;
          return (
            <div
              key={tile.id}
              className="absolute motion-safe:transition-transform motion-safe:duration-150 motion-safe:ease-in-out"
              style={{
                width: "calc((100% - 2.25rem) / 4)",
                height: "calc((100% - 2.25rem) / 4)",
                transform: `translate(calc(${tile.x * 100}% + ${tile.x * 0.75}rem), calc(${tile.y * 100}% + ${tile.y * 0.75}rem))`,
                top: "0.75rem",
                left: "0.75rem",
                margin: 0,
              }}
            >
              {/* Deux couches à dessein : la POSITION vit sur l'enveloppe, les
							    animations sur la boîte intérieure. Une déclaration d'animation
							    l'emporte sur l'attribut `style` (cascade CSS) : posées sur la
							    même boîte que `transform: translate(...)`, `reveal-scale` et
							    `ki-pulse` — qui écrivent toutes deux `transform: scale(...)` —
							    EFFAÇAIENT le placement. */}
              <div
                className={`w-full h-full rounded-lg flex flex-col items-center justify-center ${
                  tile.isNew ? "motion-safe:animate-[reveal-scale_0.2s_ease-out]" : ""
                } ${tile.isMerged ? "motion-safe:animate-[ki-pulse_0.3s_ease-out]" : ""} ${
                  isTop ? "ki-pulse" : ""
                }`}
                style={{
                  backgroundColor: tileInfo.bg,
                  border: `2px solid ${tileInfo.color}`,
                  boxShadow: glow,
                }}
              >
                <div className="relative w-full h-full p-1 overflow-hidden">
                  <img
                    src={assetUrl(tileInfo.image)}
                    alt={`${tileInfo.name} (${tile.value})`}
                    draggable={false}
                    width={96}
                    height={96}
                    className="w-full h-full object-contain z-10 relative opacity-90"
                  />
                  <div className="absolute bottom-0 left-0 right-0 bg-black/60 z-20">
                    <p
                      className="text-[9px] sm:text-[11px] font-bold text-center text-white truncate px-1 font-display tracking-wide"
                      style={{ color: tileInfo.color }}
                      aria-hidden
                    >
                      {tileInfo.name}
                    </p>
                  </div>
                  {/* Power level scouter (la valeur = niveau de puissance) */}
                  <div className="absolute top-1 left-1 bg-black/80 px-1 rounded z-20" aria-hidden>
                    <p className="scouter-text text-[10px]">{tile.value}</p>
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {gameOver && (
          <div
            role="status"
            className={`absolute inset-0 z-50 flex flex-col items-center justify-center rounded-lg bg-dbz-bg/95 ${fx.shake}`}
          >
            <p className="mb-2 font-display text-5xl font-bold text-dbz-red">K.O.</p>
            <p className="mb-2 text-white/85">Plus aucun coup possible.</p>
            <p className="mb-6 text-lg font-bold tabular-nums text-white">Ki final : {scoreText}</p>
            <button type="button" onClick={initializeGame} className={BTN_PRIMARY}>
              Rejouer
            </button>
          </div>
        )}
      </div>

      {/* Pavé directionnel : repli tactile (balayage difficile) et clavier
			    (Tab puis Entrée), cibles de 48 px. */}
      <div
        role="group"
        aria-label={t("communaute.jeux.2048.controls")}
        className="mt-6 grid grid-cols-3 grid-rows-2 gap-2"
      >
        {PAD.map(({ dir, key, Icon, cell }) => (
          <button
            key={dir}
            type="button"
            onClick={() => move(dir)}
            disabled={gameOver}
            aria-label={t(key)}
            className={`${cell} ${dir === "UP" ? "row-start-1" : "row-start-2"} grid min-h-12 min-w-12 place-items-center rounded-xl border border-dbz-border bg-dbz-card text-dbz-orange transition-colors hover:border-dbz-orange focus-visible:outline-2 focus-visible:outline-dbz-orange disabled:opacity-40`}
          >
            <Icon className="h-5 w-5" aria-hidden />
          </button>
        ))}
      </div>

      <p className="mt-6 max-w-md text-center text-sm text-dbz-orange/80">
        Fusionne deux personnages identiques pour évoluer vers la transformation suivante !
      </p>
    </div>
  );
}
