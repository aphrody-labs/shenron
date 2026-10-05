"use client";

import { useRef, useState, useTransition, type KeyboardEvent } from "react";
import { sfx } from "@/lib/sfx";
import { KiShock } from "@/components/games/KiFx";
import { BTN_PRIMARY, BTN_SECONDARY, FOCUS, INPUT, PANEL } from "@/components/games/planche";
import fx from "@/components/games/games.module.css";
import { nextGridIndex } from "@/components/games/grid-nav";
import { useT } from "@/components/T";

type Cell = "." | "X" | "O";
type Outcome =
  | { kind: "playing" }
  | { kind: "won"; mark: "X" | "O"; line: number[] }
  | { kind: "draw" };

type ApiState = {
  board: Cell[];
  sig: string;
  ts: number;
  stake: number;
  outcome: Outcome;
  botCell?: number | null;
  delta?: number;
  balance?: number;
};

type ApiError = { error: string };

// Écaille pour la victoire, rouge étoile pour la défaite, os pour l'égalité.
const OUTCOME_LABEL: Record<string, { label: string; color: string; border: string }> = {
  "won-X": { label: "Victoire", color: "text-dbz-green", border: "border-l-dbz-green" },
  "won-O": { label: "Défaite", color: "text-dbz-red", border: "border-l-dbz-red" },
  draw: { label: "Égalité", color: "text-white", border: "border-l-white/40" },
};

/**
 * Case du plateau. Une case jouée ou une partie finie est `aria-disabled` et
 * non `disabled` : un bouton désactivé sort de l'ordre de focus, et la
 * navigation aux flèches (tabIndex tournant) butait sur chaque case remplie.
 */
function CellButton({
  value,
  highlighted,
  disabled,
  label,
  focusable,
  onClick,
  onKeyDown,
  onFocus,
  buttonRef,
}: {
  value: Cell;
  highlighted: boolean;
  disabled: boolean;
  label: string;
  focusable: boolean;
  onClick: () => void;
  onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => void;
  onFocus: () => void;
  buttonRef: (el: HTMLButtonElement | null) => void;
}) {
  const empty = value === ".";
  const inert = disabled || !empty;
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={() => {
        if (!inert) onClick();
      }}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
      tabIndex={focusable ? 0 : -1}
      aria-disabled={inert}
      aria-label={label}
      className={`flex aspect-square min-h-11 items-center justify-center rounded-lg border text-5xl font-bold transition-colors ${FOCUS} ${
        highlighted
          ? "border-dbz-green bg-dbz-green/15 text-dbz-green"
          : empty
            ? "border-white/12 text-dbz-orange hover:border-dbz-orange/70"
            : value === "X"
              ? "border-dbz-blue-light/60 bg-dbz-blue-light/10 text-dbz-blue-light"
              : "border-dbz-orange/60 bg-dbz-orange/10 text-dbz-orange"
      } aria-disabled:cursor-not-allowed`}
    >
      <span aria-hidden>{empty ? "" : value}</span>
    </button>
  );
}

