"use client";

import { useState, useTransition } from "react";
import { sfx } from "@/lib/sfx";
import { KiShock } from "@/components/games/KiFx";
import { BTN_SECONDARY, INPUT, PANEL } from "@/components/games/planche";
import fx from "@/components/games/games.module.css";

// Pierre/Feuille/Ciseaux thématisés "techniques de Ki" Dragon Ball.
const CHOICES = [
  { value: "pierre", label: "Pierre", emoji: "🪨", ki: "Genki-Dama" },
  { value: "feuille", label: "Feuille", emoji: "📄", ki: "Kienzan" },
  { value: "ciseaux", label: "Ciseaux", emoji: "✂️", ki: "Kamehameha" },
] as const;

type Choice = (typeof CHOICES)[number]["value"];

type ApiResult =
  | {
      ok: true;
      player: Choice;
      bot: Choice;
      result: "win" | "lose" | "draw";
      delta: number;
      balance: number;
    }
  | { ok: false; error: string };

// Écaille pour la victoire, rouge étoile pour la défaite, os pour l'égalité.
const RESULT_TEXT = {
  win: { label: "Victoire", color: "text-dbz-green", border: "border-l-dbz-green" },
  lose: { label: "Défaite", color: "text-dbz-red", border: "border-l-dbz-red" },
  draw: { label: "Égalité", color: "text-white", border: "border-l-white/40" },
} as const;

const emojiOf = (value: Choice) => CHOICES.find((c) => c.value === value)?.emoji;

export function PfcGame() {
  const [stake, setStake] = useState<string>("");
  const [history, setHistory] = useState<ApiResult[]>([]);
  const [clash, setClash] = useState(0);
  const [pending, startTransition] = useTransition();

  function play(choice: Choice) {
    const parsedStake = stake ? Number(stake) : undefined;
    if (parsedStake !== undefined && (!Number.isFinite(parsedStake) || parsedStake < 1)) {
      setHistory((h) => [
        { ok: false, error: "Mise refusée : entre un nombre entier de Zénis, 1 au minimum." },
        ...h,
      ]);
      return;
    }
    sfx.click();
    startTransition(async () => {
      try {
        const res = await fetch("/api/bot-user/games/pfc/play", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ choice, stake: parsedStake }),
        });
        const data = (await res.json()) as ApiResult;
        if (!res.ok && "error" in data === false) {
          setHistory((h) => [
            { ok: false, error: `Le bot n'a pas répondu (HTTP ${res.status}). Rejoue le coup.` },
            ...h,
          ]);
          return;
        }
        setHistory((h) => [data, ...h.slice(0, 19)]);
        if (data.ok) {
          setClash((c) => c + 1);
          if (data.result === "win") sfx.win();
          else if (data.result === "lose") sfx.lose();
          else sfx.draw();
        }
      } catch {
        setHistory((h) => [
          { ok: false, error: "Connexion perdue avec le bot. Vérifie ton réseau puis rejoue." },
          ...h,
        ]);
      }
    });
  }

  const last = history[0];
  const lastSuccess = last && last.ok ? last : null;

  return (
    <div className="space-y-6">
      <div className={`${PANEL} p-5 sm:p-6`}>
        <label className="mb-5 block">
          <span className="text-sm font-semibold text-white/85">Mise (optionnelle, en Zénis)</span>
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

        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {CHOICES.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => play(c.value)}
              disabled={pending}
              aria-label={`${c.label} (${c.ki})`}
              className={`${BTN_SECONDARY} min-h-24! flex-col gap-1! px-2! py-3`}
            >
              <span className="text-3xl" aria-hidden>
                {c.emoji}
              </span>
              <span>{c.label}</span>
              <span className="text-[0.6875rem] font-normal text-white/60">{c.ki}</span>
            </button>
          ))}
        </div>
      </div>

      {lastSuccess && (
        <div
          role="status"
          className={`${PANEL} relative overflow-hidden border-l-4 p-5 sm:p-6 ${RESULT_TEXT[lastSuccess.result].border} ${
            lastSuccess.result === "lose" ? fx.shake : ""
          }`}
        >
          {/* Onde de choc du duel + flash sur victoire : réponses au coup joué. */}
          <KiShock
            trigger={clash || null}
            color={
              lastSuccess.result === "win"
                ? "green"
                : lastSuccess.result === "lose"
                  ? "red"
                  : "yellow"
            }
            flash={lastSuccess.result === "win"}
          />
          <div className="relative z-10 mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <span
              className={`font-display text-3xl font-bold ${RESULT_TEXT[lastSuccess.result].color}`}
            >
              {RESULT_TEXT[lastSuccess.result].label}
            </span>
            <span className="text-sm tabular-nums text-white/70">
              Solde : {lastSuccess.balance} Ƶ
            </span>
          </div>
          <div
            className={`relative z-10 flex items-center gap-6 py-4 text-5xl ${fx.impactIn}`}
            key={clash}
          >
            <span aria-label={`Ton coup : ${lastSuccess.player}`}>
              {emojiOf(lastSuccess.player)}
            </span>
            <span className="font-display text-2xl font-bold text-dbz-orange">contre</span>
            <span aria-label={`Coup du bot : ${lastSuccess.bot}`}>{emojiOf(lastSuccess.bot)}</span>
          </div>
          {lastSuccess.delta !== 0 && (
            <p
              className={`relative z-10 text-xl font-bold tabular-nums ${lastSuccess.delta > 0 ? "text-dbz-green" : "text-dbz-red"}`}
            >
              {lastSuccess.delta > 0 ? "+" : ""}
              {lastSuccess.delta} Ƶ
            </p>
          )}
        </div>
      )}

      {last && !last.ok && (
        <p role="alert" className={`${PANEL} border-l-4 border-l-dbz-red p-4 text-sm text-white`}>
          {last.error}
        </p>
      )}

      {history.length > 1 && (
        <div className={`${PANEL} p-4`}>
          <h3 className="mb-2 text-sm font-semibold text-white/85">Historique</h3>
          <ul className="max-h-48 space-y-1 overflow-y-auto text-sm tabular-nums">
            {history.slice(1).map((h, i) =>
              h.ok ? (
                <li key={i} className="flex flex-wrap gap-3">
                  <span className={RESULT_TEXT[h.result].color}>{RESULT_TEXT[h.result].label}</span>
                  <span>
                    {emojiOf(h.player)} contre {emojiOf(h.bot)}
                  </span>
                  {h.delta !== 0 && (
                    <span className={h.delta > 0 ? "text-dbz-green" : "text-dbz-red"}>
                      {h.delta > 0 ? "+" : ""}
                      {h.delta} Ƶ
                    </span>
                  )}
                </li>
              ) : (
                <li key={i} className="text-white/70">
                  {h.error}
                </li>
              ),
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
