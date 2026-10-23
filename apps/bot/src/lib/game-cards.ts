/**
 * Cartes des jeux de devinette (pendu, bingo), construites sur la primitive de carte de jeu
 * du module de rendu (`~/render`) : même identité visuelle que les cartes de profil et de
 * classement. Les appelants (`Pendu.ts`, `Bingo.ts`) passent `labels` déjà localisés ; sans
 * eux, les libellés français historiques ci-dessous servent de repli le temps de la
 * migration des commandes vers les dictionnaires (lot L6), puis disparaissent.
 */
import { renderCardOnPool, type GameBlock, type Tone, type TileCell } from "~/render";
import type { RenderOptions } from "~/render";
import { DIFFICULTY_LABELS, type GameDifficulty } from "~/services/games/difficulty";

type GameCardStatus = "playing" | "won" | "lost";

const DIFFICULTY_TONES: Record<GameDifficulty, Tone> = {
  facile: "warn",
  normal: "neutral",
  difficile: "bad",
};

export interface PenduCardLabels {
  title: string;
  hint: (category: string) => string;
  noHint: string;
  lives: string;
  won: string;
  lost: string;
  difficulty: Record<GameDifficulty, string>;
}

export interface BingoCardLabels {
  title: string;
  range: (min: number, max: number) => string;
  attempts: string;
  higher: string;
  lower: string;
  found: (target: number) => string;
  revealed: (target: number) => string;
  won: string;
  lost: string;
  difficulty: Record<GameDifficulty, string>;
}

/** Libellés français d'avant l'internationalisation des jeux (à retirer avec le lot L6). */
const LEGACY_PENDU: PenduCardLabels = {
  title: "Pendu",
  hint: (category) => `Indice : ${category}`,
  noHint: "Aucun indice",
  lives: "Vies",
  won: "Victoire",
  lost: "Défaite",
  difficulty: DIFFICULTY_LABELS,
};

const LEGACY_BINGO: BingoCardLabels = {
  title: "Bingo",
  range: (min, max) => `Nombre entre ${min} et ${max}`,
  attempts: "Essais",
  higher: "Plus haut",
  lower: "Plus bas",
  found: (target) => `Trouvé : ${target}`,
  revealed: (target) => `C'était ${target}`,
  won: "Victoire",
  lost: "Défaite",
  difficulty: DIFFICULTY_LABELS,
};

const statusOf = (
  status: GameCardStatus,
  labels: { won: string; lost: string },
): { label: string; tone: Tone } | null =>
  status === "playing"
    ? null
    : status === "won"
      ? { label: labels.won, tone: "warn" }
      : { label: labels.lost, tone: "bad" };

// ─── Pendu ──────────────────────────────────────────────────────────────────

export interface PenduCardInput {
  word: string;
  found: ReadonlySet<string>;
  missed: ReadonlySet<string>;
  errors: number;
  maxErrors: number;
  status: GameCardStatus;
  level: GameDifficulty;
  category: string | null;
  labels?: Partial<PenduCardLabels>;
}

export async function renderPenduCard(
  input: PenduCardInput,
  options: RenderOptions = {},
): Promise<Buffer> {
  const labels = { ...LEGACY_PENDU, ...input.labels };
  const cells: TileCell[] = [...input.word].map((char) => {
    if (char === " ") return { char, state: "gap" };
    if (input.found.has(char)) return { char, state: "revealed" };
    return { char, state: input.status !== "playing" ? "missed" : "hidden" };
  });
  const blocks: GameBlock[] = [
    { type: "tiles", cells },
    {
      type: "lives",
      label: labels.lives,
      total: input.maxErrors,
      left: Math.max(0, input.maxErrors - input.errors),
    },
    {
      type: "keyboard",
      rows: ["abcdefghijklm", "nopqrstuvwxyz"],
      hit: input.found,
      miss: input.missed,
    },
  ];
  const card = await renderCardOnPool(
    "game",
    {
      title: labels.title,
      subtitle: input.category ? labels.hint(input.category) : labels.noHint,
      badge: { label: labels.difficulty[input.level], tone: DIFFICULTY_TONES[input.level] },
      status: statusOf(input.status, labels),
      blocks,
    },
    options,
  );
  return card.buffer;
}

// ─── Bingo ──────────────────────────────────────────────────────────────────

export interface BingoCardInput {
  min: number;
  max: number;
  range: { lo: number; hi: number };
  guesses: ReadonlyArray<{ value: number; hint: "higher" | "lower" | "match" }>;
  attemptsUsed: number | null;
  maxAttempts: number | null;
  status: GameCardStatus;
  level: GameDifficulty;
  target?: number;
  lastHint?: "higher" | "lower" | "match" | null;
  labels?: Partial<BingoCardLabels>;
}

export async function renderBingoCard(
  input: BingoCardInput,
  options: RenderOptions = {},
): Promise<Buffer> {
  const labels = { ...LEGACY_BINGO, ...input.labels };
  const blocks: GameBlock[] = [
    {
      type: "range",
      min: input.min,
      max: input.max,
      lo: input.range.lo,
      hi: input.range.hi,
      guesses: input.guesses.map((guess) => ({
        value: guess.value,
        tone: guess.hint === "match" ? "good" : "bad",
      })),
      target: input.status !== "playing" ? input.target : undefined,
    },
  ];
  if (input.maxAttempts !== null && input.attemptsUsed !== null) {
    blocks.push({
      type: "pips",
      label: labels.attempts,
      total: input.maxAttempts,
      used: input.attemptsUsed,
    });
  }
  if (input.status === "won" && input.target !== undefined) {
    blocks.push({ type: "callout", text: labels.found(input.target), tone: "warn" });
  } else if (input.status === "lost" && input.target !== undefined) {
    blocks.push({ type: "callout", text: labels.revealed(input.target), tone: "bad" });
  } else if (input.lastHint === "higher" || input.lastHint === "lower") {
    blocks.push({
      type: "callout",
      text: input.lastHint === "higher" ? labels.higher : labels.lower,
    });
  }
  const card = await renderCardOnPool(
    "game",
    {
      title: labels.title,
      subtitle: labels.range(input.min, input.max),
      badge: { label: labels.difficulty[input.level], tone: DIFFICULTY_TONES[input.level] },
      status: statusOf(input.status, labels),
      blocks,
    },
    options,
  );
  return card.buffer;
}