export function MorpionGame() {
  const t = useT();
  const [state, setState] = useState<ApiState | null>(null);
  // Case qui porte l'unique arrêt de tabulation du plateau.
  const [focusCell, setFocusCell] = useState(4);
  const cells = useRef<Array<HTMLButtonElement | null>>([]);
  const [stake, setStake] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [endPulse, setEndPulse] = useState(0);
  const [pending, startTransition] = useTransition();

  async function call(payload: {
    cell?: number;
    state?: { board: string; sig: string; ts: number };
    stake?: number;
  }): Promise<ApiState | null> {
    const res = await fetch("/api/bot-user/games/morpion/move", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await res.json()) as ApiState | ApiError;
    if ("error" in data) {
      setError(data.error);
      return null;
    }
    setError(null);
    return data;
  }

  function startNew() {
    const parsedStake = stake ? Number(stake) : undefined;
    if (parsedStake !== undefined && (!Number.isFinite(parsedStake) || parsedStake < 1)) {
      setError("Mise refusée : entre un nombre entier de Zénis, 1 au minimum.");
      return;
    }
    startTransition(async () => {
      const next = await call({ stake: parsedStake });
      if (next) setState(next);
    });
  }

  function play(cell: number) {
    if (!state) return;
    if (state.outcome.kind !== "playing") return;
    sfx.click();
    startTransition(async () => {
      const next = await call({
        cell,
        state: { board: state.board.join(""), sig: state.sig, ts: state.ts },
        stake: state.stake || undefined,
      });
      if (next) {
        setState(next);
        if (next.outcome.kind === "won") {
          setEndPulse((p) => p + 1);
          if (next.outcome.mark === "X") sfx.win();
          else sfx.lose();
        } else if (next.outcome.kind === "draw") {
          setEndPulse((p) => p + 1);
          sfx.draw();
        }
      }
    });
  }

  function onCellKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = nextGridIndex(index, e.key);
    if (next === null) return;
    e.preventDefault();
    setFocusCell(next);
    cells.current[next]?.focus();
  }

  const cellLabel = (v: Cell, i: number) =>
    t("communaute.jeux.morpion.cell", {
      row: Math.floor(i / 3) + 1,
      col: (i % 3) + 1,
      state: v === "." ? t("communaute.jeux.morpion.empty") : v,
    });

  const winLine = state?.outcome.kind === "won" ? state.outcome.line : [];
  const finishedKey =
    state?.outcome.kind === "won"
      ? `won-${state.outcome.mark}`
      : state?.outcome.kind === "draw"
        ? "draw"
        : null;

  return (
    <div className="space-y-6">
      {!state && (
        <div className={`${PANEL} space-y-4 p-5 sm:p-6`}>
          <p className="text-sm text-white/75">Tu joues les X, le bot les O. Tu commences.</p>
          <label className="block">
            <span className="text-sm font-semibold text-white/85">
              Mise (optionnelle, en Zénis)
            </span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={1_000_000}
              value={stake}
              onChange={(e) => setStake(e.target.value)}
              placeholder="Par défaut : +100 en cas de victoire, −50 en cas de défaite"
              className={`${INPUT} mt-2 tabular-nums`}
              disabled={pending}
            />
          </label>
          <button
            type="button"
            onClick={startNew}
            disabled={pending}
            className={`${BTN_PRIMARY} w-full`}
          >
            {pending ? "Préparation…" : "Nouvelle partie"}
          </button>
        </div>
      )}

      {state && (
        <>
          <div className={`${PANEL} relative overflow-hidden p-5 sm:p-6`}>
            <div className="mb-3 flex items-center justify-between text-sm font-semibold">
              <span className="text-dbz-blue-light">X : toi</span>
              <span className="text-dbz-orange">O : le bot</span>
            </div>
            {/* Onde de choc + flash quand le duel se résout : réponse au dernier coup. */}
            <KiShock
              trigger={endPulse || null}
              color={
                state.outcome.kind === "won"
                  ? state.outcome.mark === "X"
                    ? "green"
                    : "red"
                  : "yellow"
              }
              flash={state.outcome.kind === "won" && state.outcome.mark === "X"}
            />
            <div
              role="group"
              aria-label={t("communaute.jeux.morpion.board")}
              className="relative z-10 grid grid-cols-3 gap-2"
            >
              {state.board.map((v, i) => (
                <CellButton
                  key={i}
                  value={v}
                  label={cellLabel(v, i)}
                  highlighted={winLine.includes(i)}
                  disabled={pending || state.outcome.kind !== "playing"}
                  focusable={focusCell === i}
                  onClick={() => play(i)}
                  onKeyDown={(e) => onCellKeyDown(e, i)}
                  onFocus={() => setFocusCell(i)}
                  buttonRef={(el) => {
                    cells.current[i] = el;
                  }}
                />
              ))}
            </div>
          </div>

          {finishedKey && (
            <div
              role="status"
              className={`${PANEL} border-l-4 p-5 sm:p-6 ${OUTCOME_LABEL[finishedKey].border} ${
                finishedKey === "won-O" ? fx.shake : ""
              }`}
            >
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <span
                  className={`font-display text-3xl font-bold ${OUTCOME_LABEL[finishedKey].color}`}
                >
                  {OUTCOME_LABEL[finishedKey].label}
                </span>
                {state.balance !== undefined && (
                  <span className="text-sm tabular-nums text-white/70">
                    Solde : {state.balance} Ƶ
                  </span>
                )}
              </div>
              {state.delta !== undefined && state.delta !== 0 && (
                <p
                  className={`text-xl font-bold tabular-nums ${state.delta > 0 ? "text-dbz-green" : "text-dbz-red"}`}
                >
                  {state.delta > 0 ? "+" : ""}
                  {state.delta} Ƶ
                </p>
              )}
              <button
                type="button"
                onClick={() => setState(null)}
                className={`${BTN_SECONDARY} mt-4`}
              >
                Rejouer
              </button>
            </div>
          )}
        </>
      )}

      {error && (
        <p role="alert" className={`${PANEL} border-l-4 border-l-dbz-red p-4 text-sm text-white`}>
          {error}
        </p>
      )}
    </div>
  );
}
